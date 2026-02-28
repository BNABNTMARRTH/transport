const net = require('net');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const HTTP_PORT = 80;
const HTTPS_PORT = 443;
const TUNNEL_PORT = 8080;

// --- CARGAR CERTIFICADOS SSL ---
const certPath = '/etc/letsencrypt/live/reverseport.net';
let sslOptions = null;
try {
    sslOptions = {
        key: fs.readFileSync(`${certPath}/privkey.pem`),
        cert: fs.readFileSync(`${certPath}/fullchain.pem`)
    };
    console.log('✅ Certificados SSL cargados satisfactoriamente.');
} catch (e) {
    console.error('❌ Error cargando certificados SSL (HTTPS no funcionará):', e.message);
}

const controlConnections = new Map(); // subdomain -> controlSocket
const pendingRequests = new Map();   // requestId -> { reqSocket, head }

// --- TUNNEL HUB (Multiplexación Control/Data) ---
const tunnelServer = net.createServer((socket) => {
    socket.once('data', (data) => {
        try {
            const raw = data.toString().trim();
            if (!raw) return socket.destroy();

            const msg = JSON.parse(raw);

            // 1. Canal de Control (Persistente)
            if (msg.type === 'control') {
                const { subdomain } = msg;
                console.log(`[Control] Cliente conectado: ${subdomain}`);
                controlConnections.set(subdomain, socket);

                socket.on('close', () => {
                    console.log(`[Control] Cliente desconectado: ${subdomain}`);
                    if (controlConnections.get(subdomain) === socket) {
                        controlConnections.delete(subdomain);
                    }
                });
                socket.on('error', () => { socket.destroy(); });
            }

            // 2. Canal de Datos (Efímero, una por request)
            else if (msg.type === 'data') {
                const { requestId } = msg;
                const pending = pendingRequests.get(requestId);

                if (pending) {
                    console.log(`[Data] Vinculando canal para request: ${requestId}`);
                    pendingRequests.delete(requestId);

                    const { reqSocket, head } = pending;

                    // RAW PIPING: Unimos el navegador (local) con el túnel (remoto)
                    // Importante: reqSocket aquí ya es el socket desencriptado (cleartext)
                    reqSocket.pipe(socket).pipe(reqSocket);

                    // Enviamos los headers que ya habíamos leído
                    if (head && head.length > 0) {
                        socket.write(head);
                    }

                    // Despausamos para dejar fluir el resto del body
                    reqSocket.resume();

                    reqSocket.on('error', () => socket.destroy());
                    socket.on('error', () => reqSocket.destroy());
                } else {
                    console.warn(`[Data] requestId no encontrado o expirado: ${requestId}`);
                    socket.destroy();
                }
            }
        } catch (e) {
            console.error('[Tunnel] Error parseando mensaje:', e.message);
            socket.destroy();
        }
    });

    socket.on('error', () => { });
});

tunnelServer.listen(TUNNEL_PORT, () => console.log(`🚀 Hub de Túneles en el puerto ${TUNNEL_PORT}`));


// --- LÓGICA DE PROXY (Compartida) ---
function handleProxy(reqSocket, data) {
    reqSocket.pause(); // Pausamos para no perder datos mientras abrimos el túnel

    const raw = data.toString();
    const hostMatch = raw.match(/Host:\s*([^\s:]+)/i);

    if (hostMatch) {
        const host = hostMatch[1];
        const subdomain = host.split('.')[0];
        const controlSocket = controlConnections.get(subdomain);

        if (subdomain !== 'reverseport' && controlSocket && !controlSocket.destroyed) {
            const requestId = uuidv4();
            pendingRequests.set(requestId, { reqSocket, head: data });

            console.log(`[Proxy] Nuevo request para '${subdomain}' -> Generando Tunnel #${requestId}`);

            // Le pedimos al cliente que abra un canal de datos
            controlSocket.write(JSON.stringify({ type: 'create_connection', requestId }));

            // Timeout: si el cliente no abre el canal en 15s, respondemos error
            setTimeout(() => {
                if (pendingRequests.has(requestId)) {
                    pendingRequests.delete(requestId);
                    if (reqSocket.writable) {
                        reqSocket.write('HTTP/1.1 504 Gateway Timeout\r\n\r\nTunnel timeout.');
                        reqSocket.destroy();
                    }
                }
            }, 15000);
        } else {
            console.log(`[Proxy] Subdominio offline o inválido: ${subdomain}`);
            if (reqSocket.writable) {
                reqSocket.write('HTTP/1.1 404 Not Found\r\n\r\nReversePort: Subdominio no activo.');
                reqSocket.destroy();
            }
        }
    } else {
        reqSocket.destroy();
    }
}

// --- SERVIDOR HTTPS (SSL Offloading / TLS Termination) ---
if (sslOptions) {
    const httpsServer = https.createServer(sslOptions);

    // Capturamos el socket apenas se desencripta
    httpsServer.on('secureConnection', (cleartextSocket) => {
        cleartextSocket.once('data', (data) => {
            handleProxy(cleartextSocket, data);
        });
    });

    httpsServer.listen(HTTPS_PORT, () => console.log(`🔒 SSL Offloading activo en puerto ${HTTPS_PORT}`));
}

// --- SERVIDOR HTTP (Redirección a HTTPS) ---
const httpServer = http.createServer((req, res) => {
    const host = req.headers.host;
    console.log(`[HTTP] Redirigiendo ${host} a HTTPS`);
    res.writeHead(301, { "Location": `https://${host}${req.url}` });
    res.end();
});

httpServer.listen(HTTP_PORT, () => console.log(`🌍 Redirección HTTP -> HTTPS lista en puerto ${HTTP_PORT}`));
