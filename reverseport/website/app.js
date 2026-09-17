/**
 * ReversePort Interactive App Engine
 * Minimalist Developer Pro (Linear / Vercel / Railway)
 */

// 1. GESTOR DE COPIA Y FEEDBACK
function copyHeroCommand(cmd = 'npx rport-go 3000') {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(cmd).then(() => onCopySuccess(cmd));
    } else {
        // Fallback para entornos antiguos
        const textArea = document.createElement('textarea');
        textArea.value = cmd;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            onCopySuccess(cmd);
        } catch (e) {
            console.error('Fallo al copiar:', e);
        }
        document.body.removeChild(textArea);
    }
}

function onCopySuccess(cmd) {
    showToast(`Copiado: ${cmd}`);

    // Provocar reacción del pulpo 3D si está cargado
    if (window.octopusEngine) {
        window.octopusEngine.triggerAttack();
    }

    // Efecto en botón del Hero
    const textEl = document.getElementById('hero-copy-text');
    const iconEl = document.getElementById('hero-copy-icon');

    if (textEl) textEl.innerText = '¡Copiado!';
    if (iconEl && window.lucide) {
        iconEl.setAttribute('data-lucide', 'check');
        lucide.createIcons();
    }

    setTimeout(() => {
        if (textEl) textEl.innerText = 'Copiar';
        if (iconEl && window.lucide) {
            iconEl.setAttribute('data-lucide', 'copy');
            lucide.createIcons();
        }
    }, 2000);
}

// 2. GESTOR DE PESTAÑAS DEL WIDGET DEL HERO
function switchWidgetTab(tabName) {
    const tabs = document.querySelectorAll('.terminal-tabs .tab-item');
    const panels = document.querySelectorAll('.stage-card .tab-panel');

    tabs.forEach(t => t.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));

    const activeBtn = Array.from(tabs).find(t => t.innerText.toLowerCase().includes(tabName.toLowerCase()));
    if (activeBtn) activeBtn.classList.add('active');

    const targetPanel = document.getElementById(`panel-${tabName}`);
    if (targetPanel) targetPanel.classList.add('active');
}

// 3. SIMULACION INTERACTIVA DE REPLAY EN INSPECTOR
function triggerSimulatedReplay() {
    const replayRow = document.getElementById('sim-row-3');
    const statusEl = document.getElementById('sim-status-replay');
    const timeEl = document.getElementById('sim-time-replay');

    if (statusEl) statusEl.innerText = 'Reenviando...';
    if (replayRow) replayRow.style.background = 'rgba(0, 240, 255, 0.15)';

    // Provocar pulso en el Guardián 3D
    if (window.octopusEngine) {
        window.octopusEngine.triggerAttack();
    }

    setTimeout(() => {
        const randomTime = Math.floor(Math.random() * 8) + 8;
        if (statusEl) statusEl.innerText = '200 OK';
        if (timeEl) timeEl.innerText = `${randomTime}ms`;
        if (replayRow) replayRow.style.background = '';
        showToast(`⚡ Replay exitoso en 127.0.0.1:3000 (HTTP 200 OK en ${randomTime}ms)`);
    }, 450);
}

// 4. SELECTOR DE CASOS DE USO
const USE_CASES = {
    webhooks: {
        title: 'Depura Webhooks de Stripe y Shopify en Vivo',
        desc: 'Conecta los eventos de producción o sandbox de Stripe y Shopify a tu servidor local. Si falla la lógica de negocio, reenvía el payload exacto con el botón Replay desde localhost:4040.',
        cmd: 'npx rport-go 8080 mi-webhook',
        metricVal: '< 15 ms',
        metricSub: 'Piping TCP directo en Node.js'
    },
    mobile: {
        title: 'Prueba tu API Local en iPhone y Android',
        desc: 'Escanea el código QR renderizado en tu consola directamente con la cámara de tu smartphone para abrir la app web o conectarla a tu frontend Flutter/React Native.',
        cmd: 'npx rport-go 3000',
        metricVal: '0 s',
        metricSub: 'Sin necesidad de túneles manuales'
    },
    demos: {
        title: 'Comparte Prototipos con Clientes sin Desplegar',
        desc: 'Envía un enlace seguro HTTPS con tu subdominio personalizado a inversionistas o clientes para que interactúen con tu avance en tiempo real desde tu propia máquina.',
        cmd: 'npx rport-go 3000 demo-cliente',
        metricVal: '100%',
        metricSub: 'SSL Wildcard automático cifrado'
    },
    databases: {
        title: 'Conexión Remota a PostgreSQL y Terminal SSH',
        desc: 'Expón tu base de datos local o puerto SSH a través de un túnel TCP puro con un puerto público dinámico del Hub (10000-10100) sin restricciones HTTP.',
        cmd: 'npx rport-go --tcp 5432',
        metricVal: 'TCP Puro',
        metricSub: 'Soporte Postgres, MySQL, Redis, SSH'
    }
};

function switchUseCase(key) {
    const data = USE_CASES[key];
    if (!data) return;

    document.querySelectorAll('.usecase-tabs .uc-tab').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');

    document.getElementById('uc-title').innerText = data.title;
    document.getElementById('uc-desc').innerText = data.desc;
    document.getElementById('uc-cmd').innerText = data.cmd;
    document.querySelector('.uc-metric-card .metric-val').innerText = data.metricVal;
    document.querySelector('.uc-metric-card .metric-sub').innerText = data.metricSub;
}

// 5. TOAST NOTIFICATIONS
function showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast-item';
    toast.innerText = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 2800);
}

// 6. MODAL DE TERMINOS
export function toggleTerms() {
    const modal = document.getElementById('termsBubble');
    if (modal) modal.classList.toggle('active');
}

// Exponer funciones globales para los atributos onclick de HTML
window.copyHeroCommand = copyHeroCommand;
window.switchWidgetTab = switchWidgetTab;
window.triggerSimulatedReplay = triggerSimulatedReplay;
window.switchUseCase = switchUseCase;
window.showToast = showToast;
window.toggleTerms = toggleTerms;

document.addEventListener('DOMContentLoaded', () => {
    if (window.lucide) {
        lucide.createIcons();
    }
    console.log('🐙 ReversePort Developer Pro UI Initialized.');
});
