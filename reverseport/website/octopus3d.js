/**
 * ReversePort 3D Cyber Octopus Engine
 * 
 * Renderiza el modelo 3D `pulbo_monstruo.glb` con Three.js, iluminación dinámica
 * reactiva al cursor del ratón, y mezcla de animaciones (idle y ataque).
 */

import * as THREE from 'https://esm.sh/three@0.162.0';
import { GLTFLoader } from 'https://esm.sh/three@0.162.0/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://esm.sh/three@0.162.0/examples/jsm/controls/OrbitControls.js';

export class CyberOctopus3D {
    constructor(containerId = 'canvas3d-container') {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.mixer = null;
        this.clock = new THREE.Clock();
        this.animations = new Map();
        this.currentAction = null;
        this.model = null;

        // Luces dinámicas
        this.cursorLight = null;
        this.rimLight = null;

        this.mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
        this.isAttacking = false;

        this._init();
    }

    _init() {
        const width = this.container.clientWidth || 420;
        const height = this.container.clientHeight || 420;

        // 1. Escena y Cámara
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
        this.camera.position.set(0, 0.5, 4.2);

        // 2. Renderer WebGL de alto rendimiento
        this.renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        this.container.appendChild(this.renderer.domElement);

        // 3. Controles de Órbita
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enableZoom = false; // Evita atrapar el scroll de la página
        this.controls.minPolarAngle = Math.PI / 3;
        this.controls.maxPolarAngle = Math.PI / 1.7;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 1.2;

        // 4. Sistema de Iluminación Cyber-Abisal
        this._setupLighting();

        // 5. Cargar Modelo 3D
        this._loadModel();

        // 6. Eventos de mouse y resize
        this._setupEvents();

        // 7. Bucle de animación
        this._animate();
    }

    _setupLighting() {
        // Luz ambiental sutil profunda
        const ambient = new THREE.AmbientLight(0x0a1020, 1.2);
        this.scene.add(ambient);

        // Luz Direccional Suave Frontal
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(2, 4, 3);
        this.scene.add(dirLight);

        // Luz de Cursor (Cian Neón que sigue al ratón)
        this.cursorLight = new THREE.PointLight(0x00f0ff, 3.5, 10);
        this.cursorLight.position.set(0, 1, 3);
        this.scene.add(this.cursorLight);

        // Rim Light Trasera (Violeta Abisal para silueta)
        this.rimLight = new THREE.PointLight(0x8a2be2, 4.0, 10);
        this.rimLight.position.set(0, -1, -2.5);
        this.scene.add(this.rimLight);

        // Luz de acento esmeralda inferior
        const bottomLight = new THREE.PointLight(0x10b981, 1.5, 8);
        bottomLight.position.set(0, -2, 1);
        this.scene.add(bottomLight);
    }

    _loadModel() {
        const progressBar = document.getElementById('octopus-load-progress');
        const loaderBadge = document.getElementById('octopus-loader-badge');

        const loader = new GLTFLoader();
        loader.load(
            'assets/pulbo_monstruo.glb',
            (gltf) => {
                this.model = gltf.scene;

                // Centrar y escalar automáticamente
                const box = new THREE.Box3().setFromObject(this.model);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                const scale = 2.4 / maxDim;

                this.model.scale.setScalar(scale);
                this.model.position.sub(center.multiplyScalar(scale));
                this.model.position.y -= 0.15; // Ajuste óptico en el marco

                // Optimizar materiales y sombras
                this.model.traverse((child) => {
                    if (child.isMesh && child.material) {
                        child.material.roughness = 0.45;
                        child.material.metalness = 0.25;
                    }
                });

                this.scene.add(this.model);

                // Configurar animaciones integradas
                if (gltf.animations && gltf.animations.length > 0) {
                    this.mixer = new THREE.AnimationMixer(this.model);

                    gltf.animations.forEach((clip) => {
                        const action = this.mixer.clipAction(clip);
                        this.animations.set(clip.name, action);
                    });

                    // Iniciar animación idle por defecto
                    const idleAction = this.animations.get('Armature|idle') || gltf.animations[0];
                    if (idleAction) {
                        idleAction.play();
                        this.currentAction = idleAction;
                    }
                }

                // Ocultar barra de carga
                if (loaderBadge) {
                    loaderBadge.style.opacity = '0';
                    setTimeout(() => loaderBadge.style.display = 'none', 400);
                }

                // Emite evento global cuando el pulpo está listo
                window.dispatchEvent(new CustomEvent('octopus_ready'));
            },
            (xhr) => {
                if (xhr.lengthComputable && progressBar) {
                    const percent = Math.round((xhr.loaded / xhr.total) * 100);
                    progressBar.style.width = percent + '%';
                    const textEl = document.getElementById('octopus-load-text');
                    if (textEl) textEl.innerText = `Sincronizando Guardián 3D (${percent}%)...`;
                }
            },
            (err) => {
                console.warn('[Three.js] No se pudo cargar el modelo 3D:', err);
                if (loaderBadge) loaderBadge.innerText = 'Modo 2D Activo';
            }
        );
    }

    _setupEvents() {
        // Seguir movimiento del cursor para luces y rotación sutil
        window.addEventListener('mousemove', (e) => {
            const rect = this.container.getBoundingClientRect();
            const relX = (e.clientX - (rect.left + rect.width / 2)) / (window.innerWidth / 2);
            const relY = (e.clientY - (rect.top + rect.height / 2)) / (window.innerHeight / 2);

            this.mouse.targetX = relX;
            this.mouse.targetY = relY;
        });

        // Click en el contenedor para provocar ataque interactivo
        this.container.addEventListener('click', () => {
            this.triggerAttack();
        });

        // Responsive resize
        const resizeObserver = new ResizeObserver(() => {
            if (!this.container || !this.renderer || !this.camera) return;
            const w = this.container.clientWidth;
            const h = this.container.clientHeight;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
        });
        resizeObserver.observe(this.container);
    }

    triggerAttack() {
        if (this.isAttacking || !this.mixer) return;
        const attackAction = this.animations.get('Armature|Atacar');
        if (!attackAction) return;

        this.isAttacking = true;
        this.controls.autoRotate = false;

        // Pulso de luz neón durante el ataque
        const origIntensity = this.cursorLight.intensity;
        this.cursorLight.intensity = 7.0;
        this.cursorLight.color.setHex(0xff0055);

        // Transición cruzada suave
        if (this.currentAction) {
            this.currentAction.crossFadeTo(attackAction, 0.2, true);
        }
        attackAction.reset().setLoop(THREE.LoopOnce).play();

        const onFinished = () => {
            this.mixer.removeEventListener('finished', onFinished);
            const idleAction = this.animations.get('Armature|idle');
            if (idleAction) {
                attackAction.crossFadeTo(idleAction, 0.4, true);
                idleAction.play();
                this.currentAction = idleAction;
            }
            this.cursorLight.intensity = origIntensity;
            this.cursorLight.color.setHex(0x00f0ff);
            this.controls.autoRotate = true;
            this.isAttacking = false;
        };

        this.mixer.addEventListener('finished', onFinished);
    }

    _animate() {
        requestAnimationFrame(() => this._animate());

        const delta = this.clock.getDelta();

        // Actualizar mixer de animación 3D
        if (this.mixer) {
            this.mixer.update(delta);
        }

        // Movimiento suave del cursor (Lerp)
        this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.05;
        this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.05;

        // Actualizar posición de la luz interactiva
        if (this.cursorLight) {
            this.cursorLight.position.x = this.mouse.x * 3.5;
            this.cursorLight.position.y = -this.mouse.y * 2.5 + 0.5;
        }

        // Leve balanceo sinusoidal abisal
        if (this.model && !this.isAttacking) {
            const time = this.clock.getElapsedTime();
            this.model.position.y += Math.sin(time * 1.5) * 0.0008;
            this.model.rotation.z = Math.sin(time * 0.8) * 0.03;
        }

        if (this.controls) {
            this.controls.update();
        }

        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }
}
