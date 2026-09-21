const { Agent } = require('http');
const { EventEmitter } = require('events');

/**
 * TunnelAgent (GoF Object Pool + Bridge Pattern - Molde localtunnel)
 * 
 * Implementa un http.Agent personalizado de Node.js que gestiona un pool
 * de sockets TCP pre-conectados (standby) provenientes del cliente.
 * Cuando llega una petición HTTP externa, createConnection despacha un socket
 * que ya está en memoria inmediatamente con 0ms de latencia.
 */
class TunnelAgent extends Agent {
    constructor(options = {}) {
        super({
            keepAlive: true,
            maxFreeSockets: 1
        });

        this.subdomain = options.subdomain || 'anonymous';
        this.maxTcpSockets = options.maxTcpSockets || 10;
        this.connectedSockets = 0;

        // Sockets TCP calientes listos para despachar peticiones
        this.availableSockets = [];

        // Cola de peticiones esperando socket si el tráfico supera el pool disponible
        this.waitingRequests = [];

        this.closed = false;
    }

    stats() {
        return {
            connectedSockets: this.connectedSockets,
            availableSockets: this.availableSockets.length,
            waitingRequests: this.waitingRequests.length
        };
    }

    /**
     * Registra un nuevo socket TCP en standby enviado por el cliente.
     */
    registerSocket(socket) {
        if (this.closed) {
            socket.destroy();
            return;
        }

        if (this.connectedSockets >= this.maxTcpSockets) {
            socket.destroy();
            return;
        }

        this.connectedSockets++;

        socket.once('close', () => {
            this.connectedSockets--;
            const idx = this.availableSockets.indexOf(socket);
            if (idx !== -1) {
                this.availableSockets.splice(idx, 1);
            }
            if (this.connectedSockets <= 0) {
                this.emit('offline');
            }
        });

        socket.once('error', (err) => {
            socket.destroy();
        });

        if (this.connectedSockets === 1) {
            this.emit('online');
        }

        // Si hay una petición HTTP esperando un socket en cola, entregárselo de inmediato
        if (this.waitingRequests.length > 0) {
            const nextReq = this.waitingRequests.shift();
            setImmediate(() => nextReq(null, socket));
            return;
        }

        // Sino, almacenar en el pool de sockets disponibles
        this.availableSockets.push(socket);
    }

    /**
     * Invocado por http.request({ agent: this }) para obtener una conexión hacia el cliente.
     */
    createConnection(options, cb) {
        if (this.closed) {
            cb(new Error('TunnelAgent cerrado'));
            return;
        }

        // Buscar un socket saludable en el pool disponible
        while (this.availableSockets.length > 0) {
            const sock = this.availableSockets.shift();
            if (!sock.destroyed && sock.readyState === 'open') {
                cb(null, sock);
                return;
            }
            try { sock.destroy(); } catch (e) { }
        }

        // Si no hay sockets calientes en este microsegundo, encolar la petición
        // con un timeout de seguridad de 30 segundos
        const timer = setTimeout(() => {
            const idx = this.waitingRequests.indexOf(queuedCb);
            if (idx !== -1) {
                this.waitingRequests.splice(idx, 1);
                queuedCb(new Error('Timeout esperando socket del cliente túnel (504)'));
            }
        }, 30000);

        const queuedCb = (err, sock) => {
            clearTimeout(timer);
            cb(err, sock);
        };

        this.waitingRequests.push(queuedCb);
    }

    destroy() {
        this.closed = true;
        for (const sock of this.availableSockets) {
            try { sock.destroy(); } catch (e) { }
        }
        this.availableSockets = [];

        for (const reqCb of this.waitingRequests) {
            try { reqCb(new Error('Túnel cerrado')); } catch (e) { }
        }
        this.waitingRequests = [];

        super.destroy();
    }
}

module.exports = { TunnelAgent };
