const net = require('net');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const { ProtocolAdapter } = require('../shared/protocol');
const { registry } = require('./registry');
const { StaticSiteFacade } = require('./staticFacade');
const { authManager } = require('./auth');
const { TcpTunnelHub } = require('./tcpHub');
const { ClientTunnel } = require('./clientTunnel');
const { SmartSocketBridge } = require('./socketBridge');

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

// --- FACADE PARA SITIO WEB / LANDING PAGE ---
const websitePath = path.join(__dirname, '..', 'website');
const staticFacade = new StaticSiteFacade(websitePath);

// --- CARGAR CERTIFICADOS SSL ---
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

// Helper para parsear subdominio de un header Host
function extractHostAndSubdomain(hostHeader) {
    const host = (hostHeader || '').split(':')[0].toLowerCase();
    const parts = host.split('.');
    let subdomain = parts[0];
    return { host, subdomain };
}

function isRootHost(host, subdomain) {
    const clean = (host || '').split(':')[0].toLowerCase();
    return (
        clean === ROOT_DOMAIN ||
        clean === 'www.' + ROOT_DOMAIN ||
        clean.startsWith('localhost') ||
        clean === '127.0.0.1' ||
        clean === '82.180.160.218' ||
        subdomain === 'reverseport' ||
        subdomain === 'www' ||
        !clean
    );
}

function renderNotFoundHtml(subdomain) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Túnel No Encontrado // ReversePort</title>
<style>
:root{color-scheme:dark;}
body{font-family:system-ui,-apple-system,sans-serif;background:#08090c;color:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;box-sizing:border-box;}
.card{background:rgba(14,21,37,0.85);border:1px solid rgba(0,240,255,0.2);border-radius:16px;padding:36px;max-width:500px;text-align:center;box-shadow:0 20px 40px rgba(0,0,0,0.6);}
h1{margin:0 0 12px;font-size:24px;color:#fff;}
p{color:#94a3b8;line-height:1.6;font-size:14px;margin-bottom:24px;}
.badge{display:inline-block;background:rgba(0,240,255,0.1);color:#00f0ff;border:1px solid rgba(0,240,255,0.3);padding:4px 12px;border-radius:99px;font-family:monospace;font-size:12px;margin-bottom:16px;}
.cmd{background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);padding:10px;border-radius:8px;font-family:monospace;color:#38bdf8;font-size:13px;}
</style>
</head>
<body>
<div class="card">
<div class="badge">404 TUNNEL OFFLINE</div>
<h1>Túnel no encontrado</h1>
<p>El subdominio <strong>${subdomain}.${ROOT_DOMAIN}</strong> no está conectado actualmente a ReversePort.</p>
<div class="cmd">pulpemerge &lt;puerto&gt; ${subdomain}</div>
</div>
</body>
</html>`;
}

// --- TUNNEL HUB (Servidor de Control y Standby Sockets - Molde localtunnel + bore) ---
const tunnelServer = net.createServer((socket) => {
    const adapter = ProtocolAdapter.wrap(socket);

    adapter.on('message', (msg) => {
        try {
            // 1. Canal de Control HTTP/Web
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

                const authCheck = authManager.validateTunnelAccess(subdomain, apiKey);
                if (!authCheck.allowed) {
                    adapter.send({ type: 'error', message: authCheck.reason });
                    socket.destroy();
                    return;
                }

                console.log(`[Control] Cliente conectado: ${subdomain} (VIP: ${authCheck.vip})`);

                const clientTunnel = new ClientTunnel({
                    subdomain,
                    apiKey,
                    isVip: authCheck.vip,
                    controlSocket: socket,
                    controlAdapter: adapter
                });

                registry.registerClient(subdomain, clientTunnel);
                registry.registerControl(subdomain, socket);

                // Enviar confirmación al cliente
                adapter.send({
                    type: 'control_ok',
                    subdomain,
                    rootDomain: ROOT_DOMAIN
                });

                // Heartbeat Keep-Alive cada 15 segundos (Molde bore)
                const heartbeatTimer = setInterval(() => {
                    if (socket.writable && !socket.destroyed) {
                        adapter.send({ type: 'heartbeat' });
                    } else {
                        clearInterval(heartbeatTimer);
                    }
                }, 15000);

                socket.on('close', () => {
                    console.log(`[Control] Cliente desconectado: ${subdomain}`);
                    clearInterval(heartbeatTimer);
                    registry.removeClient(subdomain, clientTunnel);
                    tcpHub.releaseClientTunnels(socket);
                });
            }

            // 2. Canal de Sockets en Standby (Molde localtunnel: 0ms latencia)
            else if (msg.type === 'standby') {
                const { subdomain } = msg;
                const client = registry.getClient(subdomain);

                if (client) {
                    adapter.destroy(); // Retirar envoltura de protocolo para streaming HTTP transparente
                    client.agent.registerSocket(socket);
                } else {
                    socket.destroy();
                }
            }

            // 3. Heartbeat ACK del cliente
            else if (msg.type === 'heartbeat_ack') {
                // Conexión activa certificada
            }

            // 4. Canal de Control TCP Puro (Postgres, MySQL, SSH)
            else if (msg.type === 'tcp_control') {
                const { localPort, preferredPort, apiKey } = msg;
                authManager.validateTunnelAccess('tcp-tunnel', apiKey);

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

            // 5. Canal de Datos Legacy (Compatibilidad)
            else if (msg.type === 'data') {
                const { requestId } = msg;
                const pending = registry.takePendingRequest(requestId);

                if (pending) {
                    const { reqSocket, head } = pending;
                    adapter.destroy();
                    SmartSocketBridge.link(reqSocket, socket, head, requestId);
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

// --- DISPATCHER CENTRAL DE PETICIONES HTTP/HTTPS ---
function handleHttpRequest(req, res) {
    try {
        const { host, subdomain } = extractHostAndSubdomain(req.headers.host);

        // 1. Si es el dominio principal, servir landing page bioluminiscente
        if (isRootHost(host, subdomain)) {
            staticFacade.serve(req, res);
            return;
        }

        // 2. Si es un subdominio de túnel, buscar el cliente registrado
        const client = registry.getClient(subdomain);
        if (client) {
            client.handleRequest(req, res);
            return;
        }

        // 3. Subdominio no encontrado / offline
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderNotFoundHtml(subdomain));
    } catch (err) {
        console.error('[HTTP Handler Error]', err);
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('500 Internal Server Error');
        }
    }
}

function handleHttpUpgrade(req, socket, head) {
    const { host, subdomain } = extractHostAndSubdomain(req.headers.host);

    if (isRootHost(host, subdomain)) {
        socket.destroy();
        return;
    }

    const client = registry.getClient(subdomain);
    if (client) {
        client.handleUpgrade(req, socket, head);
    } else {
        socket.destroy();
    }
}

// --- SERVIDOR HTTPS (Producción con Let's Encrypt) ---
if (sslOptions) {
    const httpsServer = https.createServer(sslOptions, handleHttpRequest);
    httpsServer.on('upgrade', handleHttpUpgrade);
    httpsServer.listen(HTTPS_PORT, () => console.log(`🔒 Servidor HTTPS listo en puerto ${HTTPS_PORT}`));
}

// --- SERVIDOR HTTP ---
const httpServer = http.createServer((req, res) => {
    if (sslOptions) {
        // Redirigir a HTTPS en producción
        const host = req.headers.host;
        res.writeHead(301, { "Location": `https://${host}${req.url}` });
        res.end();
    } else {
        // Modo desarrollo / sin SSL
        handleHttpRequest(req, res);
    }
});

httpServer.on('upgrade', handleHttpUpgrade);
httpServer.listen(HTTP_PORT, () => console.log(`🌍 Servidor HTTP listo en puerto ${HTTP_PORT}`));

module.exports = {
    tunnelServer,
    httpServer,
    registry,
    staticFacade
};
