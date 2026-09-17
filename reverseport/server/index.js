const net = require('net');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const { ProtocolAdapter } = require('../shared/protocol');
const { registry } = require('./registry');
const { StaticSiteFacade } = require('./staticFacade');
const { createHttpPipeline } = require('./pipeline');
const { authManager } = require('./auth');
const { TcpTunnelHub } = require('./tcpHub');

// --- CONFIGURACIÓN ---
const HTTP_PORT = parseInt(process.env.HTTP_PORT) || 80;
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT) || 443;
const TUNNEL_PORT = parseInt(process.env.TUNNEL_PORT) || 8080;
const ROOT_DOMAIN = process.env.ROOT_DOMAIN || 'reverseport.net';

// --- HUB TCP PURO (Bases de datos, SSH) ---
const tcpHub = new TcpTunnelHub(registry);

// --- SUBDOMINIOS RESERVADOS ---
const reservedSubdomains = new Set([
    'www', 'api', 'admin', 'reverseport', 'status', 'blog', 'dev', 'test',
    'google', 'apple', 'microsoft', 'nvidia', 'facebook', 'instagram', 'whatsapp',
    'paypal', 'bank', 'banco', 'visa', 'mastercard', 'amazon', 'netflix',
    'login', 'signin', 'secure', 'localhost', 'mail', 'support', 'soporte'
]);

// --- FACADE Y PIPELINE (GoF Structural / Behavioral) ---
const websitePath = path.join(__dirname, '..', 'website');
const staticFacade = new StaticSiteFacade(websitePath);
const pipeline = createHttpPipeline(staticFacade, registry, reservedSubdomains, ROOT_DOMAIN);

// --- CARGAR CERTIFICADOS SSL (Tolerante a entornos sin SSL) ---
const certPath = process.env.CERT_PATH || '/etc/letsencrypt/live/reverseport.net';
let sslOptions = null;
try {
    if (fs.existsSync(`${certPath}/privkey.pem`) && fs.existsSync(`${certPath}/fullchain.pem`)) {
        sslOptions = {
            key: fs.readFileSync(`${certPath}/privkey.pem`),
            cert: fs.readFileSync(`${certPath}/fullchain.pem`)
        };
        console.log('✅ Certificados SSL cargados satisfactoriamente.');
    } else {
        console.log('ℹ️  No se encontraron certificados SSL en', certPath, '(Modo HTTP / Test activo)');
    }
} catch (e) {
    console.error('❌ Error cargando certificados SSL:', e.message);
}

// --- TUNNEL HUB (Multiplexación con ProtocolAdapter - GoF Structural) ---
const tunnelServer = net.createServer((socket) => {
    const adapter = ProtocolAdapter.wrap(socket);

    adapter.on('message', (msg) => {
        try {
            // 1. Canal de Control HTTP / Web (Persistente)
            if (msg.type === 'control') {
                const { subdomain, apiKey } = msg;

                if (!subdomain) {
                    adapter.send({ type: 'error', message: 'Subdominio inválido' });
                    socket.destroy();
                    return;
                }

                if (reservedSubdomains.has(subdomain.toLowerCase())) {
                    adapter.send({ type: 'error', message: 'Subdominio reservado por políticas de seguridad.' });
                    socket.destroy();
                    return;
                }

                // Validación de reserva de subdominio / API Key
                const authCheck = authManager.validateTunnelAccess(subdomain, apiKey);
                if (!authCheck.allowed) {
                    adapter.send({ type: 'error', message: authCheck.reason });
                    socket.destroy();
                    return;
                }

                console.log(`[Control] Cliente conectado: ${subdomain} (VIP: ${authCheck.vip})`);
                registry.registerControl(subdomain, socket);

                socket.on('close', () => {
                    console.log(`[Control] Cliente desconectado: ${subdomain}`);
                    registry.removeControl(subdomain, socket);
                    tcpHub.releaseClientTunnels(socket);
                });
            }

            // 1.b Canal de Control TCP Puro (Postgres, MySQL, SSH)
            else if (msg.type === 'tcp_control') {
                const { localPort, preferredPort, apiKey } = msg;
                const authCheck = authManager.validateTunnelAccess('tcp-tunnel', apiKey);

                tcpHub.createTcpTunnel(socket, localPort, preferredPort)
                    .then((publicPort) => {
                        console.log(`[TCP Hub] Túnel TCP activo para puerto local ${localPort} -> puerto público ${publicPort}`);
                        adapter.send({
                            type: 'tcp_ready',
                            publicPort,
                            publicHost: ROOT_DOMAIN,
                            localPort
                        });
                    })
                    .catch((err) => {
                        adapter.send({ type: 'error', message: `Fallo al abrir túnel TCP: ${err.message}` });
                        socket.destroy();
                    });

                socket.on('close', () => {
                    tcpHub.releaseClientTunnels(socket);
                });
            }

            // 2. Canal de Datos (Efímero, 1 por request)
            else if (msg.type === 'data') {
                const { requestId } = msg;
                const pending = registry.takePendingRequest(requestId);

                if (pending) {
                    console.log(`[Data] Vinculando canal para request: ${requestId}`);
                    const { reqSocket, head } = pending;

                    // Una vez identificado como socket de datos, destruimos el adapter
                    // para permitir raw stream piping transparente de alta velocidad
                    adapter.destroy();

                    reqSocket.pipe(socket).pipe(reqSocket);

                    if (head && head.length > 0) {
                        socket.write(head);
                    }

                    reqSocket.resume();

                    reqSocket.on('error', () => { try { socket.destroy(); } catch (e) { } });
                    socket.on('error', () => { try { reqSocket.destroy(); } catch (e) { } });
                } else {
                    socket.destroy();
                }
            }
        } catch (err) {
            console.error('[Tunnel Error]', err);
            socket.destroy();
        }
    });

    adapter.on('error', () => { });
    socket.on('error', () => { });
});

tunnelServer.listen(TUNNEL_PORT, () => {
    console.log(`🚀 Hub de Túneles escuchando en el puerto ${TUNNEL_PORT}`);
});

// Helper para parsear subdominio de un header Host
function extractHostAndSubdomain(hostHeader) {
    const host = (hostHeader || '').split(':')[0].toLowerCase();
    const parts = host.split('.');
    let subdomain = parts[0];
    return { host, subdomain };
}

// Handler general para conexiones HTTP / HTTPS
function processIncomingStream(reqSocket, headData) {
    const raw = headData.toString();
    const hostMatch = raw.match(/Host:\s*([^\s:]+)/i);

    if (hostMatch) {
        const { host, subdomain } = extractHostAndSubdomain(hostMatch[1]);
        const context = { reqSocket, head: headData, host, subdomain };
        pipeline.handle(context);
    } else {
        reqSocket.destroy();
    }
}

// --- SERVIDOR HTTPS (Si hay certificados) ---
if (sslOptions) {
    const httpsServer = https.createServer(sslOptions, (req, res) => {
        const { host, subdomain } = extractHostAndSubdomain(req.headers.host);
        const context = { req, res, host, subdomain };
        pipeline.handle(context);
    });

    httpsServer.on('secureConnection', (cleartextSocket) => {
        cleartextSocket.once('data', (data) => {
            const raw = data.toString();
            const hostMatch = raw.match(/Host:\s*([^\s:]+)/i);

            if (hostMatch) {
                const { host, subdomain } = extractHostAndSubdomain(hostMatch[1]);
                const isRoot = (subdomain === 'reverseport' || host === ROOT_DOMAIN);

                if (!isRoot) {
                    // Tráfico dirigido a un túnel
                    processIncomingStream(cleartextSocket, data);
                    return;
                }
            }
            // Tráfico estándar para landing, dejamos fluir el evento data
            cleartextSocket.unshift(data);
        });
    });

    httpsServer.listen(HTTPS_PORT, () => console.log(`🔒 Servidor HTTPS listo en puerto ${HTTPS_PORT}`));
}

// --- SERVIDOR HTTP (Redirección a HTTPS o fallback directo en desarrollo) ---
const httpServer = http.createServer((req, res) => {
    if (sslOptions) {
        // En producción redirigir a HTTPS
        const host = req.headers.host;
        res.writeHead(301, { "Location": `https://${host}${req.url}` });
        res.end();
    } else {
        // Modo desarrollo / sin SSL: Servir directamente con el pipeline
        const { host, subdomain } = extractHostAndSubdomain(req.headers.host);
        const context = { req, res, host, subdomain };
        const handled = pipeline.handle(context);
        if (!handled) {
            res.writeHead(404);
            res.end('Not Found');
        }
    }
});

// Soporte para conexiones TCP directas en HTTP (túneles en modo sin SSL)
httpServer.on('connection', (reqSocket) => {
    if (!sslOptions) {
        reqSocket.once('data', (data) => {
            const raw = data.toString();
            const hostMatch = raw.match(/Host:\s*([^\s:]+)/i);
            if (hostMatch) {
                const { host, subdomain } = extractHostAndSubdomain(hostMatch[1]);
                const isRoot = (subdomain === 'reverseport' || host === ROOT_DOMAIN || host.startsWith('localhost'));
                if (!isRoot) {
                    processIncomingStream(reqSocket, data);
                    return;
                }
            }
            reqSocket.unshift(data);
        });
    }
});

httpServer.listen(HTTP_PORT, () => console.log(`🌍 Servidor HTTP listo en puerto ${HTTP_PORT}`));

module.exports = {
    tunnelServer,
    httpServer,
    registry,
    staticFacade,
    pipeline
};
