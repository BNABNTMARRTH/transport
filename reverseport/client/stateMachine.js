const net = require('net');
const { EventEmitter } = require('events');
let ProtocolAdapter;
try {
    ProtocolAdapter = require('./protocol').ProtocolAdapter;
} catch (e) {
    ProtocolAdapter = require('../shared/protocol').ProtocolAdapter;
}
const { TrafficInspector } = require('./inspector');
const { TunnelCluster } = require('./tunnelCluster');

/**
 * Estados del Túnel (GoF Behavioral - State Pattern + localtunnel/bore Engine)
 */
class TunnelState {
    constructor(context) {
        this.context = context;
    }

    connect() { }
    disconnect() { }
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

            this.context.controlAdapter.on('error', (err) => {
                this.context.log('warn', `Canal de control reset: ${err.message}`);
            });

            if (this.context.isTcp) {
                this.context.controlAdapter.send({
                    type: 'tcp_control',
                    localPort,
                    preferredPort: this.context.preferredPort,
                    apiKey: config.apiKey
                });
                this.context.transitionTo(new ActiveTunnelState(this.context));
            } else {
                // Enviar saludo de control HTTP con delimitador estricto
                this.context.controlAdapter.send({
                    type: 'control',
                    subdomain,
                    apiKey: config.apiKey
                });

                this.context.controlAdapter.once('message', (msg) => {
                    if (msg.type === 'control_ok') {
                        if (msg.rootDomain) {
                            this.context.config.rootDomain = msg.rootDomain;
                        }
                        this.context.transitionTo(new ActiveTunnelState(this.context));
                    } else if (msg.type === 'error') {
                        this.context.log('error', `Rechazado por el servidor: ${msg.message}`);
                        this.context.transitionTo(new TerminatedState(this.context));
                    }
                });
            }
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
        this.cluster = null;
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
                } else if (msg.type === 'error') {
                    this.context.log('error', `Mensaje del servidor: ${msg.message}`);
                    this.disconnect();
                }
            });
        } else {
            const publicUrl = `https://${subdomain}.${config.rootDomain}`;
            if (inspector) {
                inspector.setPublicUrl(publicUrl);
            }
            const inspectorUrl = inspector ? `http://127.0.0.1:${inspector.port}` : null;

            this.context.emit('tunnel_ready', { publicUrl, subdomain, localPort, inspectorUrl });

            // Iniciar cluster de sockets en standby (Molde localtunnel: 0ms latencia)
            this.cluster = new TunnelCluster({
                remoteHost: config.remoteHost,
                remotePort: config.remotePort,
                subdomain,
                localPort,
                maxSockets: 10,
                inspector
            });
            this.cluster.start();

            // Heartbeat Keep-Alive (Molde bore)
            controlAdapter.on('message', (msg) => {
                if (msg.type === 'heartbeat') {
                    controlAdapter.send({ type: 'heartbeat_ack' });
                } else if (msg.type === 'error') {
                    this.context.log('error', `Mensaje del servidor: ${msg.message}`);
                    this.disconnect();
                }
            });
        }
    }

    disconnect() {
        if (this.cluster) {
            this.cluster.close();
            this.cluster = null;
        }
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
