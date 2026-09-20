/**
 * ReversePort 3D Cyber Octopus Engine — Macro Cinematic Scrollytelling
 * 
 * - Hero 0% Macro: Pulpo colosal en primer plano enfocado en los tentáculos gigantes
 * - Transiciones de animación fluidas y robustas (Crossfade sin cortes)
 * - Partículas bioluminiscentes esféricas con textura radial suave (Glow Orbs, no cuadrados)
 * - Scrollytelling dinámico con curvas suaves de cámara y modelo
 * - Rendimiento 60 FPS según el skill `optimize-3d-scene`
 */

import * as THREE from 'https://esm.sh/three@0.162.0';
import { GLTFLoader } from 'https://esm.sh/three@0.162.0/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://esm.sh/three@0.162.0/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'https://esm.sh/three@0.162.0/examples/jsm/controls/OrbitControls.js';

export class CyberOctopus3D {
    constructor(containerId = 'stage3d-background') {
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
        this.particles = null;

        // Estaciones Cinemáticas de Scroll
        this.scrollProgress = 0;
        this.smoothScroll = 0;
        this.isUserInteracting = false;
        this.isRealigning = false;
        this.realignTimeout = null;

        // Poses iniciales (Pulpo Centrado, Monumental y Visible en Scroll 0%)
        this.currentCamPos = new THREE.Vector3(0, 0.1, 2.8);
        this.currentCamTarget = new THREE.Vector3(0, 0, 0);
        this.currentModelPos = new THREE.Vector3(0, 0.1, 0.1);
        this.currentModelRotY = 0;

        // Luces dinámicas
        this.cursorLight = null;
        this.rimLight = null;
        this.bottomLight = null;

        this.mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
        this.isAttacking = false;
        this.isVisible = true;

        // Interacción Dinámica con el Footer (Retirada detrás de la tarjeta y ataque)
        this.isRetreatingBehind = false;
        this.retreatZ = 0;
        this.retreatY = 0;
        this.hasAttackedInRetreat = false;

        this._init();
    }

    _init() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        // 1. Escena y Cámara inicial en el Hero Macro
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 100);
        this.camera.position.copy(this.currentCamPos);

        // 2. Renderer WebGL de alto rendimiento con DPR acotado a 1.75
        this.renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
        this.renderer.setClearColor(0x08090c, 1); // Fondo obsidiana permanente (anti-pantalla blanca)
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.35;
        this.container.appendChild(this.renderer.domElement);

        // 3. Controles de Órbita con amortiguación
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enableZoom = false; // El scroll del mouse conduce la página
        this.controls.minPolarAngle = Math.PI / 4;
        this.controls.maxPolarAngle = Math.PI / 1.5;
        this.controls.autoRotate = false;
        this.controls.target.copy(this.currentCamTarget);

        // Auto-reacomodo suave a la estación de scroll actual al soltar
        this.controls.addEventListener('start', () => {
            this.isUserInteracting = true;
            this.isRealigning = false;
            if (this.realignTimeout) {
                clearTimeout(this.realignTimeout);
                this.realignTimeout = null;
            }
        });

        this.controls.addEventListener('end', () => {
            this.isUserInteracting = false;
            if (this.realignTimeout) clearTimeout(this.realignTimeout);

            this.realignTimeout = setTimeout(() => {
                if (!this.isUserInteracting) {
                    this.isRealigning = true;
                }
            }, 750);
        });

        // 4. Sistema de Iluminación Cyber-Abisal
        this._setupLighting();

        // 5. Partículas Bioluminiscentes Abisales con Glow Circular Suave
        this._setupAbyssalParticles();

        // 6. Cargar Modelo 3D del Pulpo
        this._loadModel();

        // 7. Eventos de scroll, mouse y resize
        this._setupEvents();

        // 8. Bucle de animación continuo
        this._animate();
    }

    _setupLighting() {
        // Luz ambiental marina sutil profunda
        const ambient = new THREE.AmbientLight(0x0a1424, 1.8);
        this.scene.add(ambient);

        // Luz direccional frontal suave
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
        dirLight.position.set(2, 4, 3);
        this.scene.add(dirLight);

        // Luz frontal cian neón para resaltar piel y tentáculos
        const frontCyan = new THREE.DirectionalLight(0x00f0ff, 2.2);
        frontCyan.position.set(-2, 2, 4);
        this.scene.add(frontCyan);

        // Luz de cursor (Cian Neón que sigue al ratón)
        this.cursorLight = new THREE.PointLight(0x00f0ff, 5.0, 14);
        this.cursorLight.position.set(0, 1, 3);
        this.scene.add(this.cursorLight);

        // Rim Light trasera violeta abisal
        this.rimLight = new THREE.PointLight(0x8a2be2, 5.5, 14);
        this.rimLight.position.set(0, -0.5, -2.5);
        this.scene.add(this.rimLight);

        // Luz de acento esmeralda inferior
        this.bottomLight = new THREE.PointLight(0x10b981, 2.8, 10);
        this.bottomLight.position.set(0, -2, 1);
        this.scene.add(this.bottomLight);
    }

    /**
     * Genera una textura de partícula circular suave con degradado radial
     * para que luzcan como esferas de esporas/plancton brillante, no cuadros planos.
     */
    _createGlowParticleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
        gradient.addColorStop(0.2, 'rgba(0, 240, 255, 0.9)');
        gradient.addColorStop(0.5, 'rgba(138, 43, 226, 0.45)');
        gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    _setupAbyssalParticles() {
        const count = 90;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);

        const colorCyan = new THREE.Color(0x00f0ff);
        const colorPurple = new THREE.Color(0x8a2be2);
        const colorEmerald = new THREE.Color(0x10b981);

        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 8.5;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 7.0;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 5.5;

            const rnd = Math.random();
            const col = rnd < 0.6 ? colorCyan : (rnd < 0.85 ? colorPurple : colorEmerald);
            colors[i * 3] = col.r;
            colors[i * 3 + 1] = col.g;
            colors[i * 3 + 2] = col.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        // Partículas circulares esféricas luminosas
        const material = new THREE.PointsMaterial({
            size: 0.18,
            map: this._createGlowParticleTexture(),
            vertexColors: true,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.particles = new THREE.Points(geometry, material);
        this.scene.add(this.particles);
    }

    _loadModel() {
        const progressBar = document.getElementById('octopus-load-progress');
        const loaderBadge = document.getElementById('octopus-loader-badge');

        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

        const loader = new GLTFLoader();
        loader.setDRACOLoader(dracoLoader);

        const modelUrl = '/assets/cyber_octopus_v1.glb';

        const applyModel = (gltf) => {
            this.model = gltf.scene;

            // Centrar y escalar para que sea gigante y monumental
            const box = new THREE.Box3().setFromObject(this.model);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            
            // Escala colosal
            const scale = 3.5 / maxDim;

            this.model.scale.setScalar(scale);
            this.model.position.sub(center.multiplyScalar(scale));

            // Posición inicial en el Hero (Centrado monumental con tentáculos alrededor del Hero)
            this.model.position.set(0, 0.1, 0.1);
            this.model.rotation.set(0, 0, 0);

            // Optimizar materiales y reflejos abisales
            this.model.traverse((child) => {
                if (child.isMesh && child.material) {
                    child.material.roughness = 0.40;
                    child.material.metalness = 0.28;
                }
            });

            this.scene.add(this.model);

            // Configurar animaciones de tentáculos
            if (gltf.animations && gltf.animations.length > 0) {
                this.mixer = new THREE.AnimationMixer(this.model);

                gltf.animations.forEach((clip) => {
                    const action = this.mixer.clipAction(clip);
                    action.enabled = true;
                    this.animations.set(clip.name, action);
                });

                // Iniciar animación idle continua de tentáculos
                const idleAction = this.animations.get('Armature|idle') || gltf.animations[0];
                if (idleAction) {
                    idleAction.setLoop(THREE.LoopRepeat, Infinity);
                    idleAction.clampWhenFinished = false;
                    idleAction.setEffectiveTimeScale(1);
                    idleAction.setEffectiveWeight(1);
                    idleAction.play();
                    this.currentAction = idleAction;
                }
            }

            // Ocultar inmediatamente el loader overlay para revelar el pulpo
            if (loaderBadge) {
                loaderBadge.style.opacity = '0';
                setTimeout(() => {
                    loaderBadge.style.display = 'none';
                }, 250);
            }
            window.dispatchEvent(new CustomEvent('octopus_ready'));

            // Compilación de shaders en segundo plano
            if (this.renderer && typeof this.renderer.compileAsync === 'function') {
                this.renderer.compileAsync(this.scene, this.camera).catch(() => {});
            }
        };

        loader.load(
            modelUrl,
            (gltf) => {
                applyModel(gltf);
            },
            (xhr) => {
                if (xhr.lengthComputable && progressBar) {
                    const percent = Math.min(99, Math.round((xhr.loaded / xhr.total) * 100));
                    progressBar.style.width = percent + '%';
                    const textEl = document.getElementById('octopus-load-text');
                    if (textEl) textEl.innerText = `Invocando Guardián 3D (${percent}%)...`;
                }
            },
            (err) => {
                console.warn('[Three.js] Error en loader.load, intentando fallback de lectura directa:', err);
                fetch(modelUrl)
                    .then(res => res.arrayBuffer())
                    .then(buf => {
                        loader.parse(buf, '/', (gltf) => {
                            applyModel(gltf);
                        }, (parseErr) => {
                            console.error('[Three.js] Error al parsear en fallback:', parseErr);
                            if (loaderBadge) loaderBadge.style.display = 'none';
                        });
                    })
                    .catch(fetchErr => {
                        console.error('[Three.js] Fallo definitivo al cargar modelo:', fetchErr);
                        if (loaderBadge) loaderBadge.style.display = 'none';
                    });
            }
        );
    }

    _setupEvents() {
        // Seguir movimiento del cursor para luces reactivas y proximidad al footer
        window.addEventListener('mousemove', (e) => {
            const relX = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
            const relY = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
            this.mouse.targetX = relX;
            this.mouse.targetY = relY;

            // Detectar si el cursor se acerca a los textos del footer donde descansa el pulpo
            this._checkFooterProximity(e);
        }, { passive: true });

        // Eventos directos del footer para respuesta inmediata
        const footerEl = document.querySelector('.site-footer');
        if (footerEl) {
            footerEl.addEventListener('mouseenter', () => {
                this.setRetreatBehind(true);
            });
            footerEl.addEventListener('mouseleave', (e) => {
                const rect = footerEl.getBoundingClientRect();
                if (e.clientY < rect.top || e.clientY > rect.bottom || e.clientX < rect.left || e.clientX > rect.right) {
                    this.setRetreatBehind(false);
                }
            });
        }

        // Si el cursor sale de la ventana del navegador, restaurar posición frontal
        document.addEventListener('mouseleave', () => {
            if (this.isRetreatingBehind) {
                this.setRetreatBehind(false);
            }
        });

        // Scroll listener optimizado
        const onScroll = () => {
            const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
            this.scrollProgress = Math.min(Math.max(window.scrollY / maxScroll, 0), 1);
            if (this.isRetreatingBehind && this.scrollProgress < 0.70) {
                this.setRetreatBehind(false);
            }
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();

        // Control de visibilidad de pestaña (Ahorro de batería)
        document.addEventListener('visibilitychange', () => {
            this.isVisible = !document.hidden;
            if (this.isVisible) this.clock.getDelta(); // reset delta para evitar saltos
            if (!this.isVisible && this.isRetreatingBehind) {
                this.setRetreatBehind(false);
            }
        });

        // Click en el escenario para provocar ataque abisal (si no fue un arrastre de rotación)
        let isPointerDown = false;
        let hasMoved = false;
        let startX = 0, startY = 0;

        window.addEventListener('pointerdown', (e) => {
            // Solo registrar si el click fue directamente en el canvas o hero
            if (e.target.closest('button, a, input, pre, .terminal-tabs, .btn-copy-cmd, .command-box')) return;
            isPointerDown = true;
            hasMoved = false;
            startX = e.clientX;
            startY = e.clientY;
        });

        window.addEventListener('pointermove', (e) => {
            if (isPointerDown) {
                const dx = Math.abs(e.clientX - startX);
                const dy = Math.abs(e.clientY - startY);
                if (dx > 7 || dy > 7) hasMoved = true;
            }
        });

        window.addEventListener('pointerup', (e) => {
            if (isPointerDown && !hasMoved && !e.target.closest('button, a, input, pre, .command-box')) {
                // Si el click fue en la mitad superior o en área libre, provocar pulso abisal
                if (e.clientY < window.innerHeight * 0.7) {
                    this.triggerAttack();
                }
            }
            isPointerDown = false;
        });

        // Resize responsive
        window.addEventListener('resize', () => {
            if (!this.renderer || !this.camera) return;
            const w = window.innerWidth;
            const h = window.innerHeight;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
        });
    }

    /**
     * Evalúa la proximidad del cursor hacia los textos del footer
     */
    _checkFooterProximity(e) {
        const footerEl = document.querySelector('.site-footer');
        if (!footerEl) return;

        const rect = footerEl.getBoundingClientRect();
        const buffer = 40;
        const isNear = (
            e.clientY >= (rect.top - buffer) &&
            e.clientY <= (rect.bottom + buffer) &&
            e.clientX >= (rect.left - buffer) &&
            e.clientX <= (rect.right + buffer)
        );

        if (isNear && !this.isRetreatingBehind) {
            this.setRetreatBehind(true);
        } else if (!isNear && this.isRetreatingBehind) {
            this.setRetreatBehind(false);
        }
    }

    /**
     * Controla la transición de profundidad: se desliza hacia atrás de la tarjeta,
     * ejecuta el ataque abisal quedándose atrás, y al salir el cursor regresa al frente.
     */
    setRetreatBehind(state) {
        if (this.isRetreatingBehind === state) return;
        this.isRetreatingBehind = state;

        if (state) {
            document.body.classList.add('octopus-behind-footer');

            // Provocar ataque una vez que empieza a retirarse hacia atrás
            if (!this.hasAttackedInRetreat) {
                this.hasAttackedInRetreat = true;
                setTimeout(() => {
                    if (this.isRetreatingBehind) {
                        this.triggerAttack();
                    }
                }, 220);
            }
        } else {
            document.body.classList.remove('octopus-behind-footer');
            this.hasAttackedInRetreat = false;
        }
    }

    /**
     * Ataque Abisal con Crossfade cinemático suave y retorno garantizado a idle continuo
     */
    triggerAttack() {
        if (this.isAttacking || !this.mixer) return;
        const attackAction = this.animations.get('Armature|Atacar');
        const idleAction = this.animations.get('Armature|idle');
        if (!attackAction || !idleAction) return;

        this.isAttacking = true;

        // Pulso de luz neón durante el ataque
        const origIntensity = this.cursorLight ? this.cursorLight.intensity : 4.5;
        if (this.cursorLight) {
            this.cursorLight.intensity = 8.5;
            this.cursorLight.color.setHex(0xff0055);
        }

        // 1. Configurar y disparar acción de ataque con crossfade suave
        attackAction.reset();
        attackAction.enabled = true;
        attackAction.setLoop(THREE.LoopOnce, 1);
        attackAction.clampWhenFinished = true;
        attackAction.setEffectiveTimeScale(1);
        attackAction.setEffectiveWeight(1);

        idleAction.crossFadeTo(attackAction, 0.25, true);
        attackAction.play();

        const attackDuration = attackAction.getClip().duration || 1.8;
        // Comenzamos a desvanecer suavemente hacia idle antes de que termine el ataque
        const fadeBackDelay = Math.max(0.2, (attackDuration - 0.45)) * 1000;

        setTimeout(() => {
            // 2. Restaurar idleAction de forma fluida y continua
            idleAction.enabled = true;
            idleAction.setEffectiveTimeScale(1);
            idleAction.setEffectiveWeight(1);
            attackAction.crossFadeTo(idleAction, 0.5, true);
            idleAction.play();
            this.currentAction = idleAction;

            setTimeout(() => {
                attackAction.stop();
                if (this.cursorLight) {
                    this.cursorLight.intensity = origIntensity;
                    this.cursorLight.color.setHex(0x00f0ff);
                }
                this.isAttacking = false;
            }, 550);
        }, fadeBackDelay);
    }

    /**
     * Calcula los puntos clave de cámara y modelo según el progreso del scroll (Scrollytelling 3D)
     * - Scroll 0%: Macro colosal centrado en los tentáculos gigantes
     * - Scroll 35%: La cámara se aleja y encuadra al pulpo a la derecha mostrando cabeza y tentáculos hacia la terminal
     * - Scroll 65%: Zoom dramático hacia los ojos y tentáculos superiores a la izquierda
     * - Scroll 100%: Plano cenital superior majestuoso
     */
    _getScrollyState(p) {
        const s = (t) => t * t * (3 - 2 * t);

        const state = {
            camPos: new THREE.Vector3(),
            target: new THREE.Vector3(),
            modelPos: new THREE.Vector3(),
            modelRotY: 0
        };

        if (p < 0.28) {
            // Estación 0: Hero Centrado Monumental -> Revelación y acompañamiento hacia terminal
            const t = s(p / 0.28);
            state.camPos.lerpVectors(new THREE.Vector3(0, 0.1, 2.8), new THREE.Vector3(-0.35, 0.25, 3.6), t);
            state.target.lerpVectors(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.6, 0, 0), t);
            state.modelPos.lerpVectors(new THREE.Vector3(0, 0.1, 0.1), new THREE.Vector3(1.35, -0.1, 0), t);
            state.modelRotY = THREE.MathUtils.lerp(0, -0.42, t);
        } else if (p < 0.65) {
            // Estación 1 -> Estación 2: Lateral Derecha hacia Zoom Dramático Ojos a la Izquierda
            const t = s((p - 0.28) / 0.37);
            state.camPos.lerpVectors(new THREE.Vector3(-0.35, 0.25, 3.6), new THREE.Vector3(0.75, 0.55, 2.4), t);
            state.target.lerpVectors(new THREE.Vector3(0.6, 0, 0), new THREE.Vector3(-0.65, 0.25, 0), t);
            state.modelPos.lerpVectors(new THREE.Vector3(1.35, -0.1, 0), new THREE.Vector3(-1.35, 0.05, 0.2), t);
            state.modelRotY = THREE.MathUtils.lerp(-0.42, 0.52, t);
        } else {
            // Estación 2 -> Estación 3: Zoom Izquierda hacia Plano Cenital Panorámico
            const t = s((p - 0.65) / 0.35);
            state.camPos.lerpVectors(new THREE.Vector3(0.75, 0.55, 2.4), new THREE.Vector3(0, 2.2, 4.4), t);
            state.target.lerpVectors(new THREE.Vector3(-0.65, 0.25, 0), new THREE.Vector3(0, -0.3, 0), t);
            state.modelPos.lerpVectors(new THREE.Vector3(-1.35, 0.05, 0.2), new THREE.Vector3(0, -0.25, -0.3), t);
            state.modelRotY = THREE.MathUtils.lerp(0.52, 0.0, t);
        }

        return state;
    }

    _animate() {
        requestAnimationFrame(() => this._animate());

        if (!this.isVisible) return; // Ahorro de GPU si la pestaña está oculta

        const delta = this.clock.getDelta();
        const time = this.clock.getElapsedTime();

        // 1. Actualizar mixer de animación 3D continua de tentáculos
        if (this.mixer) {
            this.mixer.update(delta);
        }

        // 2. Interpolación suave de scroll (Resorte cinemático)
        this.smoothScroll += (this.scrollProgress - this.smoothScroll) * 0.055;
        const targetState = this._getScrollyState(this.smoothScroll);

        // 2.b Interpolación suave de retirada hacia atrás (Retreat behind card)
        const targetRetreatZ = this.isRetreatingBehind ? -2.2 : 0.0;
        const targetRetreatY = this.isRetreatingBehind ? -0.15 : 0.0;
        this.retreatZ += (targetRetreatZ - this.retreatZ) * 0.075;
        this.retreatY += (targetRetreatY - this.retreatY) * 0.075;

        // 3. Interpolación suave del cursor para luces
        this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.05;
        this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.05;

        if (this.cursorLight) {
            this.cursorLight.position.x = this.mouse.x * 3.5;
            this.cursorLight.position.y = -this.mouse.y * 2.5 + 0.5;
        }

        // 4. Animar partículas abisales (flotación de plancton orgánico)
        if (this.particles) {
            const positions = this.particles.geometry.attributes.position.array;
            for (let i = 0; i < 90; i++) {
                positions[i * 3 + 1] += Math.sin(time * 0.8 + i) * 0.002;
                positions[i * 3] += Math.cos(time * 0.5 + i) * 0.001;
            }
            this.particles.geometry.attributes.position.needsUpdate = true;
            this.particles.rotation.y = time * 0.015;
        }

        // 5. Aplicar Scrollytelling 3D al pulpo y a la cámara
        if (this.model) {
            // Suave balanceo orgánico sobre la posición calculada por el scroll
            const floatOffset = Math.sin(time * 1.5) * 0.035;
            const rollOffset = Math.sin(time * 0.8) * 0.018;

            const finalTargetY = targetState.modelPos.y + floatOffset + this.retreatY;
            const finalTargetZ = targetState.modelPos.z + this.retreatZ;

            if (!this.isAttacking) {
                this.model.position.x += (targetState.modelPos.x - this.model.position.x) * 0.06;
                this.model.position.y += (finalTargetY - this.model.position.y) * 0.06;
                this.model.position.z += (finalTargetZ - this.model.position.z) * 0.07;

                if (!this.isUserInteracting) {
                    this.model.rotation.y += (targetState.modelRotY - this.model.rotation.y) * 0.05;
                }
                this.model.rotation.z = rollOffset;
            } else {
                // Durante el ataque mantenemos la profundidad z e y en retirada para que no atraviese hacia adelante
                this.model.position.y += (finalTargetY - this.model.position.y) * 0.06;
                this.model.position.z += (finalTargetZ - this.model.position.z) * 0.07;
            }
        }

        // 6. Si el usuario no está arrastrando con el ratón, la cámara sigue el scrollytelling
        if (!this.isUserInteracting) {
            const lerpSpeed = 0.05;
            this.camera.position.lerp(targetState.camPos, lerpSpeed);
            this.controls.target.lerp(targetState.target, lerpSpeed);
        }

        if (this.controls) {
            this.controls.update();
        }

        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }
}
