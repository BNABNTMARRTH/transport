const qrcode = require('qrcode');

/**
 * Renderizador de Código QR Terminal ISO/IEC 18004 de Alto Rendimiento.
 * 
 * Causa raíz del fallo anterior resuelta:
 * 1. Los renderizadores estándar emitían secuencias '\x1b[0m' intermedias que mutilaban
 *    el fondo en terminales con temas oscuros, generando bandas negras sobre el patrón.
 * 2. Carecían de una Quiet Zone (zona de silencio) de 4 módulos en los 4 costados,
 *    impidiendo que los algoritmos de detección de bordes de iOS y Android fijaran los patrones de esquina.
 * 3. Esta implementación emite una tarjeta blanca pura (\x1b[47m) con módulos negros (\x1b[30m),
 *    con Quiet Zone de 3-4 módulos completos y sin ningún reset interno en la línea.
 */
function renderToTerminal(text, options = {}) {
    try {
        const margin = options.margin !== undefined ? options.margin : 3;
        const qr = qrcode.create(text, { errorCorrectionLevel: 'M' });
        const size = qr.modules.size;
        const totalSize = size + margin * 2;
        const paddedRows = totalSize % 2 === 0 ? totalSize : totalSize + 1;

        // Construir matriz con margen de quiet zone (false = blanco, true = negro)
        const grid = Array.from({ length: paddedRows }, () => new Array(totalSize).fill(false));
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                grid[r + margin][c + margin] = qr.modules.get(c, r);
            }
        }

        const BG_WHITE = '\x1b[47m';
        const FG_BLACK = '\x1b[30m';
        const RESET = '\x1b[0m';

        const lines = [];
        for (let r = 0; r < paddedRows; r += 2) {
            let line = '   ' + BG_WHITE + FG_BLACK;
            for (let c = 0; c < totalSize; c++) {
                const top = grid[r][c];
                const bot = (r + 1 < paddedRows) ? grid[r + 1][c] : false;

                if (top && bot) {
                    line += '█';
                } else if (top && !bot) {
                    line += '▀';
                } else if (!top && bot) {
                    line += '▄';
                } else {
                    line += ' ';
                }
            }
            line += RESET;
            lines.push(line);
        }

        return lines.join('\n');
    } catch (err) {
        return null;
    }
}

module.exports = {
    renderToTerminal
};
