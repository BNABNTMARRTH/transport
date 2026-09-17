const net = require('net');
const crypto = require('crypto');

/**
 * TcpTunnelHub (GoF Factory / Mediator Pattern)
 * 
 * Gestiona el reenvío de puertos TCP puros (PostgreSQL, MySQL, Redis, SSH)
 * asignando puertos públicos dinámicos (10000-10100) en el servidor.
 */
class TcpTunnelHub {
    constructor(registry, startPort = 10000, endPort = 10100) {
        this.registry = registry;
        this.startPort = startPort;
        this.endPort = endPort;
        this.activeListeners = new Map(); // Map<publicPort, net.Server>
        this.clientPorts = new Map(); // Map<controlSocket, Set<publicPort>>
    }

    /**
     * Busca un puerto libre dentro del rango permitido
     */
    async _findAvailablePort(preferredPort = null) {
        if (preferredPort && preferredPort >= this.startPort && preferredPort <= this.endPort) {
            if (!this.activeListeners.has(preferredPort)) {
                return preferredPort;
            }
        }

        for (let port = this.startPort; port <= this.endPort; port++) {
            if (!this.activeListeners.has(port)) {
                return port;
            }
        }
        throw new Error('No hay puertos TCP disponibles en el rango ' + this.startPort + '-' + this.endPort);
    }

    /**
     * Asigna e inicia un servidor TCP público para un cliente
     */
    async createTcpTunnel(controlSocket, localPort, preferredPort = null) {
        const publicPort = await this._findAvailablePort(preferredPort);

        return new Promise((resolve, reject) => {
            const server = net.createServer((incomingSocket) => {
                const requestId = 'tcp-' + crypto.randomUUID();

                // Pausar socket entrante para no perder paquetes iniciales (e.g. SSH handshake)
                incomingSocket.pause();

                this.registry.registerPendingRequest(requestId, incomingSocket, null, 15000, (timedOutSocket) => {
                    if (timedOutSocket && timedOutSocket.writable) {
                        try { timedOutSocket.destroy(); } catch (e) { }
                    }
                });

                // Solicitar al cliente local que abra un canal de datos para este socket
                try {
                    controlSocket.write(JSON.stringify({
                        type: 'create_connection',
                        requestId,
                        isTcp: true,
                        publicPort,
                        localPort
                    }) + '\n');
                } catch (e) {
                    incomingSocket.destroy();
                }
            });

            server.on('error', (err) => {
                this.activeListeners.delete(publicPort);
                reject(err);
            });

            server.listen(publicPort, '0.0.0.0', () => {
                this.activeListeners.set(publicPort, server);

                // Asociar al socket de control para limpieza automática si el cliente se desconecta
                if (!this.clientPorts.has(controlSocket)) {
                    this.clientPorts.set(controlSocket, new Set());
                }
                this.clientPorts.get(controlSocket).add(publicPort);

                resolve(publicPort);
            });
        });
    }

    /**
     * Cierra y libera los túneles TCP asociados a un socket de control
     */
    releaseClientTunnels(controlSocket) {
        const ports = this.clientPorts.get(controlSocket);
        if (!ports) return;

        for (const port of ports) {
            const server = this.activeListeners.get(port);
            if (server) {
                try {
                    server.close();
                    console.log(`[TCP Hub] Puerto ${port} liberado.`);
                } catch (e) { }
                this.activeListeners.delete(port);
            }
        }
        this.clientPorts.delete(controlSocket);
    }

    /**
     * Cierra todos los listeners
     */
    closeAll() {
        for (const [port, server] of this.activeListeners.entries()) {
            try { server.close(); } catch (e) { }
        }
        this.activeListeners.clear();
        this.clientPorts.clear();
    }
}

module.exports = { TcpTunnelHub };
