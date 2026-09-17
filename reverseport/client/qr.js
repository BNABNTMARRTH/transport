/**
 * QR Code Generator for Terminal (Zero Dependencies)
 * 
 * Generates ISO/IEC 18004 compliant QR Codes and renders them directly to ANSI terminal
 * using half-block Unicode characters (▀, ▄, █, ' ') with 2:1 vertical compression.
 */

// Galois Field GF(256) math for Reed-Solomon Error Correction
const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint8Array(256);
(function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
        GF256_EXP[i] = x;
        GF256_EXP[i + 255] = x;
        GF256_LOG[x] = i;
        x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
    }
})();

function gfMul(x, y) {
    if (x === 0 || y === 0) return 0;
    return GF256_EXP[GF256_LOG[x] + GF256_LOG[y]];
}

// Reed-Solomon generator polynomial calculation
function rsGeneratorPoly(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
        const next = [1];
        const factor = GF256_EXP[i];
        for (let j = 0; j < poly.length; j++) {
            next[j + 1] = poly[j];
        }
        for (let j = 0; j < poly.length; j++) {
            next[j] ^= gfMul(poly[j], factor);
        }
        poly = next;
    }
    return poly;
}

// Compute Reed-Solomon error correction codewords
function rsCalculateEcc(data, eccLen) {
    const gen = rsGeneratorPoly(eccLen);
    const res = new Uint8Array(eccLen);
    for (let b of data) {
        const factor = b ^ res[0];
        for (let i = 0; i < eccLen - 1; i++) {
            res[i] = res[i + 1] ^ gfMul(gen[i + 1], factor);
        }
        res[eccLen - 1] = gfMul(gen[eccLen], factor);
    }
    return res;
}

// QR Code Specifications for Version 1 to 10 with Error Correction Level M (Standard)
const QR_SPECS = {
    // [totalCodewords, eccCodewordsPerBlock, numBlocks]
    1: { size: 21, dataCap: 16, eccLen: 10, blocks: 1 },
    2: { size: 25, dataCap: 28, eccLen: 16, blocks: 1, align: [6, 18] },
    3: { size: 29, dataCap: 44, eccLen: 26, blocks: 1, align: [6, 22] },
    4: { size: 33, dataCap: 64, eccLen: 18, blocks: 2, align: [6, 26] },
    5: { size: 37, dataCap: 86, eccLen: 24, blocks: 2, align: [6, 30] },
    6: { size: 41, dataCap: 108, eccLen: 16, blocks: 4, align: [6, 34] },
    7: { size: 45, dataCap: 124, eccLen: 18, blocks: 4, align: [6, 22, 38] },
    8: { size: 49, dataCap: 154, eccLen: 22, blocks: 4, align: [6, 24, 42] }
};

// Alignment pattern table for versions 2..8
const ALIGNMENT_PATTERNS = {
    2: [6, 18],
    3: [6, 22],
    4: [6, 26],
    5: [6, 30],
    6: [6, 34],
    7: [6, 22, 38],
    8: [6, 24, 42]
};

// Format info strings for EC Level M (00) with masks 0..7
const FORMAT_BITS_M = [
    0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0
];

class QRCode {
    constructor(version, mask = 0) {
        this.version = version;
        this.spec = QR_SPECS[version];
        this.size = this.spec.size;
        this.mask = mask;
        this.modules = Array.from({ length: this.size }, () => new Array(this.size).fill(null));
        this.isFunction = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
    }

    _setModule(r, c, val, isFunc = false) {
        if (r >= 0 && r < this.size && c >= 0 && c < this.size) {
            this.modules[r][c] = val;
            if (isFunc) this.isFunction[r][c] = true;
        }
    }

    _drawFinder(r, c) {
        for (let dy = -1; dy <= 7; dy++) {
            for (let dx = -1; dx <= 7; dx++) {
                const y = r + dy;
                const x = c + dx;
                if (y < 0 || y >= this.size || x < 0 || x >= this.size) continue;
                if (dy === -1 || dy === 7 || dx === -1 || dx === 7) {
                    this._setModule(y, x, false, true); // Separator
                } else if (dy === 0 || dy === 6 || dx === 0 || dx === 6 ||
                    (dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4)) {
                    this._setModule(y, x, true, true);
                } else {
                    this._setModule(y, x, false, true);
                }
            }
        }
    }

    _drawAlignment(r, c) {
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                const y = r + dy;
                const x = c + dx;
                if (this.isFunction[y][x]) continue;
                const isBorder = Math.max(Math.abs(dy), Math.abs(dx)) === 2;
                const isCenter = dy === 0 && dx === 0;
                this._setModule(y, x, isBorder || isCenter, true);
            }
        }
    }

    _drawTimingPatterns() {
        for (let i = 8; i < this.size - 8; i++) {
            const val = (i % 2 === 0);
            if (!this.isFunction[6][i]) this._setModule(6, i, val, true);
            if (!this.isFunction[i][6]) this._setModule(i, 6, val, true);
        }
    }

    _drawFunctionPatterns() {
        // Finders
        this._drawFinder(0, 0);
        this._drawFinder(0, this.size - 7);
        this._drawFinder(this.size - 7, 0);

        // Alignment patterns
        const aligns = ALIGNMENT_PATTERNS[this.version] || [];
        for (let r of aligns) {
            for (let c of aligns) {
                if ((r === 6 && c === 6) ||
                    (r === 6 && c === this.size - 7) ||
                    (r === this.size - 7 && c === 6)) {
                    continue;
                }
                this._drawAlignment(r, c);
            }
        }

        // Timing
        this._drawTimingPatterns();

        // Dark module
        this._setModule(4 * this.version + 9, 8, true, true);

        // Reserve format info area
        for (let i = 0; i < 9; i++) {
            if (!this.isFunction[8][i]) this._setModule(8, i, false, true);
            if (!this.isFunction[i][8]) this._setModule(i, 8, false, true);
        }
        for (let i = 0; i < 8; i++) {
            if (!this.isFunction[8][this.size - 1 - i]) this._setModule(8, this.size - 1 - i, false, true);
            if (!this.isFunction[this.size - 1 - i][8]) this._setModule(this.size - 1 - i, 8, false, true);
        }
    }

    _applyFormatBits(mask) {
        const bits = FORMAT_BITS_M[mask];
        for (let i = 0; i < 15; i++) {
            const bit = ((bits >> i) & 1) === 1;
            // Top-left finder
            if (i < 6) this._setModule(8, i, bit);
            else if (i === 6) this._setModule(8, 7, bit);
            else if (i === 7) this._setModule(8, 8, bit);
            else if (i === 8) this._setModule(7, 8, bit);
            else this._setModule(14 - i, 8, bit);

            // Bottom-left / Top-right finders
            if (i < 8) this._setModule(this.size - 1 - i, 8, bit);
            else this._setModule(8, this.size - 15 + i, bit);
        }
    }

    _maskCondition(r, c, mask) {
        switch (mask) {
            case 0: return (r + c) % 2 === 0;
            case 1: return r % 2 === 0;
            case 2: return c % 3 === 0;
            case 3: return (r + c) % 3 === 0;
            case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
            case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
            case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
            case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
            default: return false;
        }
    }

    _writeCodewords(codewords, mask) {
        let bitIndex = 0;
        const totalBits = codewords.length * 8;
        let right = this.size - 1;
        let upward = true;

        while (right > 0) {
            if (right === 6) right--; // Skip vertical timing column

            for (let vert = 0; vert < this.size; vert++) {
                const r = upward ? (this.size - 1 - vert) : vert;
                for (let dx = 0; dx < 2; dx++) {
                    const c = right - dx;
                    if (this.isFunction[r][c]) continue;

                    let bit = false;
                    if (bitIndex < totalBits) {
                        const byteVal = codewords[Math.floor(bitIndex / 8)];
                        bit = ((byteVal >> (7 - (bitIndex % 8))) & 1) === 1;
                        bitIndex++;
                    }

                    // Apply mask
                    if (this._maskCondition(r, c, mask)) {
                        bit = !bit;
                    }

                    this._setModule(r, c, bit);
                }
            }
            right -= 2;
            upward = !upward;
        }
    }
}

/**
 * Encodes string to Byte Mode data stream with Reed-Solomon codewords
 */
function encodeData(text, version) {
    const spec = QR_SPECS[version];
    const rawBytes = Buffer.from(text, 'utf-8');
    const totalDataCap = spec.dataCap;

    const bits = [];
    function appendBits(val, len) {
        for (let i = len - 1; i >= 0; i--) {
            bits.push((val >> i) & 1);
        }
    }

    // Mode indicator: 0100 (Byte mode)
    appendBits(0b0100, 4);

    // Character count indicator (8 bits for V1..9)
    appendBits(rawBytes.length, 8);

    // Data payload
    for (let b of rawBytes) {
        appendBits(b, 8);
    }

    // Terminator (up to 4 zeroes)
    const termLen = Math.min(4, totalDataCap * 8 - bits.length);
    appendBits(0, termLen);

    // Byte alignment padding
    while (bits.length % 8 !== 0) {
        bits.push(0);
    }

    // Convert bits to byte array
    const dataBytes = [];
    for (let i = 0; i < bits.length; i += 8) {
        let b = 0;
        for (let j = 0; j < 8; j++) {
            b = (b << 1) | bits[i + j];
        }
        dataBytes.push(b);
    }

    // Pad with 0xEC, 0x11 alternating
    let padToggle = true;
    while (dataBytes.length < totalDataCap) {
        dataBytes.push(padToggle ? 0xec : 0x11);
        padToggle = !padToggle;
    }

    // Distribute into blocks & compute Reed-Solomon ECC
    const numBlocks = spec.blocks;
    const eccPerBlock = spec.eccLen;
    const blockSize = Math.floor(dataBytes.length / numBlocks);

    const dataBlocks = [];
    const eccBlocks = [];

    for (let i = 0; i < numBlocks; i++) {
        const start = i * blockSize;
        const end = (i === numBlocks - 1) ? dataBytes.length : start + blockSize;
        const blockData = dataBytes.slice(start, end);
        dataBlocks.push(blockData);
        eccBlocks.push(Array.from(rsCalculateEcc(blockData, eccPerBlock)));
    }

    // Interleave data codewords
    const finalCodewords = [];
    let maxBlockLen = Math.max(...dataBlocks.map(b => b.length));
    for (let i = 0; i < maxBlockLen; i++) {
        for (let b = 0; b < numBlocks; b++) {
            if (i < dataBlocks[b].length) {
                finalCodewords.push(dataBlocks[b][i]);
            }
        }
    }

    // Interleave ECC codewords
    for (let i = 0; i < eccPerBlock; i++) {
        for (let b = 0; b < numBlocks; b++) {
            finalCodewords.push(eccBlocks[b][i]);
        }
    }

    return finalCodewords;
}

/**
 * Finds the minimum fitting QR version
 */
function findBestVersion(text) {
    const len = Buffer.byteLength(text, 'utf-8');
    for (let v = 1; v <= 8; v++) {
        const cap = QR_SPECS[v].dataCap;
        // Byte mode overhead: 4 bits mode + 8 bits count = 1.5 bytes -> need len + 2 bytes <= cap
        if (len + 3 <= cap) {
            return v;
        }
    }
    throw new Error(`URL demasiado larga para QR de terminal (${len} bytes).`);
}

/**
 * Generates the QR Matrix
 */
function generateMatrix(text, mask = 0) {
    const version = findBestVersion(text);
    const qr = new QRCode(version, mask);
    qr._drawFunctionPatterns();
    const codewords = encodeData(text, version);
    qr._writeCodewords(codewords, mask);
    qr._applyFormatBits(mask);
    return qr.modules;
}

/**
 * Renders QR Matrix to ANSI Terminal using Unicode half blocks (▀, ▄, █, ' ')
 * With white quiet-zone border for maximum phone camera contrast.
 */
function renderToTerminal(text, { border = 2 } = {}) {
    const matrix = generateMatrix(text, 0);
    const size = matrix.length;
    const paddedSize = size + border * 2;

    // Build boolean grid with border (false = light/white, true = dark/black)
    const grid = Array.from({ length: paddedSize }, () => new Array(paddedSize).fill(false));
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            grid[r + border][c + border] = matrix[r][c] === true;
        }
    }

    const lines = [];
    // Render 2 vertical rows per character line using Unicode half-blocks
    // We use standard inverted terminal display: Background is white (\x1b[47m), text is black (\x1b[30m)
    for (let r = 0; r < paddedSize; r += 2) {
        let line = '  '; // Indent
        for (let c = 0; c < paddedSize; c++) {
            const top = grid[r][c];
            const bottom = (r + 1 < paddedSize) ? grid[r + 1][c] : false;

            if (top && bottom) {
                // Both dark
                line += ' ';
            } else if (top && !bottom) {
                // Top dark, bottom light
                line += '▄';
            } else if (!top && bottom) {
                // Top light, bottom dark
                line += '▀';
            } else {
                // Both light
                line += '█';
            }
        }
        lines.push(line);
    }

    return lines.join('\n');
}

module.exports = {
    generateMatrix,
    renderToTerminal
};
