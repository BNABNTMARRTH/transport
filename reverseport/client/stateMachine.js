const net = require('net');
const { EventEmitter } = require('events');
const { ProtocolAdapter } = require('../shared/protocol');
const { TrafficInspector } = require('./inspector');

/**
 * Estados del Túnel (GoF Behavioral - State Pattern)
 */
class TunnelState {
    constructor(context) {
        this.context = context;
    }

    connect() { }
    disconnect() { }
    handleDataConnection(requestId) { }
    getName() { return 'Unknown'; }
}

class DisconnectedState extends TunnelState {
    connect() {
        this.context.transitionTo(new ConnectingState(this.context));
    }

    getName() { return 'DISCONNECTED'; }
}

class ConnectingState extends TunnelState {
    connect() {
        const { config, subdomain, localPort } = this.context;

        this.context.log('info', `Estableciendo canal de CONTROL hacia ${config.remoteHost}:${config.remotePort}...`);

        const socket = net.connect(config.remotePort, config.remoteHost, () => {
            this.context.controlSocket = socket;
            this.context.controlAdapter = ProtocolAdapter.wrap(socket);

            if (this.context.isTcp) {
                this.context.controlAdapter.send({
                    type: 'tcp_control',
                    localPort,
                    preferredPort: this.context.preferredPort,
                    apiKey: config.apiKey
                });
            } else {
                // Enviar saludo de control con delimitador
                this.context.controlAdapter.send({
                    type: 'control',
                    subdomain,
                    apiKey: config.apiKey
                });
            }

            this.context.transitionTo(new ActiveTunnelState(this.context));
        });

        socket.on('error', (err) => {
            this.context.log('error', `Error al conectar socket de control: ${err.message}`);
            this.context.transitionTo(new ReconnectingState(this.context));
        });

        socket.on('close', () => {
            if (this.context.state instanceof ActiveTunnelState || this.context.state instanceof ConnectingState) {
                this.context.transitionTo(new ReconnectingState(this.context));
            }
        });
    }

    disconnect() {
        this.context.transitionTo(new TerminatedState(this.context));
    }

    getName() { return 'CONNECTING'; }
}

class ActiveTunnelState extends TunnelState {
    constructor(context) {
        super(context);
        this._setupListeners();
    }

    _setupListeners() {
        const { controlAdapter, subdomain, config, localPort, inspector, isTcp } = this.context;

        if (isTcp) {
            controlAdapter.on('message', (msg) => {
                if (msg.type === 'tcp_ready') {
                    this.context.emit('tcp_ready', {
                        publicPort: msg.publicPort,
                        publicHost: msg.publicHost || config.remoteHost,
                        localPort
                    });
                } else if (msg.type === 'create_connection') {
                    this.handleDataConnection(msg.requestId);
                } else if (msg.type === 'error') {
                    this.context.log('error', `Mensaje del servidor: ${msg.message}`);
                    this.disconnect();
                }
            });
        } else {
            const publicUrl = `https://${subdomain}.${config.rootDomain}`;
            const inspectorUrl = inspector ? `http://127.0.0.1:${inspector.port}` : null;

            this.context.emit('tunnel_ready', { publicUrl, subdomain, localPort, inspectorUrl });

            controlAdapter.on('message', (msg) => {
                if (msg.type === 'create_connection') {
                    this.handleDataConnection(msg.requestId);
                } else if (msg.type === 'error') {
                    this.context.log('error', `Mensaje del servidor: ${msg.message}`);
                    this.disconnect();
                }
            });
        }
    }

    handleDataConnection(requestId) {
        const { config, localPort, inspector } = this.context;

        const remoteDataSocket = net.connect(config.remotePort, config.remoteHost, () => {
            // Mandamos saludo data con framing
            const adapter = ProtocolAdapter.wrap(remoteDataSocket);
            adapter.send({ type: 'data', requestId });
            adapter.destroy(); // Pasamos a raw piping una vez enviado el header

            const localSocket = net.connect(localPort, '127.0.0.1', () => {
                let reqBuffer = Buffer.alloc(0);
                let resBuffer = Buffer.alloc(0);

                if (inspector) {
                    remoteDataSocket.on('data', (chunk) => {
                        if (reqBuffer.length < 65536) {
                            const isFirst = reqBuffer.length === 0;
                            reqBuffer = Buffer.concat([reqBuffer, chunk]);
                            if (isFirst) {
                                inspector.captureRequest(requestId, reqBuffer);
                            }
                        }
                    });

                    localSocket.on('data', (chunk) => {
                        if (resBuffer.length < 65536) {
                            const isFirst = resBuffer.length === 0;
                            resBuffer = Buffer.concat([resBuffer, chunk]);
                            if (isFirst) {
                                inspector.captureResponse(requestId, resBuffer);
                            }
                        }
                    });
                }

                remoteDataSocket.pipe(localSocket).pipe(remoteDataSocket);
            });

            localSocket.on('error', () => {
                try { remoteDataSocket.destroy(); } catch (e) { }
            });
            localSocket.on('close', () => {
                try { remoteDataSocket.destroy(); } catch (e) { }
            });
        });

        this.context.activeDataSockets.add(remoteDataSocket);

        remoteDataSocket.on('close', () => {
            this.context.activeDataSockets.delete(remoteDataSocket);
        });

        remoteDataSocket.on('error', () => {
            this.context.activeDataSockets.delete(remoteDataSocket);
        });
    }

    disconnect() {
        this.context.transitionTo(new TerminatedState(this.context));
    }

    getName() { return 'ACTIVE'; }
}

class ReconnectingState extends TunnelState {
    constructor(context) {
        super(context);
        this.timer = null;
        this._scheduleReconnect();
    }

    _scheduleReconnect() {
        if (this.context.reconnectAttempts >= this.context.config.maxReconnectAttempts) {
            this.context.log('error', `Máximo de intentos (${this.context.config.maxReconnectAttempts}) alcanzado. Deteniendo túnel.`);
            this.context.transitionTo(new TerminatedState(this.context));
            return;
        }

        this.context.reconnectAttempts++;
        const delay = this.context.config.reconnectIntervalMs;
        this.context.log('warn', `Canal de CONTROL cerrado. Reintentando (#${this.context.reconnectAttempts}) en ${delay / 1000}s...`);

        this.timer = setTimeout(() => {
            this.context.transitionTo(new ConnectingState(this.context));
        }, delay);
    }

    disconnect() {
        if (this.timer) clearTimeout(this.timer);
        this.context.transitionTo(new TerminatedState(this.context));
    }

    getName() { return 'RECONNECTING'; }
}

class TerminatedState extends TunnelState {
    constructor(context) {
        super(context);
        this.context.cleanup();
        this.context.emit('terminated');
    }

    getName() { return 'TERMINATED'; }
}

/**
 * Contexto de la Máquina de Estados del Túnel
 */
class TunnelStateMachine extends EventEmitter {
    constructor(config, subdomain, localPort, options = {}) {
        super();
        this.config = config;
        this.subdomain = subdomain;
        this.localPort = localPort;
        this.isTcp = !!options.isTcp;
        this.preferredPort = options.preferredPort || null;

        this.controlSocket = null;
        this.controlAdapter = null;
        this.activeDataSockets = new Set();
        this.reconnectAttempts = 0;

        // Inspector de tráfico local HTTP (localhost:4040)
        this.inspector = this.isTcp ? null : new TrafficInspector(config.inspectorPort || 4040, localPort);

        this.state = new DisconnectedState(this);
    }

    transitionTo(newState) {
        const oldStateName = this.state ? this.state.getName() : 'NONE';
        this.state = newState;
        this.emit('state_changed', { from: oldStateName, to: newState.getName() });

        if (newState instanceof ConnectingState) {
            newState.connect();
        }
    }

    async start() {
        if (this.inspector) {
            try {
                await this.inspector.start();
            } catch (err) {
                this.log('warn', `No se pudo iniciar TrafficInspector: ${err.message}`);
            }
        }
        this.state.connect();
    }

    stop() {
        this.state.disconnect();
    }

    log(level, msg) {
        this.emit('log', { level, message: msg, timestamp: new Date().toISOString() });
    }

    cleanup() {
        if (this.inspector) {
            this.inspector.stop();
        }
        if (this.controlAdapter) {
            this.controlAdapter.destroy();
            this.controlAdapter = null;
        }
        if (this.controlSocket) {
            try { this.controlSocket.destroy(); } catch (e) { }
            this.controlSocket = null;
        }

        for (const dataSocket of this.activeDataSockets) {
            try { dataSocket.destroy(); } catch (e) { }
        }
        this.activeDataSockets.clear();
    }
}

module.exports = {
    TunnelStateMachine,
    DisconnectedState,
    ConnectingState,
    ActiveTunnelState,
    ReconnectingState,
    TerminatedState
};
