/**
 * ReversePort Landing Page - GoF Architecture Refactoring
 * 
 * Patrones implementados:
 * - Observer Pattern: IntersectionObserver para scroll reveal sin layout thrashing (60fps).
 * - Adapter Pattern: ClipboardAdapter para copia universal multiplataforma con fallback.
 * - Command Pattern: TerminalCommand para desacoplar el CLI interactivo del DOM.
 * - Facade Pattern: TerminalFacade y AnimationFacade para encapsular subsistemas complejos.
 * - State Pattern: Gestión de estados (IDLE / SIMULATING) en la terminal para prevenir carreras.
 * - Factory Method Pattern: OctopusFactory para creación y ciclo de vida de partículas animadas.
 */

// ==========================================
// 1. OBSERVER PATTERN: Visibilidad y Scroll
// ==========================================
class ScrollVisibilityObserver {
    constructor() {
        this.observer = null;
        this._init();
    }

    _init() {
        const reveals = document.querySelectorAll(".reveal");
        if (!reveals.length) return;

        // Observer Pattern nativo: Consumo de CPU ~0% comparado con scroll polling
        this.observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("active");
                    obs.unobserve(entry.target); // Dejar de observar una vez visible
                }
            });
        }, {
            threshold: 0.15,
            rootMargin: "0px 0px -50px 0px"
        });

        reveals.forEach(el => this.observer.observe(el));

        // Observer para la barra de navegación
        this._setupNavScroll();
    }

    _setupNavScroll() {
        const nav = document.querySelector('nav');
        if (!nav) return;

        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    if (window.scrollY > 50) {
                        nav.classList.add('scrolled');
                    } else {
                        nav.classList.remove('scrolled');
                    }
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
    }
}

// ==========================================
// 2. ADAPTER PATTERN: Portapapeles Universal
// ==========================================
class ClipboardAdapter {
    static async copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (err) {
                console.warn("[ClipboardAdapter] Falló API moderna, usando fallback execCommand", err);
            }
        }

        // Fallback Adapter para contextos HTTP o navegadores legacy
        return this._fallbackCopy(text);
    }

    static _fallbackCopy(text) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        let success = false;
        try {
            success = document.execCommand('copy');
        } catch (err) {
            console.error("[ClipboardAdapter] Fallback execCommand falló:", err);
        }
        document.body.removeChild(textArea);
        return success;
    }
}

// ==========================================
// 3. FACTORY METHOD PATTERN: Partículas
// ==========================================
class OctopusFactory {
    static createSwimmingOctopus(containerRect) {
        const octopus = document.createElement("div");
        octopus.className = "swimming-octopus";

        const img = document.createElement("img");
        img.src = "assets/pulpo_terminal.svg";
        img.alt = "Pulpo Nadador";
        octopus.appendChild(img);

        const x = Math.random() * (containerRect.width - 50);
        const y = Math.random() * (containerRect.height - 100);

        octopus.style.left = `${x}px`;
        octopus.style.top = `${y}px`;

        return {
            element: octopus,
            x,
            y,
            dx: (Math.random() - 0.5) * 3,
            dy: (Math.random() - 0.5) * 3
        };
    }
}

// ==========================================
// 4. COMMAND PATTERN: Terminal Interactiva
// ==========================================
class TerminalCommand {
    execute(args, terminalFacade) {
        throw new Error("Method execute() must be implemented");
    }
}

class HelpCommand extends TerminalCommand {
    execute(args, terminal) {
        terminal.printSuccess("Comandos disponibles: help, status, octopus, clear, npx");
    }
}

class StatusCommand extends TerminalCommand {
    execute(args, terminal) {
        terminal.printSuccess("🐙 -- Abismo en línea | Servidor: reverseport.net | Estado: Listo (GoF Engine V2.0)");
    }
}

class ClearCommand extends TerminalCommand {
    execute(args, terminal) {
        terminal.clear();
    }
}

class OctopusCommand extends TerminalCommand {
    execute(args, terminal) {
        window.animationFacade.spawnSwimmingOctopus();
        const html = '<img src="assets/pulpo_terminal.svg" class="terminal-icon" alt="🐙"> El pulpo extiende sus tentáculos...';
        terminal.printHtml(html);
    }
}

class SimulateTunnelCommand extends TerminalCommand {
    execute(args, terminal) {
        let subdomain = 'mi-app';
        const subIndex = args.indexOf('--subdomain');
        if (subIndex !== -1 && args[subIndex + 1]) {
            subdomain = args[subIndex + 1];
        } else {
            const possible = args.find(a => a !== 'npx' && a !== 'reverseport' && !a.startsWith('-'));
            if (possible) subdomain = possible;
        }

        terminal.simulateTunnel(subdomain);
    }
}

class UnknownCommand extends TerminalCommand {
    execute(args, terminal) {
        terminal.printError(`Comando no encontrado: "${args[0]}". Escribe 'help' para ver la lista de comandos.`);
    }
}

// ==========================================
// 5. FACADE & STATE PATTERN: Terminal
// ==========================================
const TerminalState = {
    IDLE: 'IDLE',
    SIMULATING: 'SIMULATING'
};

class TerminalFacade {
    constructor() {
        this.input = document.getElementById("terminal-input");
        this.history = document.getElementById("terminal-history");
        this.state = TerminalState.IDLE;
        this.commands = new Map();
        this.activeInterval = null;

        this._registerDefaultCommands();
        this._setupEventListeners();
    }

    _registerDefaultCommands() {
        this.commands.set('help', new HelpCommand());
        this.commands.set('status', new StatusCommand());
        this.commands.set('clear', new ClearCommand());
        this.commands.set('octopus', new OctopusCommand());
        this.commands.set('octupus', new OctopusCommand());
        this.commands.set('pulpo', new OctopusCommand());
        this.commands.set('npx', new SimulateTunnelCommand());
        this.commands.set('reverseport', new SimulateTunnelCommand());
    }

    _setupEventListeners() {
        if (!this.input) return;

        this.input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                this._handleEnter();
            }
        });
    }

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    _handleEnter() {
        const rawText = this.input.value.trim();
        this.input.value = "";
        if (!rawText) return;

        // Sanitización contra XSS en el prompt
        const safeText = this._escapeHtml(rawText);
        const promptLine = document.createElement("p");
        promptLine.innerHTML = `<span class="prompt">$</span> ${safeText}`;
        this.history.appendChild(promptLine);

        // Si la terminal está ocupada simulando, avisar al usuario (State Pattern)
        if (this.state === TerminalState.SIMULATING) {
            this.printError("El túnel ya se está iniciando... espera un momento.");
            this._scrollToBottom();
            return;
        }

        const tokens = rawText.split(/\s+/);
        const mainCommand = tokens[0].toLowerCase();

        let cmdHandler = this.commands.get(mainCommand);

        if (!cmdHandler && (rawText.includes('npx reverseport') || rawText.startsWith('rport'))) {
            cmdHandler = this.commands.get('npx');
        }

        if (!cmdHandler) {
            cmdHandler = new UnknownCommand();
        }

        cmdHandler.execute(tokens, this);
        this._scrollToBottom();
    }

    printSuccess(text) {
        const line = document.createElement("p");
        line.className = "success";
        line.textContent = text;
        this.history.appendChild(line);
        this._scrollToBottom();
    }

    printHtml(html) {
        const line = document.createElement("p");
        line.className = "success";
        line.innerHTML = html;
        this.history.appendChild(line);
        this._scrollToBottom();
    }

    printError(text) {
        const line = document.createElement("p");
        line.style.color = "#ff5555";
        line.textContent = text;
        this.history.appendChild(line);
        this._scrollToBottom();
    }

    clear() {
        this.history.innerHTML = "";
    }

    focus() {
        if (this.input) this.input.focus();
    }

    _scrollToBottom() {
        this.history.scrollTop = this.history.scrollHeight;
    }

    simulateTunnel(name) {
        if (this.activeInterval) clearInterval(this.activeInterval);
        this.state = TerminalState.SIMULATING;

        const safeName = this._escapeHtml(name);
        const lines = [
            `--- Iniciando cliente reversePort ---`,
            `Subdominio: ${safeName}`,
            `Redirigiendo a: localhost:3000`,
            `Canal de CONTROL conectado (ProtocolAdapter NDJSON activo).`,
            `Túnel público seguro: https://${safeName}.reverseport.net`
        ];

        let i = 0;
        this.activeInterval = setInterval(() => {
            if (i < lines.length) {
                const line = document.createElement("p");
                line.className = i === 0 || i === 3 || i === 4 ? "success" : "";

                if (i === 1 || i === 2) {
                    const parts = lines[i].split(': ');
                    line.innerHTML = `${parts[0]}: <span class="highlight">${parts[1]}</span>`;
                } else if (i === 4) {
                    line.innerHTML = `🚀 <span class="highlight">${lines[i]}</span>`;
                } else {
                    line.textContent = lines[i];
                }

                this.history.appendChild(line);
                this._scrollToBottom();
                i++;
            } else {
                clearInterval(this.activeInterval);
                this.activeInterval = null;
                this.state = TerminalState.IDLE;
            }
        }, 350);
    }
}

// ==========================================
// 6. FACADE PATTERN: Animaciones de Pulpos
// ==========================================
class AnimationFacade {
    constructor() {
        this.walker = document.getElementById("walking-octopus");
        this.artBox = document.querySelector(".ascii-art");
        this.terminalBody = document.getElementById("terminal-body");
    }

    initWalkingOctopus() {
        if (!this.walker || !this.artBox) return;

        const box = this.artBox.getBoundingClientRect();
        const parent = this.artBox.parentElement.getBoundingClientRect();

        const width = box.width;
        const height = box.height;
        const offsetLeft = box.left - parent.left;
        const offsetTop = box.top - parent.top;

        let step = 0;
        const speed = 0.002;

        const animate = () => {
            step += speed;
            if (step > 1) step = 0;

            let x, y, angle = 0;
            const perimeter = 2 * (width + height);
            const progress = step * perimeter;

            if (progress < width) {
                x = offsetLeft + progress;
                y = offsetTop - 12;
                angle = 0;
            } else if (progress < width + height) {
                x = offsetLeft + width - 12;
                y = offsetTop + (progress - width);
                angle = 90;
            } else if (progress < 2 * width + height) {
                x = offsetLeft + width - (progress - (width + height));
                y = offsetTop + height - 12;
                angle = 180;
            } else {
                x = offsetLeft - 12;
                y = offsetTop + height - (progress - (2 * width + height));
                angle = 270;
            }

            this.walker.style.left = `${x}px`;
            this.walker.style.top = `${y}px`;
            this.walker.style.transform = `rotate(${angle}deg)`;

            requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    }

    spawnSwimmingOctopus() {
        if (!this.terminalBody) return;

        const rect = this.terminalBody.getBoundingClientRect();
        const octopusData = OctopusFactory.createSwimmingOctopus(rect);
        this.terminalBody.appendChild(octopusData.element);

        let { element, x, y, dx, dy } = octopusData;

        const swim = () => {
            if (!element.parentElement) return;

            x += dx;
            y += dy;

            if (x <= 0 || x >= rect.width - 50) dx *= -1;
            if (y <= 0 || y >= rect.height - 100) dy *= -1;

            element.style.left = `${x}px`;
            element.style.top = `${y}px`;

            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            element.style.transform = `rotate(${angle + 90}deg)`;

            requestAnimationFrame(swim);
        };

        requestAnimationFrame(swim);

        // Limpieza de memoria (Garbage Collection preventiva)
        setTimeout(() => {
            element.style.opacity = '0';
            setTimeout(() => {
                if (element.parentElement) element.remove();
            }, 1000);
        }, 8000);
    }
}

// ==========================================
// 7. ARRANQUE E INTEGRACIÓN GLOBAL
// ==========================================
// ==========================================
// 8. TOAST NOTIFICATIONS MANAGER (Glassmorphism)
// ==========================================
class ToastManager {
    static show(message, iconName = 'check') {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = 'toast-message';
        toast.innerHTML = `
            <div class="toast-icon"><i data-lucide="${iconName}"></i></div>
            <span>${message}</span>
        `;
        container.appendChild(toast);

        if (window.lucide) {
            lucide.createIcons();
        }

        setTimeout(() => {
            toast.classList.add('toast-fadeout');
            setTimeout(() => {
                if (toast.parentElement) toast.remove();
            }, 300);
        }, 3200);
    }
}

// ==========================================
// 9. MOUSE SPOTLIGHT GLOW (Glassmorphism 2.0)
// ==========================================
class SpotlightGlowManager {
    constructor() {
        this.cards = document.querySelectorAll('.glass-card, .feature-card, .terminal-window');
        this._init();
    }

    _init() {
        this.cards.forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                card.style.setProperty('--mouse-x', `${x}px`);
                card.style.setProperty('--mouse-y', `${y}px`);
            });
        });
    }
}

// ==========================================
// 10. CANVAS DE PARTÍCULAS BIOLUMINISCENTES
// ==========================================
class BioluminescentCanvas {
    constructor() {
        this.canvas = document.getElementById('abyssal-canvas');
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.numParticles = 35;
        this.animationFrame = null;

        this._resize();
        this._createParticles();
        this._animate();

        window.addEventListener('resize', () => this._resize());
    }

    _resize() {
        this.width = this.canvas.width = window.innerWidth;
        this.height = this.canvas.height = window.innerHeight;
    }

    _createParticles() {
        this.particles = [];
        for (let i = 0; i < this.numParticles; i++) {
            this.particles.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                radius: Math.random() * 2.5 + 0.8,
                speedY: Math.random() * 0.35 + 0.1,
                speedX: (Math.random() - 0.5) * 0.2,
                alpha: Math.random() * 0.5 + 0.2,
                pulseSpeed: Math.random() * 0.02 + 0.005,
                color: Math.random() > 0.4 ? '124, 58, 237' : '6, 182, 212' // Violeta / Cyan
            });
        }
    }

    _animate() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        this.particles.forEach(p => {
            p.y -= p.speedY;
            p.x += Math.sin(p.y * 0.01) * p.speedX;
            p.alpha += Math.sin(Date.now() * p.pulseSpeed) * 0.005;
            const safeAlpha = Math.max(0.1, Math.min(0.7, p.alpha));

            if (p.y < -10) {
                p.y = this.height + 10;
                p.x = Math.random() * this.width;
            }

            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(${p.color}, ${safeAlpha})`;
            this.ctx.shadowBlur = 12;
            this.ctx.shadowColor = `rgba(${p.color}, 0.8)`;
            this.ctx.fill();
        });

        this.animationFrame = requestAnimationFrame(() => this._animate());
    }
}

// ==========================================
// 11. SELECTOR DE CASOS DE USO (Tabs Facade)
// ==========================================
const STACK_DATA = {
    nextjs: {
        title: "Next.js, Vite, React o Astro",
        desc: "Expón tu servidor frontend instantáneamente para probar responsive en tu celular o compartir avances con clientes.",
        command: "npx rport-go 3000",
        localAddr: "localhost:3000",
        publicAddr: "https://dev-frontend.reverseport.net"
    },
    whatsapp: {
        title: "Bot de WhatsApp o Webhook",
        desc: "Recibe webhooks de Meta Cloud API, BuilderBot o Baileys directamente en tu entorno local sin tocar routers ni puertos.",
        command: "npx rport-go 3008 --subdomain mi-bot",
        localAddr: "localhost:3008",
        publicAddr: "https://mi-bot.reverseport.net"
    },
    stripe: {
        title: "Stripe, PayPal o Mercadopago",
        desc: "Prueba webhooks de pagos en vivo en tu máquina local sin lidiar con certificados SSL autofirmados.",
        command: "npx rport-go 4242 --subdomain stripe-dev",
        localAddr: "localhost:4242",
        publicAddr: "https://stripe-dev.reverseport.net"
    },
    python: {
        title: "FastAPI, Django o Flask",
        desc: "Comparte tus APIs de Inteligencia Artificial, endpoints REST o microservicios Python con latencia mínima y conexión cifrada.",
        command: "npx rport-go 8000",
        localAddr: "localhost:8000",
        publicAddr: "https://api-python.reverseport.net"
    }
};

let currentSelectedCommand = "npx rport-go 3000";

function selectStack(stackKey, tabBtn) {
    const data = STACK_DATA[stackKey];
    if (!data) return;

    // Actualizar botones de tabs
    document.querySelectorAll('.case-tab').forEach(b => b.classList.remove('active'));
    if (tabBtn) tabBtn.classList.add('active');

    // Actualizar texto
    const titleEl = document.getElementById('caseTitle');
    const descEl = document.getElementById('caseDesc');
    const cmdEl = document.getElementById('caseCommand');
    const heroCmdEl = document.getElementById('heroMainCommand');

    if (titleEl) titleEl.textContent = data.title;
    if (descEl) descEl.textContent = data.desc;
    if (cmdEl) cmdEl.textContent = data.command;
    if (heroCmdEl) heroCmdEl.textContent = data.command;

    currentSelectedCommand = data.command;

    // Actualizar simulador visual de túnel
    const simLocal = document.getElementById('simLocalAddr');
    const simPublic = document.getElementById('simPublicAddr');
    if (simLocal) simLocal.textContent = data.localAddr;
    if (simPublic) simPublic.textContent = data.publicAddr;

    // Animar pulso en el simulador
    const hub = document.querySelector('.hub-icon');
    if (hub) {
        hub.style.transform = 'scale(1.25) rotate(10deg)';
        setTimeout(() => hub.style.transform = '', 400);
    }
}

function copyCaseCommand() {
    ClipboardAdapter.copyText(currentSelectedCommand).then(() => {
        ToastManager.show(`Comando copiado: ${currentSelectedCommand}`);
    });
}

// ==========================================
// 12. ARRANQUE E INTEGRACIÓN GLOBAL
// ==========================================
let terminalFacade = null;
let animationFacade = null;

document.addEventListener("DOMContentLoaded", () => {
    document.body.classList.add('js-ready');
    
    // Activar inmediatamente todos los elementos visibles en viewport
    document.querySelectorAll(".reveal").forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight + 150) {
            el.classList.add("active");
        }
    });

    if (window.lucide) {
        lucide.createIcons();
    }
    console.log("🐙 ReversePort Cyber-Abisal Engine (Visual 2.0 & GoF Patterns Active)");

    // Subsistemas
    new ScrollVisibilityObserver();
    new SpotlightGlowManager();
    new BioluminescentCanvas();
    terminalFacade = new TerminalFacade();
    animationFacade = new AnimationFacade();
    window.animationFacade = animationFacade;

    // Inicializar animaciones de pulpos
    animationFacade.initWalkingOctopus();
    setTimeout(() => {
        animationFacade.spawnSwimmingOctopus();
        setTimeout(() => animationFacade.spawnSwimmingOctopus(), 1200);
    }, 600);
});

// Funciones globales expuestas para los atributos onclick de HTML
function focusTerminal() {
    if (terminalFacade) terminalFacade.focus();
}

function copyCommand() {
    const cmd = currentSelectedCommand || "npx rport-go 3000";
    ClipboardAdapter.copyText(cmd).then(() => {
        const btn = document.querySelector(".btn-copy");
        if (btn) {
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<i data-lucide="check"></i>';
            if (window.lucide) lucide.createIcons();

            setTimeout(() => {
                btn.innerHTML = originalHtml;
                if (window.lucide) lucide.createIcons();
            }, 2000);
        }
        ToastManager.show(`¡Listo! Copiado al portapapeles: ${cmd}`);
    });
}

function scrollToDocs() {
    const section = document.getElementById("advantages") || document.getElementById("doc");
    if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
    }
}

function toggleTerms() {
    const bubble = document.getElementById('termsBubble');
    if (bubble) bubble.classList.toggle('active');
}
