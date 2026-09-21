/**
 * TunnelRegistry (GoF Creational/Structural - Singleton / Repository Pattern)
 * 
 * Centraliza la gestión de clientes y túneles activos:
 * - Instancias ClientTunnel (que gestionan TunnelAgent y pool de sockets).
 * - Canales de Control persistentes por subdominio con Heartbeat.
 * - Peticiones pendientes de vinculación TCP pura.
 */
class TunnelRegistry {
    constructor() {
        if (TunnelRegistry.instance) {
            return TunnelRegistry.instance;
        }

        // Map<subdomain: string, clientTunnel: ClientTunnel>
        this.clients = new Map();

        // Map<subdomain: string, socket: net.Socket>
        this.controlConnections = new Map();

        // Map<requestId: string, { reqSocket: net.Socket, head: Buffer|string, timer: Timeout }>
        this.pendingRequests = new Map();

        TunnelRegistry.instance = this;
    }

    /**
     * Registra un cliente túnel activo (con su respectivo TunnelAgent).
     */
    registerClient(subdomain, clientTunnel) {
        const normalized = subdomain.toLowerCase().trim();
        const existing = this.clients.get(normalized);
        if (existing && existing !== clientTunnel) {
            try { existing.destroy(); } catch (e) { }
        }
        this.clients.set(normalized, clientTunnel);
    }

    getClient(subdomain) {
        if (!subdomain) return null;
        const normalized = subdomain.toLowerCase().trim();
        return this.clients.get(normalized) || null;
    }

    removeClient(subdomain, clientTunnel = null) {
        const normalized = subdomain.toLowerCase().trim();
        const current = this.clients.get(normalized);
        if (!clientTunnel || current === clientTunnel) {
            if (current) {
                try { current.destroy(); } catch (e) { }
            }
            this.clients.delete(normalized);
            this.controlConnections.delete(normalized);
            return true;
        }
        return false;
    }

    registerControl(subdomain, socket) {
        const normalized = subdomain.toLowerCase().trim();
        const existing = this.controlConnections.get(normalized);
        if (existing && existing !== socket) {
            try { existing.destroy(); } catch (e) { }
        }
        this.controlConnections.set(normalized, socket);
    }

    getControl(subdomain) {
        const normalized = subdomain.toLowerCase().trim();
        const socket = this.controlConnections.get(normalized);
        if (socket && !socket.destroyed && socket.writable) {
            return socket;
        }
        return null;
    }

    removeControl(subdomain, socket = null) {
        const normalized = subdomain.toLowerCase().trim();
        const current = this.controlConnections.get(normalized);
        if (!socket || current === socket) {
            this.controlConnections.delete(normalized);
            return true;
        }
        return false;
    }

    registerPendingRequest(requestId, reqSocket, head, timeoutMs = 15000, onTimeout = null) {
        this.cancelPendingRequest(requestId);

        const timer = setTimeout(() => {
            const entry = this.pendingRequests.get(requestId);
            if (entry) {
                this.pendingRequests.delete(requestId);
                if (typeof onTimeout === 'function') {
                    onTimeout(entry.reqSocket, entry.head);
                } else if (entry.reqSocket && entry.reqSocket.writable) {
                    entry.reqSocket.write('HTTP/1.1 504 Gateway Timeout\r\n\r\n');
                    entry.reqSocket.destroy();
                }
            }
        }, timeoutMs);

        this.pendingRequests.set(requestId, { reqSocket, head, timer });
    }

    takePendingRequest(requestId) {
        const entry = this.pendingRequests.get(requestId);
        if (!entry) return null;

        clearTimeout(entry.timer);
        this.pendingRequests.delete(requestId);
        return { reqSocket: entry.reqSocket, head: entry.head };
    }

    cancelPendingRequest(requestId) {
        const entry = this.pendingRequests.get(requestId);
        if (!entry) return false;

        clearTimeout(entry.timer);
        this.pendingRequests.delete(requestId);
        if (entry.reqSocket && !entry.reqSocket.destroyed) {
            entry.reqSocket.destroy();
        }
        return true;
    }

    getActiveSubdomains() {
        return Array.from(this.clients.keys());
    }

    clear() {
        for (const [subdomain, client] of this.clients.entries()) {
            try { client.destroy(); } catch (e) { }
        }
        this.clients.clear();
        this.controlConnections.clear();

        for (const [id, entry] of this.pendingRequests.entries()) {
            clearTimeout(entry.timer);
            try { entry.reqSocket.destroy(); } catch (e) { }
        }
        this.pendingRequests.clear();
    }
}

const registryInstance = new TunnelRegistry();

module.exports = {
    TunnelRegistry,
    registry: registryInstance
};
