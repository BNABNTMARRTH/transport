/**
 * TunnelRegistry (GoF Creational/Structural - Singleton / Repository Pattern)
 * 
 * Centraliza la gestión de estado mutable del servidor de túneles:
 * - Canales de Control persistentes por subdominio.
 * - Peticiones pendientes de vinculación con canales de datos efímeros.
 * - Limpieza determinista de timers y prevención de fugas de memoria (memory leaks).
 */
class TunnelRegistry {
    constructor() {
        if (TunnelRegistry.instance) {
            return TunnelRegistry.instance;
        }

        // Map<subdomain: string, socket: net.Socket>
        this.controlConnections = new Map();

        // Map<requestId: string, { reqSocket: net.Socket, head: Buffer|string, timer: Timeout }>
        this.pendingRequests = new Map();

        TunnelRegistry.instance = this;
    }

    /**
     * Registra una conexión de control para un subdominio.
     * Si ya existía un socket anterior, lo destruye de forma segura.
     */
    registerControl(subdomain, socket) {
        const normalized = subdomain.toLowerCase().trim();
        const existing = this.controlConnections.get(normalized);
        if (existing && existing !== socket) {
            try { existing.destroy(); } catch (e) { }
        }

        this.controlConnections.set(normalized, socket);
    }

    /**
     * Obtiene el socket de control activo para un subdominio.
     */
    getControl(subdomain) {
        const normalized = subdomain.toLowerCase().trim();
        const socket = this.controlConnections.get(normalized);
        if (socket && !socket.destroyed && socket.writable) {
            return socket;
        }
        return null;
    }

    /**
     * Desregistra un socket de control si coincide con el registrado.
     */
    removeControl(subdomain, socket = null) {
        const normalized = subdomain.toLowerCase().trim();
        const current = this.controlConnections.get(normalized);
        if (!socket || current === socket) {
            this.controlConnections.delete(normalized);
            return true;
        }
        return false;
    }

    /**
     * Registra una petición HTTP entrante pendiente de emparejamiento con el túnel.
     */
    registerPendingRequest(requestId, reqSocket, head, timeoutMs = 15000, onTimeout = null) {
        // Limpiamos si ya existía una colisión de ID
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

    /**
     * Extrae y remueve una petición pendiente por su requestId (operación atómica).
     * Cancela el temporizador para evitar ejecuciones posteriores.
     */
    takePendingRequest(requestId) {
        const entry = this.pendingRequests.get(requestId);
        if (!entry) return null;

        clearTimeout(entry.timer);
        this.pendingRequests.delete(requestId);
        return { reqSocket: entry.reqSocket, head: entry.head };
    }

    /**
     * Cancela y destruye una petición pendiente.
     */
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

    /**
     * Retorna la lista de subdominios activos actualmente conectados.
     */
    getActiveSubdomains() {
        return Array.from(this.controlConnections.keys());
    }

    /**
     * Reinicia y limpia todas las conexiones (útil para pruebas y reinicios limpios).
     */
    clear() {
        for (const [subdomain, socket] of this.controlConnections.entries()) {
            try { socket.destroy(); } catch (e) { }
        }
        this.controlConnections.clear();

        for (const [id, entry] of this.pendingRequests.entries()) {
            clearTimeout(entry.timer);
            try { entry.reqSocket.destroy(); } catch (e) { }
        }
        this.pendingRequests.clear();
    }
}

// Exportamos instancia singleton
const registryInstance = new TunnelRegistry();

module.exports = {
    TunnelRegistry,
    registry: registryInstance
};
