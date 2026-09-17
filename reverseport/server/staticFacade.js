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
            '.ico': 'image/x-icon',
            '.txt': 'text/plain; charset=utf-8',
            '.glb': 'model/gltf-binary',
            '.gltf': 'model/gltf+json'
        };
    }

    /**
     * Sirve un archivo estático general con protección contra path traversal.
     */
    serveFile(res, relativeUrl) {
        let cleanUrl = (relativeUrl === '/' || !relativeUrl) ? 'index.html' : relativeUrl;
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

            fs.readFile(targetPath, (readErr, content) => {
                if (readErr) {
                    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                    res.end('500 Internal Server Error');
                    return;
                }
                res.writeHead(200, {
                    'Content-Type': contentType,
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                });
                res.end(content);
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
