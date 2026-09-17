const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * AuthManager (GoF Singleton / Strategy Pattern)
 * 
 * Gestiona la autenticación de clientes, validación de API Keys y
 * reserva exclusiva de subdominios permanentes para ReversePort.
 */
class AuthManager {
    constructor(dataPath = null) {
        if (AuthManager.instance) {
            return AuthManager.instance;
        }

        this.dataPath = dataPath || path.join(__dirname, 'data', 'keys.json');
        this.keys = new Map();
        this.claimedSubdomains = new Map(); // Map<subdomain, apiKey>

        this._loadKeys();
        AuthManager.instance = this;
    }

    _loadKeys() {
        try {
            if (fs.existsSync(this.dataPath)) {
                const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));
                if (data.keys) {
                    for (const [key, details] of Object.entries(data.keys)) {
                        this.keys.set(key, details);
                    }
                }
                if (data.claimedSubdomains) {
                    for (const [sub, key] of Object.entries(data.claimedSubdomains)) {
                        this.claimedSubdomains.set(sub.toLowerCase(), key);
                    }
                }
            } else {
                // Crear directorio e inicializar con clave maestra por defecto
                const dir = path.dirname(this.dataPath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

                const defaultKey = 'rport_sec_' + crypto.randomBytes(8).toString('hex');
                const defaultData = {
                    keys: {
                        [defaultKey]: {
                            owner: 'Default VIP User',
                            reservedSubdomains: ['vip-demo', 'staging-app'],
                            allowCustomSubdomains: true,
                            allowTcpTunnels: true,
                            createdAt: new Date().toISOString()
                        }
                    },
                    claimedSubdomains: {
                        'vip-demo': defaultKey,
                        'staging-app': defaultKey
                    }
                };

                this.keys.set(defaultKey, defaultData.keys[defaultKey]);
                this.claimedSubdomains.set('vip-demo', defaultKey);
                this.claimedSubdomains.set('staging-app', defaultKey);

                fs.writeFileSync(this.dataPath, JSON.stringify(defaultData, null, 2), 'utf-8');
                console.log(`[Auth] Creado almacén de claves en ${this.dataPath}. Clave inicial: ${defaultKey}`);
            }
        } catch (err) {
            console.error('[Auth] Error cargando base de claves:', err.message);
        }
    }

    _saveKeys() {
        try {
            const data = {
                keys: Object.fromEntries(this.keys),
                claimedSubdomains: Object.fromEntries(this.claimedSubdomains)
            };
            fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2), 'utf-8');
        } catch (err) {
            console.error('[Auth] Error persistiendo base de claves:', err.message);
        }
    }

    /**
     * Valida si una petición de túnel es admisible
     */
    validateTunnelAccess(subdomain, apiKey = null) {
        const sub = (subdomain || '').toLowerCase().trim();

        // 1. Verificar si el subdominio está reservado por otra API Key
        const ownerKey = this.claimedSubdomains.get(sub);
        if (ownerKey) {
            if (apiKey && apiKey === ownerKey) {
                return { allowed: true, isOwner: true, vip: true };
            }
            return {
                allowed: false,
                reason: `El subdominio '${sub}' está reservado permanentemente. Proporciona una API Key válida con --key <token>.`
            };
        }

        // 2. Si el cliente proporciona API Key, validarla
        if (apiKey) {
            const keyDetails = this.keys.get(apiKey);
            if (!keyDetails) {
                return { allowed: false, reason: 'API Key inválida o revocada.' };
            }
            return { allowed: true, isOwner: true, vip: true, keyDetails };
        }

        // 3. Subdominios anónimos / gratuitos permitidos
        return { allowed: true, isOwner: false, vip: false };
    }

    /**
     * Reclama un subdominio permanente para una API Key válida
     */
    claimSubdomain(subdomain, apiKey) {
        const sub = (subdomain || '').toLowerCase().trim();
        const keyDetails = this.keys.get(apiKey);
        if (!keyDetails) {
            throw new Error('API Key no autorizada');
        }

        const existingOwner = this.claimedSubdomains.get(sub);
        if (existingOwner && existingOwner !== apiKey) {
            throw new Error(`El subdominio '${sub}' ya pertenece a otra cuenta.`);
        }

        this.claimedSubdomains.set(sub, apiKey);
        if (!keyDetails.reservedSubdomains.includes(sub)) {
            keyDetails.reservedSubdomains.push(sub);
        }

        this._saveKeys();
        return true;
    }

    /**
     * Genera una nueva API Key
     */
    createApiKey(owner, reservedSubdomains = []) {
        const key = 'rport_' + crypto.randomBytes(12).toString('hex');
        const details = {
            owner,
            reservedSubdomains,
            allowCustomSubdomains: true,
            allowTcpTunnels: true,
            createdAt: new Date().toISOString()
        };

        this.keys.set(key, details);
        for (const sub of reservedSubdomains) {
            this.claimedSubdomains.set(sub.toLowerCase(), key);
        }

        this._saveKeys();
        return { key, details };
    }
}

const authManagerInstance = new AuthManager();

module.exports = {
    AuthManager,
    authManager: authManagerInstance
};
