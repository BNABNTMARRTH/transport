const { EventEmitter } = require('events');

/**
 * ProtocolAdapter (GoF Structural - Adapter Pattern)
 * 
 * Adapta el flujo continuo de bytes de un socket TCP (stream) a un 
 * protocolo estructurado basado en mensajes discretos (Framed Messages con delimitador '\n').
 * 
 * Resuelve el problema crítico de TCP packet fragmentation (mensajes cortados en 
 * múltiples paquetes) y packet merging (múltiples mensajes juntos en un solo paquete).
 */
class ProtocolAdapter extends EventEmitter {
    constructor(socket) {
        super();
        this.socket = socket;
        this.buffer = '';
        this._isDestroyed = false;

        this._onData = this._onData.bind(this);
        this._onError = this._onError.bind(this);
        this._onClose = this._onClose.bind(this);

        this.socket.on('data', this._onData);
        this.socket.on('error', this._onError);
        this.socket.on('close', this._onClose);
    }

    /**
     * Procesa los chunks entrantes del socket, acumulando en un buffer y
     * extrayendo cada mensaje JSON completo delimitado por '\n'.
     */
    _onData(chunk) {
        if (this._isDestroyed) return;

        this.buffer += chunk.toString('utf8');

        let delimiterIndex;
        while ((delimiterIndex = this.buffer.indexOf('\n')) !== -1) {
            const rawLine = this.buffer.slice(0, delimiterIndex).trim();
            this.buffer = this.buffer.slice(delimiterIndex + 1);

            if (rawLine.length > 0) {
                this._dispatchMessage(rawLine);
            }
        }

        // Retrocompatibilidad: Si el buffer contiene un JSON completo sin salto de línea
        // (ej. conexiones legadas que enviaron un único JSON y no mandan más datos inmediatamente)
        if (this.buffer.trim().startsWith('{') && this.buffer.trim().endsWith('}')) {
            const raw = this.buffer.trim();
            try {
                const parsed = JSON.parse(raw);
                this.buffer = '';
                this.emit('message', parsed);
            } catch (e) {
                // Si aún no está completo el JSON, esperamos el siguiente chunk
            }
        }
    }

    _dispatchMessage(rawLine) {
        try {
            const parsed = JSON.parse(rawLine);
            this.emit('message', parsed);
        } catch (err) {
            this.emit('parse_error', err, rawLine);
        }
    }

    _onError(err) {
        this.emit('error', err);
    }

    _onClose(hadError) {
        this.emit('close', hadError);
        this.destroy();
    }

    /**
     * Envía un objeto JavaScript serializado como JSON seguido de un delimitador '\n'.
     */
    send(obj) {
        if (this._isDestroyed || !this.socket || !this.socket.writable) {
            return false;
        }
        const payload = JSON.stringify(obj) + '\n';
        return this.socket.write(payload);
    }

    destroy() {
        if (this._isDestroyed) return;
        this._isDestroyed = true;
        this.buffer = '';
        if (this.socket) {
            this.socket.removeListener('data', this._onData);
            this.socket.removeListener('error', this._onError);
            this.socket.removeListener('close', this._onClose);
        }
        this.removeAllListeners();
    }

    /**
     * Helper de fábrica (Factory Method)
     */
    static wrap(socket) {
        return new ProtocolAdapter(socket);
    }
}

module.exports = { ProtocolAdapter };
