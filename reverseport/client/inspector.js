const http = require('http');
const { EventEmitter } = require('events');

/**
 * TrafficInspector (GoF Observer & Facade Pattern)
 * 
 * Intercepta, almacena y visualiza en tiempo real el tráfico HTTP que fluye
 * a través del túnel inverso. Expone una interfaz web en localhost:4040
 * con streaming SSE y capacidad de reenvío (Replay).
 */
class TrafficInspector extends EventEmitter {
    constructor(port = 4040, localTargetPort = 3000) {
        super();
        this.port = port;
        this.localTargetPort = localTargetPort;
        this.publicUrl = null;
        this.requests = []; // Buffer en memoria (máximo 100 requests)
        this.maxRequests = 100;
        this.sseClients = new Set();
        this.server = null;
    }

    setPublicUrl(url) {
        this.publicUrl = url;
    }

    setLocalTargetPort(port) {
        this.localTargetPort = port;
    }

    start() {
        if (this.server) return Promise.resolve();

        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => this._handleRequest(req, res));
            this.server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.warn(`[Inspector] Puerto ${this.port} en uso. Reintentando en ${this.port + 1}...`);
                    this.port++;
                    this.server.listen(this.port, '127.0.0.1');
                } else {
                    reject(err);
                }
            });

            this.server.listen(this.port, '127.0.0.1', () => {
                resolve(this.port);
            });
        });
    }

    stop() {
        if (!this.server) return;
        for (const client of this.sseClients) {
            try { client.end(); } catch (e) { }
        }
        this.sseClients.clear();
        this.server.close();
        this.server = null;
    }

    // Registra una nueva petición interceptada
    captureRequest(id, rawRequestBuffer) {
        const parsed = this._parseRawHttp(rawRequestBuffer.toString('utf-8'));
        const entry = {
            id,
            timestamp: new Date().toISOString(),
            startTime: Date.now(),
            method: parsed.method || 'GET',
            path: parsed.path || '/',
            headers: parsed.headers || {},
            body: parsed.body || '',
            rawRequest: rawRequestBuffer.toString('utf-8'),
            status: null,
            statusText: null,
            durationMs: null,
            responseHeaders: {},
            responseBody: '',
            replayed: false
        };

        this.requests.unshift(entry);
        if (this.requests.length > this.maxRequests) {
            this.requests.pop();
        }

        this._broadcastSSE({ type: 'new_request', data: entry });
        return entry;
    }

    // Actualiza la petición con la respuesta interceptada
    captureResponse(id, rawResponseBuffer) {
        const entry = this.requests.find(r => r.id === id);
        if (!entry) return;

        const parsed = this._parseRawHttpResponse(rawResponseBuffer.toString('utf-8'));
        entry.status = parsed.status || 200;
        entry.statusText = parsed.statusText || 'OK';
        entry.responseHeaders = parsed.headers || {};
        entry.responseBody = parsed.body || '';
        entry.durationMs = Date.now() - entry.startTime;

        this._broadcastSSE({ type: 'update_response', data: entry });
    }

    // Replay de petición contra el servidor local
    async replayRequest(id) {
        const original = this.requests.find(r => r.id === id);
        if (!original) {
            throw new Error(`Petición con id ${id} no encontrada`);
        }

        const replayId = 'replay-' + Date.now();
        const start = Date.now();

        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(original.path, `http://127.0.0.1:${this.localTargetPort}`);
            const headers = { ...original.headers };
            delete headers['host']; // Host local dinámico
            delete headers['content-length'];

            const reqOptions = {
                hostname: '127.0.0.1',
                port: this.localTargetPort,
                path: parsedUrl.pathname + parsedUrl.search,
                method: original.method,
                headers: {
                    ...headers,
                    'Host': `127.0.0.1:${this.localTargetPort}`,
                    'X-Replay-Of': original.id
                }
            };

            const clientReq = http.request(reqOptions, (res) => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => {
                    const durationMs = Date.now() - start;
                    const resBody = Buffer.concat(chunks).toString('utf-8');

                    const replayEntry = {
                        id: replayId,
                        originalId: original.id,
                        timestamp: new Date().toISOString(),
                        method: original.method,
                        path: original.path,
                        headers: original.headers,
                        body: original.body,
                        status: res.statusCode,
                        statusText: res.statusMessage,
                        durationMs,
                        responseHeaders: res.headers,
                        responseBody: resBody,
                        replayed: true
                    };

                    this.requests.unshift(replayEntry);
                    if (this.requests.length > this.maxRequests) this.requests.pop();

                    this._broadcastSSE({ type: 'new_request', data: replayEntry });
                    resolve(replayEntry);
                });
            });

            clientReq.on('error', (err) => {
                reject(err);
            });

            if (original.body) {
                clientReq.write(original.body);
            }
            clientReq.end();
        });
    }

    _broadcastSSE(payload) {
        const dataStr = `data: ${JSON.stringify(payload)}\n\n`;
        for (const res of this.sseClients) {
            try {
                res.write(dataStr);
            } catch (e) {
                this.sseClients.delete(res);
            }
        }
    }

    _handleRequest(req, res) {
        const url = new URL(req.url, `http://${req.headers.host}`);

        // CORS para API
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        // 1. SSE Stream
        if (url.pathname === '/api/events') {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });
            res.write(': connected\n\n');
            this.sseClients.add(res);
            req.on('close', () => this.sseClients.delete(res));
            return;
        }

        // 2. GET /api/requests
        if (url.pathname === '/api/requests' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(this.requests));
            return;
        }

        // 3. POST /api/replay/:id
        if (url.pathname.startsWith('/api/replay/') && req.method === 'POST') {
            const id = url.pathname.replace('/api/replay/', '');
            this.replayRequest(id)
                .then(result => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                })
                .catch(err => {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                });
            return;
        }

        // 4. POST /api/clear
        if (url.pathname === '/api/clear' && req.method === 'POST') {
            this.requests = [];
            this._broadcastSSE({ type: 'clear' });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        // 5. GET /api/qr
        if (url.pathname === '/api/qr') {
            const QRCode = require('qrcode');
            QRCode.toBuffer(this.publicUrl || 'https://reverseport.net', { width: 320, margin: 2 }, (err, buf) => {
                if (err) {
                    res.writeHead(500);
                    res.end('Error');
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'image/png' });
                res.end(buf);
            });
            return;
        }

        // 6. GET /api/info
        if (url.pathname === '/api/info') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ publicUrl: this.publicUrl, localPort: this.localTargetPort }));
            return;
        }

        // 7. Dashboard UI (HTML/CSS/JS)
        if (url.pathname === '/' || url.pathname === '/index.html') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(this._getDashboardHtml());
            return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }

    _parseRawHttp(raw) {
        try {
            const parts = raw.split('\r\n\r\n');
            const headerLines = parts[0].split('\r\n');
            const requestLine = headerLines[0] || '';
            const [method, path] = requestLine.split(' ');

            const headers = {};
            for (let i = 1; i < headerLines.length; i++) {
                const idx = headerLines[i].indexOf(':');
                if (idx !== -1) {
                    const key = headerLines[i].slice(0, idx).trim().toLowerCase();
                    const val = headerLines[i].slice(idx + 1).trim();
                    headers[key] = val;
                }
            }

            const body = parts.slice(1).join('\r\n\r\n');
            return { method, path, headers, body };
        } catch (e) {
            return { method: 'GET', path: '/', headers: {}, body: '' };
        }
    }

    _parseRawHttpResponse(raw) {
        try {
            const parts = raw.split('\r\n\r\n');
            const headerLines = parts[0].split('\r\n');
            const statusLine = headerLines[0] || '';
            const statusMatch = statusLine.match(/HTTP\/\S+\s+(\d+)\s*(.*)/i);

            const status = statusMatch ? parseInt(statusMatch[1]) : 200;
            const statusText = statusMatch ? statusMatch[2] : 'OK';

            const headers = {};
            for (let i = 1; i < headerLines.length; i++) {
                const idx = headerLines[i].indexOf(':');
                if (idx !== -1) {
                    const key = headerLines[i].slice(0, idx).trim().toLowerCase();
                    const val = headerLines[i].slice(idx + 1).trim();
                    headers[key] = val;
                }
            }

            const body = parts.slice(1).join('\r\n\r\n');
            return { status, statusText, headers, body };
        } catch (e) {
            return { status: 200, statusText: 'OK', headers: {}, body: '' };
        }
    }

    _getDashboardHtml() {
        return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ReversePort // Traffic Inspector</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-base: #060913;
            --bg-card: rgba(14, 21, 37, 0.7);
            --bg-card-hover: rgba(22, 33, 58, 0.85);
            --border-glass: rgba(0, 240, 255, 0.15);
            --cyan: #00f0ff;
            --purple: #8a2be2;
            --green: #10b981;
            --red: #ef4444;
            --orange: #f59e0b;
            --text-main: #f3f4f6;
            --text-muted: #94a3b8;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background-color: var(--bg-base);
            color: var(--text-main);
            font-family: 'Outfit', sans-serif;
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        header {
            background: rgba(10, 15, 29, 0.9);
            border-bottom: 1px solid var(--border-glass);
            padding: 12px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            backdrop-filter: blur(12px);
        }

        .brand {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .brand h1 {
            font-size: 1.1rem;
            letter-spacing: 1px;
            text-transform: uppercase;
            background: linear-gradient(135deg, var(--cyan), var(--purple));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            font-weight: 700;
        }

        .badge-live {
            background: rgba(16, 185, 129, 0.15);
            border: 1px solid var(--green);
            color: var(--green);
            padding: 2px 8px;
            border-radius: 99px;
            font-size: 0.75rem;
            font-family: 'JetBrains Mono', monospace;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .pulse-dot {
            width: 6px;
            height: 6px;
            background: var(--green);
            border-radius: 50%;
            animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(1.3); }
        }

        .actions {
            display: flex;
            gap: 12px;
        }

        button.btn-action {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border-glass);
            color: var(--text-main);
            padding: 6px 14px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.85rem;
            font-family: 'JetBrains Mono', monospace;
            transition: all 0.2s;
        }

        button.btn-action:hover {
            background: rgba(0, 240, 255, 0.15);
            border-color: var(--cyan);
            color: var(--cyan);
        }

        .main-container {
            display: flex;
            flex: 1;
            overflow: hidden;
        }

        /* Lista de Peticiones */
        .panel-list {
            width: 42%;
            border-right: 1px solid var(--border-glass);
            display: flex;
            flex-direction: column;
            background: rgba(6, 9, 19, 0.5);
        }

        .panel-header {
            padding: 10px 16px;
            background: rgba(15, 23, 42, 0.6);
            border-bottom: 1px solid var(--border-glass);
            font-size: 0.8rem;
            text-transform: uppercase;
            color: var(--text-muted);
            letter-spacing: 1px;
            font-family: 'JetBrains Mono', monospace;
            display: flex;
            justify-content: space-between;
        }

        .request-list {
            flex: 1;
            overflow-y: auto;
            list-style: none;
        }

        .req-item {
            padding: 12px 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.04);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: background 0.15s;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.85rem;
        }

        .req-item:hover {
            background: var(--bg-card-hover);
        }

        .req-item.active {
            background: rgba(0, 240, 255, 0.1);
            border-left: 3px solid var(--cyan);
        }

        .req-left {
            display: flex;
            align-items: center;
            gap: 12px;
            overflow: hidden;
        }

        .badge-method {
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 0.75rem;
            min-width: 46px;
            text-align: center;
        }
        .method-GET { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
        .method-POST { background: rgba(16, 185, 129, 0.2); color: #34d399; }
        .method-PUT { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
        .method-DELETE { background: rgba(239, 68, 68, 0.2); color: #f87171; }

        .req-path {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: var(--text-main);
        }

        .req-right {
            display: flex;
            align-items: center;
            gap: 12px;
            color: var(--text-muted);
            font-size: 0.75rem;
        }

        .badge-status {
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 4px;
        }
        .status-2xx { color: var(--green); }
        .status-3xx { color: var(--cyan); }
        .status-4xx { color: var(--orange); }
        .status-5xx { color: var(--red); }

        /* Detalle de Petición */
        .panel-detail {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: var(--bg-card);
            overflow: hidden;
        }

        .detail-tabs {
            display: flex;
            background: rgba(10, 15, 29, 0.7);
            border-bottom: 1px solid var(--border-glass);
            padding: 0 16px;
        }

        .tab-btn {
            padding: 12px 18px;
            background: transparent;
            border: none;
            border-bottom: 2px solid transparent;
            color: var(--text-muted);
            font-family: 'Outfit', sans-serif;
            font-size: 0.9rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }

        .tab-btn.active {
            color: var(--cyan);
            border-bottom-color: var(--cyan);
        }

        .detail-body {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .code-box {
            background: #040711;
            border: 1px solid var(--border-glass);
            border-radius: 8px;
            padding: 14px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.8rem;
            color: #d1d5db;
            overflow-x: auto;
            max-height: 280px;
        }

        .headers-table {
            width: 100%;
            border-collapse: collapse;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.8rem;
        }

        .headers-table th, .headers-table td {
            text-align: left;
            padding: 6px 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .headers-table th {
            color: var(--text-muted);
            font-weight: 600;
            width: 35%;
        }

        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--text-muted);
            font-size: 0.9rem;
            gap: 12px;
        }

        .btn-replay {
            background: linear-gradient(135deg, var(--cyan), var(--purple));
            color: #000;
            font-weight: 700;
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.85rem;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 0 15px rgba(0, 240, 255, 0.3);
            transition: transform 0.15s, opacity 0.15s;
        }

        .btn-replay:hover {
            transform: scale(1.02);
            opacity: 0.95;
        }
    </style>
</head>
<body>
    <header>
        <div class="brand">
            <h1>ReversePort // Inspector</h1>
            <div class="badge-live"><div class="pulse-dot"></div> EN VIVO</div>
        </div>
        <div class="actions">
            <button class="btn-action" onclick="openQrModal()" style="border-color: rgba(0, 240, 255, 0.4); color: #00f0ff; font-weight: 600;">📱 Probar en Móvil (QR)</button>
            <button class="btn-action" onclick="clearRequests()">🗑️ Limpiar Historial</button>
        </div>
    </header>

    <div class="main-container">
        <!-- Lista Izquierda -->
        <div class="panel-list">
            <div class="panel-header">
                <span>Peticiones HTTP</span>
                <span id="reqCount">0 capturadas</span>
            </div>
            <ul class="request-list" id="requestList">
                <!-- Items dinámicos -->
            </ul>
        </div>

        <!-- Detalle Derecho -->
        <div class="panel-detail">
            <div class="detail-tabs">
                <button class="tab-btn active" onclick="switchTab('req')">Petición (Request)</button>
                <button class="tab-btn" onclick="switchTab('res')">Respuesta (Response)</button>
                <div style="flex: 1"></div>
                <div style="display: flex; align-items: center; padding-right: 10px;">
                    <button class="btn-replay" id="btnReplay" style="display: none;" onclick="replayCurrent()">
                        ⚡ Reenviar (Replay)
                    </button>
                </div>
            </div>

            <div class="detail-body" id="detailBody">
                <div class="empty-state">
                    <p>Esperando tráfico entrante a través del túnel...</p>
                    <span style="font-size: 0.75rem;">Haz peticiones a tu URL de ReversePort para inspeccionarlas en tiempo real.</span>
                </div>
            </div>
        </div>
    </div>

    <script>
        let requests = [];
        let selectedId = null;
        let activeTab = 'req';

        // SSE Connection
        const evtSource = new EventSource('/api/events');
        evtSource.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'new_request') {
                    requests.unshift(msg.data);
                    renderList();
                    if (!selectedId) selectRequest(msg.data.id);
                } else if (msg.type === 'update_response') {
                    const idx = requests.findIndex(r => r.id === msg.data.id);
                    if (idx !== -1) {
                        requests[idx] = msg.data;
                        renderList();
                        if (selectedId === msg.data.id) renderDetail();
                    }
                } else if (msg.type === 'clear') {
                    requests = [];
                    selectedId = null;
                    renderList();
                    renderDetail();
                }
            } catch (e) { }
        };

        // Cargar peticiones iniciales
        fetch('/api/requests')
            .then(res => res.json())
            .then(data => {
                requests = data;
                renderList();
                if (requests.length > 0) selectRequest(requests[0].id);
            });

        function renderList() {
            const listEl = document.getElementById('requestList');
            document.getElementById('reqCount').innerText = requests.length + ' capturadas';
            listEl.innerHTML = '';

            requests.forEach(req => {
                const li = document.createElement('li');
                li.className = 'req-item' + (req.id === selectedId ? ' active' : '');
                li.onclick = () => selectRequest(req.id);

                const statusClass = req.status >= 500 ? 'status-5xx' : req.status >= 400 ? 'status-4xx' : req.status >= 300 ? 'status-3xx' : 'status-2xx';

                li.innerHTML = \`
                    <div class="req-left">
                        <span class="badge-method method-\${req.method}">\${req.method}</span>
                        <span class="req-path">\${escapeHtml(req.path)}</span>
                    </div>
                    <div class="req-right">
                        <span class="badge-status \${statusClass}">\${req.status || '...'}</span>
                        <span>\${req.durationMs !== null ? req.durationMs + 'ms' : '⌛'}</span>
                    </div>
                \`;
                listEl.appendChild(li);
            });
        }

        function selectRequest(id) {
            selectedId = id;
            document.querySelectorAll('.req-item').forEach(el => el.classList.remove('active'));
            renderList();
            renderDetail();
            document.getElementById('btnReplay').style.display = 'flex';
        }

        function switchTab(tab) {
            activeTab = tab;
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            renderDetail();
        }

        function renderDetail() {
            const detailEl = document.getElementById('detailBody');
            const req = requests.find(r => r.id === selectedId);

            if (!req) {
                detailEl.innerHTML = \`
                    <div class="empty-state">
                        <p>Selecciona una petición de la lista para ver sus detalles</p>
                    </div>\`;
                document.getElementById('btnReplay').style.display = 'none';
                return;
            }

            if (activeTab === 'req') {
                detailEl.innerHTML = \`
                    <div>
                        <h3 style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 8px;">LÍNEA DE SOLICITUD</h3>
                        <div class="code-box">\${req.method} \${escapeHtml(req.path)} HTTP/1.1</div>
                    </div>
                    <div>
                        <h3 style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 8px;">HEADERS</h3>
                        <table class="headers-table">
                            \${Object.entries(req.headers || {}).map(([k, v]) => \`<tr><th>\${escapeHtml(k)}</th><td>\${escapeHtml(v)}</td></tr>\`).join('')}
                        </table>
                    </div>
                    <div>
                        <h3 style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 8px;">CUERPO (BODY)</h3>
                        <pre class="code-box">\${escapeHtml(req.body || '(Cuerpo vacío)')}</pre>
                    </div>
                \`;
            } else {
                detailEl.innerHTML = \`
                    <div>
                        <h3 style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 8px;">ESTADO HTTP</h3>
                        <div class="code-box">HTTP/1.1 \${req.status || '...'} \${req.statusText || ''} (\${req.durationMs !== null ? req.durationMs + 'ms' : 'En proceso...'})</div>
                    </div>
                    <div>
                        <h3 style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 8px;">RESPONSE HEADERS</h3>
                        <table class="headers-table">
                            \${Object.entries(req.responseHeaders || {}).map(([k, v]) => \`<tr><th>\${escapeHtml(k)}</th><td>\${escapeHtml(typeof v === 'object' ? JSON.stringify(v) : v)}</td></tr>\`).join('')}
                        </table>
                    </div>
                    <div>
                        <h3 style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 8px;">RESPONSE BODY</h3>
                        <pre class="code-box">\${escapeHtml(req.responseBody || '(Sin cuerpo de respuesta)')}</pre>
                    </div>
                \`;
            }
        }

        async function replayCurrent() {
            if (!selectedId) return;
            const btn = document.getElementById('btnReplay');
            btn.innerHTML = '⚡ Reenviando...';
            btn.style.opacity = '0.5';

            try {
                const res = await fetch('/api/replay/' + selectedId, { method: 'POST' });
                const data = await res.json();
                btn.innerHTML = '⚡ Reenviado!';
                setTimeout(() => {
                    btn.innerHTML = '⚡ Reenviar (Replay)';
                    btn.style.opacity = '1';
                }, 1000);
            } catch (e) {
                alert('Error al reenviar petición: ' + e.message);
                btn.innerHTML = '⚡ Reenviar (Replay)';
                btn.style.opacity = '1';
            }
        }

        function clearRequests() {
            fetch('/api/clear', { method: 'POST' });
        }

        function openQrModal() {
            fetch('/api/info').then(r => r.json()).then(data => {
                const url = data.publicUrl || window.location.origin;
                document.getElementById('qrUrlDisplay').textContent = url;
                document.getElementById('qrImg').src = '/api/qr?t=' + Date.now();
                document.getElementById('qrModal').style.display = 'flex';
            }).catch(() => {
                document.getElementById('qrModal').style.display = 'flex';
            });
        }

        function closeQrModal() {
            document.getElementById('qrModal').style.display = 'none';
        }

        function copyPublicUrl() {
            const text = document.getElementById('qrUrlDisplay').textContent;
            navigator.clipboard.writeText(text).then(() => {
                alert('¡URL pública copiada al portapapeles!');
            });
        }

        function escapeHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }
    </script>

    <!-- Modal QR Móvil -->
    <div id="qrModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); z-index: 9999; align-items: center; justify-content: center;">
        <div style="background: #0d1322; border: 1px solid rgba(0, 240, 255, 0.3); border-radius: 16px; padding: 28px; max-width: 380px; width: 90%; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.8);">
            <div style="font-size: 1.15rem; font-weight: 700; color: #fff; margin-bottom: 8px;">📱 Vista Previa en tu Smartphone</div>
            <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 20px; line-height: 1.4;">Escanea este código con la cámara de tu móvil para verificar tu diseño responsivo bajo HTTPS:</p>
            <div style="background: white; padding: 12px; border-radius: 12px; display: inline-block; box-shadow: 0 8px 24px rgba(0,240,255,0.25);">
                <img id="qrImg" src="/api/qr" alt="QR Code" style="width: 220px; height: 220px; display: block;" />
            </div>
            <div id="qrUrlDisplay" style="margin-top: 16px; font-family: monospace; font-size: 0.8rem; color: #00f0ff; word-break: break-all; background: rgba(0,240,255,0.06); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(0,240,255,0.2);"></div>
            <div style="margin-top: 18px; display: flex; gap: 10px; justify-content: center;">
                <button class="btn-action" onclick="copyPublicUrl()" style="background: rgba(0,240,255,0.15); border-color: #00f0ff; color: #00f0ff; font-weight: 600;">Copiar URL</button>
                <button class="btn-action" onclick="closeQrModal()">Cerrar</button>
            </div>
        </div>
    </div>
</body>
</html>`;
    }
}

module.exports = { TrafficInspector };
