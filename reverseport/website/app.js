// Initialize Lucide Icons
lucide.createIcons();

// --- REVEAL ON SCROLL ---
const reveals = document.querySelectorAll(".reveal");

function handleScroll() {
    reveals.forEach((el) => {
        const windowHeight = window.innerHeight;
        const elementTop = el.getBoundingClientRect().top;
        const elementVisible = 100;

        if (elementTop < windowHeight - elementVisible) {
            el.classList.add("active");
        }
    });
}

window.addEventListener("scroll", handleScroll);
window.addEventListener("load", handleScroll); // Trigger on load for elements above fold

// Navigation Scroll Reveal
window.addEventListener('scroll', () => {
    const nav = document.querySelector('nav');
    if (window.scrollY > 50) {
        nav.classList.add('scrolled');
    } else {
        nav.classList.remove('scrolled');
    }
});

// Terms Bubble Toggle
function toggleTerms() {
    const bubble = document.getElementById('termsBubble');
    bubble.classList.toggle('active');
}

// --- COPY COMMAND TO CLIPBOARD ---
function copyCommand() {
    const command = "npx reverseport --subdomain hola";
    navigator.clipboard.writeText(command).then(() => {
        const btn = document.querySelector(".btn-copy");
        const originalIcon = btn.innerHTML;

        btn.innerHTML = '<i data-lucide="check"></i>';
        lucide.createIcons(); // Re-render icon

        setTimeout(() => {
            btn.innerHTML = originalIcon;
            lucide.createIcons();
        }, 2000);
    });
}

// --- SCROLL TO DOCS ---
function scrollToDocs() {
    const features = document.getElementById("features");
    features.scrollIntoView({ behavior: 'smooth' });
}

// --- INTERACTIVE TERMINAL ---
const terminalInput = document.getElementById("terminal-input");
const terminalHistory = document.getElementById("terminal-history");

const COMMANDS = {
    'help': 'Comandos disponibles: help, status, octopus, clear, npx',
    'status': ' -- Abismo en linea | Servidor: reverseport.net | Estado: Listo',
    'octopus': () => { spawnSwimmingOctopus(); return '<img src="assets/pulpo_terminal.svg" class="terminal-icon"> El pulpo extiende sus tentáculos...'; },
    'octupus': () => { spawnSwimmingOctopus(); return '<img src="assets/pulpo_terminal.svg" class="terminal-icon"> El pulpo extiende sus tentáculos... (¡Casi! El pulpo te perdona... por ahora)'; },
    'pulpo': () => { spawnSwimmingOctopus(); return '<img src="assets/pulpo_terminal.svg" class="terminal-icon"> El pulpo extiende sus tentáculos...'; },
    'clear': '',
    'npx': 'Uso: npx reverseport --subdomain [tu-nombre]'
};

function focusTerminal() {
    terminalInput.focus();
}

terminalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        const fullCommand = terminalInput.value.trim();
        const cmdParts = fullCommand.split(' ');
        const cmd = cmdParts[0].toLowerCase();

        // Add to history
        const line = document.createElement("p");
        line.innerHTML = `<span class="prompt">$</span> ${fullCommand}`;
        terminalHistory.appendChild(line);

        // Process command
        let response = "";
        if (cmd === 'clear') {
            terminalHistory.innerHTML = "";
        } else if (fullCommand.includes('npx reverseport')) {
            const subdomain = cmdParts.find(p => p !== '--subdomain' && p !== 'npx' && p !== 'reverseport');
            simulateTunnel(subdomain || 'tu-dominio');
        } else if (COMMANDS[cmd]) {
            if (typeof COMMANDS[cmd] === 'function') {
                response = COMMANDS[cmd]();
            } else {
                response = COMMANDS[cmd];
            }
        } else if (cmd !== "") {
            response = `Comando no encontrado: ${cmd}. Escribe 'help'.`;
        }

        if (response) {
            const respLine = document.createElement("p");
            respLine.className = "success";
            respLine.innerHTML = response;
            terminalHistory.appendChild(respLine);
        }

        terminalInput.value = "";
        terminalHistory.scrollTop = terminalHistory.scrollHeight;
    }
});

function simulateTunnel(name) {
    const lines = [
        `--- Iniciando cliente reversePort ---`,
        `Subdominio: ${name}`,
        `Redirigiendo a: localhost:3000`,
        `Canal de CONTROL conectado.`,
        `Solicitud de conexión: 6347xxxx-xxxx...`
    ];

    let i = 0;
    const interval = setInterval(() => {
        if (i < lines.length) {
            const line = document.createElement("p");
            line.className = i === 0 || i === 3 ? "success" : "";
            if (i === 1 || i === 2) line.innerHTML = `${lines[i].split(': ')[0]}: <span class="highlight">${lines[i].split(': ')[1]}</span>`;
            else line.innerText = lines[i];
            terminalHistory.appendChild(line);
            terminalHistory.scrollTop = terminalHistory.scrollHeight;
            i++;
        } else {
            clearInterval(interval);
        }
    }, 400);
}

// --- WALKING OCTOPUS ANIMATION ---
const walker = document.getElementById("walking-octopus");
const artBox = document.querySelector(".ascii-art");

function moveOctopus() {
    if (!walker || !artBox) return;

    const box = artBox.getBoundingClientRect();
    const parent = artBox.parentElement.getBoundingClientRect();

    const width = box.width;
    const height = box.height;
    const offsetLeft = box.left - parent.left;
    const offsetTop = box.top - parent.top;

    let step = 0;
    const speed = 0.002;

    function animate() {
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

        walker.style.left = `${x}px`;
        walker.style.top = `${y}px`;
        walker.style.transform = `rotate(${angle}deg)`;

        requestAnimationFrame(animate);
    }
    animate();
}

// --- SWIMMING OCTOPUS LOGIC ---
function spawnSwimmingOctopus() {
    const body = document.getElementById("terminal-body");
    const octopus = document.createElement("div");
    octopus.className = "swimming-octopus";
    octopus.innerHTML = '<img src="assets/pulpo_terminal.svg" alt="Pulpo Nadador">';
    body.appendChild(octopus);

    const rect = body.getBoundingClientRect();
    let x = Math.random() * (rect.width - 50);
    let y = Math.random() * (rect.height - 100); // Keep away from input

    octopus.style.left = `${x}px`;
    octopus.style.top = `${y}px`;

    let dx = (Math.random() - 0.5) * 3;
    let dy = (Math.random() - 0.5) * 3;

    function swim() {
        if (!octopus.parentElement) return;

        x += dx;
        y += dy;

        if (x <= 0 || x >= rect.width - 50) dx *= -1;
        if (y <= 0 || y >= rect.height - 50) dy *= -1;

        octopus.style.left = `${x}px`;
        octopus.style.top = `${y}px`;

        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        octopus.style.transform = `rotate(${angle + 90}deg)`;

        requestAnimationFrame(swim);
    }

    requestAnimationFrame(swim);

    setTimeout(() => {
        octopus.style.opacity = '0';
        setTimeout(() => octopus.remove(), 1000);
    }, 8000);
}

// Initial reveal and start walking
setTimeout(() => {
    handleScroll();
    moveOctopus();
    // Spawn some octopuses on entry for the "wow" effect
    spawnSwimmingOctopus();
    setTimeout(spawnSwimmingOctopus, 1000);
    setTimeout(spawnSwimmingOctopus, 2000);
}, 500);
