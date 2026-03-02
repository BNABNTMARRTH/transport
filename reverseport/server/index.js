const net = require('net');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
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

// --- SUBDOMINIOS RESERVADOS (Prevención de Phishing y Protección de Marca) ---
const reservedSubdomains = new Set([
    'www', 'api', 'admin', 'reverseport', 'status', 'blog', 'dev', 'test',
    'google', 'apple', 'microsoft', 'nvidia', 'facebook', 'instagram', 'whatsapp',
    'paypal', 'bank', 'banco', 'visa', 'mastercard', 'amazon', 'netflix',
    'login', 'signin', 'secure', 'localhost', 'mail', 'support', 'soporte'
]);

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

                // Validación de Subdominio Reservado
                if (reservedSubdomains.has(subdomain.toLowerCase())) {
                    console.log(`[Seguridad] Bloqueado intento de usar subdominio reservado: ${subdomain}`);
                    socket.write(JSON.stringify({ type: 'error', message: 'Subdominio reservado por políticas de seguridad.' }));
                    socket.destroy();
                    return;
                }

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
                    socket.destroy();
                }
            }
        } catch (e) {
            socket.destroy();
        }
    });

    socket.on('error', () => { });
});

tunnelServer.listen(TUNNEL_PORT, () => console.log(`🚀 Hub de Túneles en el puerto ${TUNNEL_PORT}`));


// --- LÓGICA DE SERVIDOR ESTÁTICO (Landing Page) ---
const websitePath = path.join(__dirname, '..', 'website');

function serveStaticFile(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'text/javascript',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg'
    };

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end('404 Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        res.end(content);
    });
}

// --- SERVIR INSTALADOR CLI ---
function serveInstaller(res) {
    const installerPath = path.join(websitePath, 'install.sh');
    fs.readFile(installerPath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end('Installer not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(content);
    });
}

// --- LÓGICA DE PROXY / LANDING (Compartida) ---
function handleRequest(req, res) {
    const host = req.headers.host || '';
    const subdomain = host.split('.')[0];

    // Ruta mágica para instalación: reverseport.net/install
    if (req.url === '/install' && (subdomain === 'reverseport' || host === 'reverseport.net')) {
        serveInstaller(res);
        return;
    }

    // Si es el dominio principal (sin subdominio), servimos la landing
    if (subdomain === 'reverseport' || host === 'reverseport.net') {
        let filePath = path.join(websitePath, req.url === '/' ? 'index.html' : req.url);
        // Evitarnos salir del directorio website
        if (!filePath.startsWith(websitePath)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }
        serveStaticFile(res, filePath);
        return;
    }

    // Si hay subdominio, manejamos la conexión para el túnel (esta lógica se hereda de la versión anterior)
    // Pero como estamos dentro de un Servidor HTTP de Node, el socket ya está manejado.
    // Usaremos el socket subyacente del request para el túnel transparente.
}

// --- SERVIDOR HTTPS (SSL Offloading / TLS Termination) ---
if (sslOptions) {
    const httpsServer = https.createServer(sslOptions, (req, res) => {
        const host = req.headers.host || '';
        const subdomain = host.split('.')[0];

        // Landing Page
        if (subdomain === 'reverseport' || host === 'reverseport.net') {
            handleRequest(req, res);
            return;
        }
    });

    // Para los subdominios (Túneles), usamos el socket bruto
    httpsServer.on('secureConnection', (cleartextSocket) => {
        cleartextSocket.once('data', (data) => {
            const raw = data.toString();
            const hostMatch = raw.match(/Host:\s*([^\s:]+)/i);

            if (hostMatch) {
                const host = hostMatch[1];
                const subdomain = host.split('.')[0];

                if (subdomain !== 'reverseport' && host !== 'reverseport.net') {
                    // Lógica de Túnel (Raw)
                    handleProxy(cleartextSocket, data);
                    return;
                }
            }
        });
    });

    httpsServer.listen(HTTPS_PORT, () => console.log(`🔒 Servidor HTTPS (Landing + Tunnels) en ${HTTPS_PORT}`));
}

// Lógica de Proxy simplificada para heredar
function handleProxy(reqSocket, data) {
    reqSocket.pause();
    const raw = data.toString();
    const hostMatch = raw.match(/Host:\s*([^\s:]+)/i);

    if (hostMatch) {
        const host = hostMatch[1];
        const subdomain = host.split('.')[0];
        const controlSocket = controlConnections.get(subdomain);

        if (controlSocket && !controlSocket.destroyed) {
            const requestId = uuidv4();
            pendingRequests.set(requestId, { reqSocket, head: data });
            controlSocket.write(JSON.stringify({ type: 'create_connection', requestId }));
            setTimeout(() => {
                if (pendingRequests.has(requestId)) {
                    pendingRequests.delete(requestId);
                    if (reqSocket.writable) {
                        reqSocket.write('HTTP/1.1 504 Gateway Timeout\r\n\r\n');
                        reqSocket.destroy();
                    }
                }
            }, 15000);
        } else {
            if (reqSocket.writable) {
                reqSocket.write('HTTP/1.1 404 Not Found\r\n\r\nSubdominio no activo.');
                reqSocket.destroy();
            }
        }
    } else {
        reqSocket.destroy();
    }
}

// --- SERVIDOR HTTP (Redirección a HTTPS) ---
const httpServer = http.createServer((req, res) => {
    const host = req.headers.host;
    res.writeHead(301, { "Location": `https://${host}${req.url}` });
    res.end();
});

httpServer.listen(HTTP_PORT, () => console.log(`🌍 Redirección HTTP -> HTTPS lista en puerto ${HTTP_PORT}`));
