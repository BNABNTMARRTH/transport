const fs = require('fs');
const path = require('path');

/**
 * StaticSiteFacade (GoF Structural - Facade Pattern)
 * 
 * Oculta la complejidad del sistema de archivos, mapeo de Content-Types y 
 * mitigación de vulnerabilidades de Directory Traversal (Path Traversal).
 */
class StaticSiteFacade {
    constructor(websiteDirectory) {
        this.websitePath = path.resolve(websiteDirectory);
        this.mimeTypes = {
            '.html': 'text/html; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.js': 'text/javascript; charset=utf-8',
            '.json': 'application/json',
            '.svg': 'image/svg+xml',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.webp': 'image/webp',
            '.ico': 'image/x-icon',
            '.txt': 'text/plain; charset=utf-8',
            '.glb': 'model/gltf-binary',
            '.gltf': 'model/gltf+json',
            '.wasm': 'application/wasm',
            '.woff2': 'font/woff2',
            '.woff': 'font/woff'
        };
    }

    /**
     * Facade method principal para responder a una petición HTTP (req, res).
     */
    serve(req, res) {
        const url = (req.url || '/').split('?')[0];
        if (url === '/install.sh') {
            return this.serveInstaller(res);
        }
        if (url === '/security' || url === '/security.html') {
            return this.serveSecurityDocs(res);
        }
        return this.serveFile(res, url, req);
    }

    /**
     * Sirve un archivo estático general con protección contra path traversal,
     * encabezados de caché modernos, ETag (304 Not Modified) y streaming reactivo.
     */
    serveFile(res, relativeUrl, req = null) {
        let cleanUrl = (relativeUrl === '/' || !relativeUrl) ? 'index.html' : relativeUrl;
        const hasVersionQuery = cleanUrl.includes('?');
        // Quitar query params si existen
        cleanUrl = cleanUrl.split('?')[0];

        const targetPath = path.resolve(this.websitePath, '.' + path.sep + path.normalize(cleanUrl));

        // Seguridad: Verificar que la ruta no intente escapar del directorio website
        if (!targetPath.startsWith(this.websitePath)) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('403 Forbidden');
            return;
        }

        fs.stat(targetPath, (err, stats) => {
            if (err || !stats.isFile()) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('404 Not Found');
                return;
            }

            const ext = path.extname(targetPath).toLowerCase();
            const contentType = this.mimeTypes[ext] || 'application/octet-stream';
            const etag = `W/"${stats.size.toString(16)}-${stats.mtime.getTime().toString(16)}"`;

            // Validación de caché condicional (304 Not Modified)
            if (req && req.headers && req.headers['if-none-match'] === etag) {
                res.writeHead(304, {
                    'ETag': etag,
                    'Cache-Control': ext === '.html' ? 'no-cache, must-revalidate' : 'public, max-age=604800'
                });
                res.end();
                return;
            }

            // Política de caché según el tipo de recurso
            let cacheControl = 'public, max-age=86400';
            if (ext === '.html') {
                cacheControl = 'no-cache, must-revalidate';
            } else if (['.glb', '.wasm', '.png', '.jpg', '.webp', '.woff2', '.woff', '.svg'].includes(ext)) {
                cacheControl = 'public, max-age=2592000, immutable'; // 30 días para binarios y 3D
            } else if (hasVersionQuery) {
                cacheControl = 'public, max-age=604800, immutable'; // Versiones cacheadas
            }

            const headers = {
                'Content-Type': contentType,
                'Content-Length': stats.size,
                'ETag': etag,
                'Last-Modified': stats.mtime.toUTCString(),
                'Cache-Control': cacheControl,
                'Accept-Ranges': 'bytes',
                'Access-Control-Allow-Origin': '*'
            };

            res.writeHead(200, headers);
            const stream = fs.createReadStream(targetPath);
            stream.pipe(res);
            stream.on('error', () => {
                if (!res.headersSent) {
                    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end('500 Stream Error');
                }
            });
        });
    }

    /**
     * Sirve el script instalador para el CLI (install.sh).
     */
    serveInstaller(res) {
        const installerPath = path.join(this.websitePath, 'install.sh');
        fs.readFile(installerPath, (err, content) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Installer not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(content);
        });
    }

    /**
     * Sirve el documento de seguridad.
     */
    serveSecurityDocs(res) {
        const securityPath = path.join(this.websitePath, 'security.html');
        fs.readFile(securityPath, (err, content) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Security documentation not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
        });
    }
}

module.exports = { StaticSiteFacade };
