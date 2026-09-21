const http = require('http');
const { pipeline } = require('stream');
const { EventEmitter } = require('events');
const { TunnelAgent } = require('./tunnelAgent');

/**
 * ClientTunnel (GoF Facade Pattern - Molde localtunnel Client)
 * 
 * Encapsula la sesión activa de un subdominio. Administra el TunnelAgent,
 * el canal de control y el enrutamiento HTTP/HTTPS y WebSocket.
 */
class ClientTunnel extends EventEmitter {
    constructor(options = {}) {
        super();
        this.subdomain = options.subdomain;
        this.apiKey = options.apiKey || null;
        this.isVip = !!options.isVip;
        this.controlSocket = options.controlSocket || null;
        this.controlAdapter = options.controlAdapter || null;

        // Agente HTTP con pool de sockets en standby
        this.agent = new TunnelAgent({
            subdomain: this.subdomain,
            maxTcpSockets: this.isVip ? 20 : 10
        });

        this.agent.on('offline', () => {
            this.emit('offline');
        });

        this.agent.on('online', () => {
            this.emit('online');
        });

        this.createdAt = Date.now();
        this.lastActive = Date.now();
    }

    /**
     * Despacha una petición HTTP entrante hacia el túnel del cliente.
     */
    handleRequest(req, res) {
        this.lastActive = Date.now();

        // Si el cliente pide cambiar el Host hacia localhost, ajustamos cabeceras
        const headers = Object.assign({}, req.headers);
        headers['x-forwarded-for'] = req.socket.remoteAddress || '';
        headers['x-forwarded-proto'] = req.connection.encrypted ? 'https' : 'http';
        headers['x-forwarded-host'] = req.headers['host'] || '';

        const clientReq = http.request({
            path: req.url,
            method: req.method,
            headers: headers,
            agent: this.agent
        }, (clientRes) => {
            this.lastActive = Date.now();
            res.writeHead(clientRes.statusCode, clientRes.headers);

            pipeline(clientRes, res, (err) => {
                // Finalización o cancelación de streaming de respuesta
            });
        });

        clientReq.on('error', (err) => {
            if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>502 Bad Gateway // ReversePort</title>
<style>
body{background:#08090c;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
.box{background:rgba(14,21,37,0.85);border:1px solid rgba(255,255,255,0.1);padding:32px;border-radius:16px;max-width:480px;text-align:center;}
h1{margin:0 0 10px;font-size:22px;}p{color:#94a3b8;font-size:14px;line-height:1.6;}
code{color:#00f0ff;}
</style></head>
<body><div class="box">
<h1>502 Bad Gateway</h1>
<p>El túnel de ReversePort está activo, pero tu servidor local no respondió a tiempo a la petición (<code>${err.code || err.message}</code>).</p>
</div></body></html>`);
            }
        });

        // Tubería de subida del cuerpo de la petición hacia el cliente túnel
        pipeline(req, clientReq, (err) => {
            if (err) {
                try { clientReq.destroy(); } catch (e) { }
            }
        });
    }

    /**
     * Despacha una conexión WebSocket (Upgrade).
     */
    handleUpgrade(req, socket, head) {
        this.lastActive = Date.now();

        this.agent.createConnection({}, (err, tunnelSock) => {
            if (err || !tunnelSock) {
                socket.destroy();
                return;
            }

            // Inyectar cabecera HTTP de Upgrade hacia el socket del túnel
            let rawHeaders = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
            for (let i = 0; i < req.rawHeaders.length; i += 2) {
                rawHeaders += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
            }
            rawHeaders += '\r\n';

            tunnelSock.write(rawHeaders);
            if (head && head.length > 0) {
                tunnelSock.write(head);
            }

            // Tubería bidireccional
            tunnelSock.pipe(socket).pipe(tunnelSock);

            socket.on('error', () => { try { tunnelSock.destroy(); } catch (e) { } });
            tunnelSock.on('error', () => { try { socket.destroy(); } catch (e) { } });
        });
    }

    destroy() {
        this.agent.destroy();
        if (this.controlAdapter) {
            try { this.controlAdapter.destroy(); } catch (e) { }
        }
        if (this.controlSocket) {
            try { this.controlSocket.destroy(); } catch (e) { }
        }
    }
}

module.exports = { ClientTunnel };
