const net = require('net');
const { EventEmitter } = require('events');
let ProtocolAdapter;
try {
    ProtocolAdapter = require('./protocol').ProtocolAdapter;
} catch (e) {
    ProtocolAdapter = require('../shared/protocol').ProtocolAdapter;
}

/**
 * TunnelCluster (GoF Object Pool + Worker Pool - Molde localtunnel Client)
 * 
 * Mantiene un conjunto continuo de conexiones TCP en standby hacia el VPS.
 * Tan pronto como el servidor despacha tráfico a través de un socket,
 * el cliente lo vincula a 127.0.0.1:localPort y abre un nuevo socket
 * en segundo plano para mantener el pool lleno (0ms de latencia).
 */
class TunnelCluster extends EventEmitter {
    constructor(options = {}) {
        super();
        this.remoteHost = options.remoteHost;
        this.remotePort = options.remotePort;
        this.subdomain = options.subdomain;
        this.localPort = options.localPort;
        this.maxSockets = options.maxSockets || 10;
        this.inspector = options.inspector || null;

        this.currentSockets = 0;
        this.activeDataSockets = new Set();
        this.isClosed = false;
    }

    start() {
        this.isClosed = false;
        this._fillPool();
    }

    _fillPool() {
        if (this.isClosed) return;
        while (this.currentSockets < this.maxSockets) {
            this._spawnSocket();
        }
    }

    _spawnSocket() {
        if (this.isClosed) return;
        this.currentSockets++;

        const remote = net.connect(this.remotePort, this.remoteHost);

        remote.setKeepAlive(true);

        const onConnected = () => {
            // Enviar saludo de standby con delimitador de protocolo
            const adapter = ProtocolAdapter.wrap(remote);
            adapter.send({
                type: 'standby',
                subdomain: this.subdomain
            });
            adapter.destroy(); // Pasar a raw streaming

            // Escuchar cuando el servidor comience a enviar la petición HTTP
            remote.once('data', (firstChunk) => {
                // Al recibir datos, este socket ha sido asignado a una petición activa
                this.activeDataSockets.add(remote);

                // Reponer inmediatamente el pool de sockets en espera
                this.currentSockets--;
                setImmediate(() => this._fillPool());

                this._connectLocal(remote, firstChunk);
            });
        };

        remote.once('connect', onConnected);

        remote.once('close', () => {
            this.activeDataSockets.delete(remote);
            if (!this.activeDataSockets.has(remote)) {
                this.currentSockets--;
            }
            if (!this.isClosed) {
                setTimeout(() => this._fillPool(), 500);
            }
        });

        remote.once('error', (err) => {
            remote.destroy();
        });
    }

    _connectLocal(remote, firstChunk) {
        const local = net.connect(this.localPort, '127.0.0.1');

        let reqBuffer = firstChunk;
        let resBuffer = Buffer.alloc(0);
        const reqId = 'req-' + Math.random().toString(36).substring(2, 9);

        local.once('connect', () => {
            // Inyectar el primer chunk de la petición
            local.write(firstChunk);

            if (this.inspector) {
                this.inspector.captureRequest(reqId, reqBuffer);

                remote.on('data', (chunk) => {
                    if (reqBuffer.length < 65536) {
                        reqBuffer = Buffer.concat([reqBuffer, chunk]);
                    }
                });

                local.on('data', (chunk) => {
                    if (resBuffer.length < 65536) {
                        const isFirst = resBuffer.length === 0;
                        resBuffer = Buffer.concat([resBuffer, chunk]);
                        if (isFirst) {
                            this.inspector.captureResponse(reqId, resBuffer);
                        }
                    }
                });
            }

            // Tubería bidireccional continua
            remote.pipe(local).pipe(remote);
        });

        local.once('error', (err) => {
            if (remote.writable) {
                const errorHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>502 Bad Gateway // ReversePort</title>
<style>
body{background:#08090c;color:#f8fafc;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
.card{background:rgba(14,21,37,0.9);border:1px solid rgba(255,255,255,0.1);padding:32px;border-radius:16px;max-width:480px;text-align:center;}
h1{margin:0 0 10px;font-size:22px;}p{color:#94a3b8;font-size:14px;line-height:1.6;}
code{color:#00f0ff;}
</style></head>
<body><div class="card">
<h1>502 Bad Gateway</h1>
<p>El túnel de ReversePort está activo en la nube, pero tu servidor local en <strong>127.0.0.1:${this.localPort}</strong> no responde (<code>${err.code || 'ECONNREFUSED'}</code>).</p>
</div></body></html>`;
                const httpRes = `HTTP/1.1 502 Bad Gateway\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(errorHtml)}\r\nConnection: close\r\n\r\n${errorHtml}`;
                remote.write(httpRes);
                remote.end();
            } else {
                remote.destroy();
            }
        });

        local.once('close', () => {
            try { remote.destroy(); } catch (e) { }
        });
    }

    close() {
        this.isClosed = true;
        for (const sock of this.activeDataSockets) {
            try { sock.destroy(); } catch (e) { }
        }
        this.activeDataSockets.clear();
        this.currentSockets = 0;
    }
}

module.exports = { TunnelCluster };
