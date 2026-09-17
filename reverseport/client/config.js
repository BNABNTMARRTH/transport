/**
 * ConfigBuilder (GoF Creational - Builder Pattern)
 * 
 * Centraliza la resolución de configuración del cliente, permitiendo
 * sobreescribir hosts y puertos vía variables de entorno o argumentos CLI.
 */
class ClientConfig {
    constructor(options = {}) {
        this.remoteHost = options.remoteHost || process.env.REVERSEPORT_HOST || '82.180.160.218';
        this.remotePort = parseInt(options.remotePort || process.env.REVERSEPORT_PORT) || 8080;
        this.rootDomain = options.rootDomain || process.env.REVERSEPORT_DOMAIN || 'reverseport.net';
        this.defaultLocalPort = parseInt(options.defaultLocalPort) || 3000;
        this.reconnectIntervalMs = parseInt(options.reconnectIntervalMs) || 5000;
        this.maxReconnectAttempts = parseInt(options.maxReconnectAttempts) || 10;
        this.apiKey = options.apiKey || process.env.REVERSEPORT_KEY || null;
        this.inspectorPort = parseInt(options.inspectorPort || process.env.REVERSEPORT_INSPECTOR_PORT) || 4040;
    }
}

class ClientConfigBuilder {
    constructor() {
        this.options = {};
    }

    withRemoteHost(host) {
        if (host) this.options.remoteHost = host;
        return this;
    }

    withRemotePort(port) {
        if (port) this.options.remotePort = parseInt(port);
        return this;
    }

    withRootDomain(domain) {
        if (domain) this.options.rootDomain = domain;
        return this;
    }

    withDefaultLocalPort(port) {
        if (port) this.options.defaultLocalPort = parseInt(port);
        return this;
    }

    withApiKey(key) {
        if (key) this.options.apiKey = key;
        return this;
    }

    withInspectorPort(port) {
        if (port) this.options.inspectorPort = parseInt(port);
        return this;
    }

    build() {
        return new ClientConfig(this.options);
    }
}

module.exports = {
    ClientConfig,
    ClientConfigBuilder
};
