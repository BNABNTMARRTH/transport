const { EventEmitter } = require('events');

/**
 * SmartSocketBridge (GoF Proxy & Mediator Pattern)
 * 
 * Media y gestiona el ciclo de vida del flujo bidireccional de datos entre el 
 * socket HTTP/HTTPS del visitante exterior (reqSocket) y el canal de datos del túnel (dataSocket).
 * 
 * Resuelve:
 * - Half-open dangling sockets (cuando un extremo corta la conexión y el otro queda zombi).
 * - Backpressure y buffer overflows durante streaming de assets pesados.
 * - Prevención de memory leaks eliminando listeners de forma determinista.
 */
class SmartSocketBridge extends EventEmitter {
    constructor(reqSocket, dataSocket, requestId = '') {
        super();
        this.reqSocket = reqSocket;
        this.dataSocket = dataSocket;
        this.requestId = requestId;
        this.isDestroyed = false;

        this._bindStreams();
    }

    static link(reqSocket, dataSocket, initialHead = null, requestId = '') {
        const bridge = new SmartSocketBridge(reqSocket, dataSocket, requestId);
        if (initialHead && initialHead.length > 0) {
            dataSocket.write(initialHead);
        }
        reqSocket.resume();
        return bridge;
    }

    _bindStreams() {
        // Enlace bidireccional de streams
        this.reqSocket.pipe(this.dataSocket);
        this.dataSocket.pipe(this.reqSocket);

        // Monitoreo defensivo de errores en ambos extremos
        this._onReqError = (err) => this._cleanup(`req_error: ${err.message}`);
        this._onDataError = (err) => this._cleanup(`data_error: ${err.message}`);
        this._onReqClose = () => this._cleanup('req_close');
        this._onDataClose = () => this._cleanup('data_close');

        this.reqSocket.on('error', this._onReqError);
        this.dataSocket.on('error', this._onDataError);
        this.reqSocket.on('close', this._onReqClose);
        this.dataSocket.on('close', this._onDataClose);
    }

    _cleanup(reason) {
        if (this.isDestroyed) return;
        this.isDestroyed = true;

        this.emit('cleanup', { requestId: this.requestId, reason });

        // Remover listeners para prevenir fugas de memoria
        if (this.reqSocket) {
            this.reqSocket.removeListener('error', this._onReqError);
            this.reqSocket.removeListener('close', this._onReqClose);
            try { this.reqSocket.unpipe(this.dataSocket); } catch (e) { }
            try { this.reqSocket.destroy(); } catch (e) { }
        }

        if (this.dataSocket) {
            this.dataSocket.removeListener('error', this._onDataError);
            this.dataSocket.removeListener('close', this._onDataClose);
            try { this.dataSocket.unpipe(this.reqSocket); } catch (e) { }
            try { this.dataSocket.destroy(); } catch (e) { }
        }

        this.removeAllListeners();
    }
}

module.exports = { SmartSocketBridge };
