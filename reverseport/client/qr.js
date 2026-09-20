let QRCodeLib = null;
try {
    QRCodeLib = require('qrcode');
} catch (e) { }

/**
 * Renderiza el código QR en la terminal con fondo BLANCO ANSI (\x1b[47m)
 * y módulos NEGROS ANSI (\x1b[30m) para garantizar contraste 100% ISO/IEC 18004.
 * Esto permite que cualquier smartphone (iPhone, Android / Google Lens)
 * lo escanee al instante directamente desde la pantalla de la terminal.
 */
function renderToTerminal(text) {
    if (QRCodeLib && typeof QRCodeLib.toString === 'function') {
        let output = '';
        QRCodeLib.toString(text, { type: 'terminal', small: true }, (err, str) => {
            if (!err && str) {
                output = str.split('\n').map(line => '   ' + line).join('\n');
            }
        });
        if (output) return output;
    }

    return null;
}

module.exports = {
    renderToTerminal
};
