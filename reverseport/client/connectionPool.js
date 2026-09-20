const net = require('net');
const { EventEmitter } = require('events');
let ProtocolAdapter;
try {
    ProtocolAdapter = require('./protocol').ProtocolAdapter;
} catch (e) {
    ProtocolAdapter = require('../shared/protocol').ProtocolAdapter;
}

/**
 * DataConnectionPool (GoF Creational - Object Pool Pattern)
 * 
 * Mantiene un conjunto de conexiones TCP precalentadas (standby) hacia el servidor hub.
 * Cuando llega una petición (create_connection), entrega un socket listo inmediatamente,
 * eliminando la latencia del 3-way handshake TCP en peticiones concurrentes.
 */
class DataConnectionPool extends EventEmitter {
    constructor(config, poolSize = 2) {
        super();
        this.config = config;
        this.poolSize = poolSize;
        this.pool = [];
        this.isDestroyed = false;
    }

    start() {
        this.isDestroyed = false;
        this._replenish();
    }

    _replenish() {
        if (this.isDestroyed) return;

        while (this.pool.length < this.poolSize) {
            const socket = this._createPrewarmedSocket();
            this.pool.push(socket);
        }
    }

    _createPrewarmedSocket() {
        const socket = net.connect(this.config.remotePort, this.config.remoteHost);
        
        socket.once('error', () => {
            this._removeSocket(socket);
            this._replenish();
        });

        socket.once('close', () => {
            this._removeSocket(socket);
            this._replenish();
        });

        return socket;
    }

    _removeSocket(socket) {
        const idx = this.pool.indexOf(socket);
        if (idx !== -1) {
            this.pool.splice(idx, 1);
        }
    }

    /**
     * Adquiere un socket listo del pool, o crea uno bajo demanda si el pool está vacío.
     */
    acquire() {
        if (this.isDestroyed) {
            return net.connect(this.config.remotePort, this.config.remoteHost);
        }

        // Buscar un socket conectado y saludable
        while (this.pool.length > 0) {
            const socket = this.pool.shift();
            // Desasociar listeners de ciclo de vida del pool
            socket.removeAllListeners('error');
            socket.removeAllListeners('close');

            if (!socket.destroyed && socket.readyState === 'open') {
                // Reabastecer el pool en segundo plano
                setImmediate(() => this._replenish());
                return socket;
            }
            try { socket.destroy(); } catch (e) { }
        }

        // Si no hay sockets calientes disponibles, conectar bajo demanda y reponer pool
        setImmediate(() => this._replenish());
        return net.connect(this.config.remotePort, this.config.remoteHost);
    }

    destroy() {
        this.isDestroyed = true;
        for (const socket of this.pool) {
            try {
                socket.removeAllListeners();
                socket.destroy();
            } catch (e) { }
        }
        this.pool = [];
    }
}

module.exports = { DataConnectionPool };
