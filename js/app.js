/**
 * WebAR Image Target Recognition & 3D Model Controller
 * Client: Shivam Jewels (ar.testsjit.in)
 * Version: 1.0.2
 * 
 * Features:
 * - Direct image target recognition via MindAR
 * - 13s Game-like staged diamond loading animation (10% -> 40% -> 55% -> 80% -> 95% -> 100%)
 * - Native browser camera permission flow with instant startup
 * - Zero double-click bug fix (direct stream binding to AR engine)
 * - Automatic camera launch for returning / granted users
 * - Shivam Jewels luxury branded guidance for denied / blocked states
 * - AudioContext auto-unlock on user gesture & feedback chimes
 * - 3D model GLTF animation playback & diamond/platinum material shaders
 */

(function () {
  'use strict';

  // ==========================================================================
  // 1. A-FRAME GLTF ANIMATION CONTROLLER COMPONENT
  // ==========================================================================
  if (typeof AFRAME !== 'undefined') {
    AFRAME.registerComponent('play-all-animations', {
      init: function () {
        this.mixer = null;
        this.actions = [];
        this.isPlaying = false;

        this.el.addEventListener('model-loaded', (e) => {
          const model = (e.detail && e.detail.model) || this.el.getObject3D('mesh');
          const animations = (e.detail && e.detail.model && e.detail.model.animations) ||
            (this.el.components['gltf-model'] && this.el.components['gltf-model'].model && this.el.components['gltf-model'].model.animations) ||
            (model && model.animations) || [];

          if (model && animations && animations.length > 0) {
            console.log(`[GLTF Animation] Ready with ${animations.length} embedded animation tracks.`);
            this.mixer = new THREE.AnimationMixer(model);
            this.actions = animations.map((clip) => {
              const action = this.mixer.clipAction(clip);
              action.setLoop(THREE.LoopRepeat, Infinity);
              action.clampWhenFinished = false;
              return action;
            });
          }
        });

        // Synchronize animation playback with target detection
        const targetEntity = document.getElementById('ar-target');
        if (targetEntity) {
          targetEntity.addEventListener('targetFound', () => {
            this.playAnimations();
          });
          targetEntity.addEventListener('targetLost', () => {
            this.pauseAnimations();
          });
        }
      },
      playAnimations: function () {
        if (!this.mixer || this.actions.length === 0) return;
        this.mixer.setTime(0);
        this.actions.forEach((action) => {
          action.reset();
          action.play();
        });
        this.isPlaying = true;
      },
      pauseAnimations: function () {
        if (!this.mixer) return;
        this.actions.forEach((action) => {
          action.stop();
        });
        this.isPlaying = false;
      },
      tick: function (t, dt) {
        if (this.mixer && this.isPlaying && dt) {
          this.mixer.update(dt / 1000);
        }
      }
    });
  }

  // ==========================================================================
  // 2. SYNTHESIZED WEB AUDIO API FEEDBACK CHIMES
  // ==========================================================================
  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function unlockAudioContext() {
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => { });
      }
    } catch (e) {
      console.warn("AudioContext resume error:", e);
    }
  }

  function playChime(type) {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.15);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'tap') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.06);
      }
    } catch (e) {
      console.warn("Audio chime error:", e);
    }
  }

  // ==========================================================================
  // 3. CAMERA PERMISSION & SHIVAM JEWELS GUIDANCE MODAL
  // ==========================================================================
  let isARStarting = false;
  let isARRunning = false;

  function showCameraGuidance(title, desc, errorDetails, isBlocked) {
    const modalOverlay = document.getElementById('permission-modal');
    const modalIcon = document.getElementById('modal-icon');
    const modalTitle = document.getElementById('modal-title');
    const modalDesc = document.getElementById('modal-desc');
    const errorBox = document.getElementById('camera-error');
    const btnStart = document.getElementById('btn-start-ar');
    const btnIcon = document.getElementById('btn-icon');
    const btnText = document.getElementById('btn-text');
    const reticle = document.getElementById('scanning-reticle');

    if (reticle) reticle.classList.add('hidden');

    if (modalOverlay) {
      modalOverlay.classList.remove('hidden');
      modalOverlay.style.display = 'flex';
    }

    if (modalIcon) {
      modalIcon.className = isBlocked ? 'modal-logo-wrapper error' : 'modal-logo-wrapper';
      modalIcon.innerHTML = isBlocked ? '<i class="fas fa-lock"></i>' : '<i class="fas fa-camera"></i>';
    }

    if (modalTitle) modalTitle.textContent = title || 'Camera Access Needed';
    if (modalDesc) modalDesc.textContent = desc || 'Camera permission is needed to scan the SJ card and view the AR experience.';

    if (errorBox) {
      if (errorDetails) {
        errorBox.innerHTML = `<strong><i class="fas fa-info-circle"></i> Instructions:</strong><br>${errorDetails}`;
        errorBox.classList.add('show');
      } else {
        errorBox.classList.remove('show');
      }
    }

    if (btnStart) {
      btnStart.disabled = false;
      if (btnIcon) btnIcon.className = isBlocked ? 'fas fa-redo' : 'fas fa-video';
      if (btnText) btnText.textContent = isBlocked ? 'Try Again' : 'Enable Camera';
    }
  }

  function hideCameraGuidance() {
    const modalOverlay = document.getElementById('permission-modal');
    const reticle = document.getElementById('scanning-reticle');

    if (modalOverlay) {
      modalOverlay.classList.add('hidden');
      modalOverlay.style.display = 'none';
    }
    if (reticle) {
      reticle.classList.remove('hidden');
      reticle.style.display = 'flex';
    }
  }

  // ==========================================================================
  // 4. SEAMLESS CAMERA & WEBAR INITIALIZATION (NO DOUBLE-CLICK)
  // ==========================================================================
  async function startARSession() {
    if (isARRunning || isARStarting) return;
    isARStarting = true;

    const btnStart = document.getElementById('btn-start-ar');
    const btnIcon = document.getElementById('btn-icon');
    const btnText = document.getElementById('btn-text');
    const errorBox = document.getElementById('camera-error');
    const arScene = document.getElementById('ar-scene');

    if (btnStart) btnStart.disabled = true;
    if (btnIcon) btnIcon.className = 'fas fa-spinner fa-spin';
    if (btnText) btnText.textContent = 'Opening Camera...';
    if (errorBox) errorBox.classList.remove('show');

    // Ensure secure origin
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      isARStarting = false;
      showCameraGuidance(
        'HTTPS Required',
        'Camera access requires a secure connection.',
        'Please open this website using HTTPS.',
        true
      );
      return;
    }

    const launchMindAR = () => {
      if (!arScene) return;
      const arSystem = arScene.systems && arScene.systems['mindar-image-system'];
      if (arSystem) {
        try {
          arSystem.start();
          hideCameraGuidance();
          isARRunning = true;
          isARStarting = false;
        } catch (err) {
          console.error("MindAR start error:", err);
          handleCameraError(err);
        }
      } else {
        arScene.addEventListener('renderstart', () => {
          const sys = arScene.systems && arScene.systems['mindar-image-system'];
          if (sys) {
            try {
              sys.start();
              hideCameraGuidance();
              isARRunning = true;
              isARStarting = false;
            } catch (err) {
              console.error("MindAR start error:", err);
              handleCameraError(err);
            }
          }
        }, { once: true });
      }
    };

    if (arScene.hasLoaded || arScene.renderStarted) {
      launchMindAR();
    } else {
      arScene.addEventListener('loaded', launchMindAR, { once: true });
    }
  }

  function handleCameraError(err) {
    isARStarting = false;
    isARRunning = false;
    console.error("WebAR camera error:", err);

    let title = 'Camera Access Needed';
    let desc = 'Camera permission is needed to scan the SJ card.';
    let guide = `
      <ol class="camera-steps-guide">
        <li>Tap the lock icon in your browser address bar.</li>
        <li>Set <strong>Camera</strong> to <strong>Allow</strong>.</li>
        <li>Tap <strong>Try Again</strong> below.</li>
      </ol>
    `;

    if (err && (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError')) {
      title = 'No Camera Found';
      desc = 'No working camera was detected on this device.';
      guide = 'Please open this page on a smartphone with a camera.';
    } else if (err && (err.name === 'NotReadableError' || err.name === 'TrackStartError')) {
      title = 'Camera Busy';
      desc = 'The camera is being used by another app or tab.';
      guide = 'Please close other camera apps and tap Try Again.';
    }

    showCameraGuidance(title, desc, guide, true);
  }

  // Button handler for user-initiated camera launch / retry
  window.handleStartARClick = async function (e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    unlockAudioContext();
    playChime('tap');
    startARSession();
  };

  // ==========================================================================
  // 5. LUXURY SHIVAM JEWELS DIAMOND LOADING SCREEN CONTROLLER (v1.0.2)
  // ==========================================================================
  function setupLoadingScreen(onComplete) {
    const loadingScreen = document.getElementById('loading-screen');
    const diamondFill = document.getElementById('diamond-fill');

    if (!loadingScreen) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    let isFinished = false;

    const updateUI = (progress) => {
      const pct = Math.min(100, Math.max(0, progress));
      if (diamondFill) {
        diamondFill.style.setProperty('--loading-progress', `${pct}%`);
      }
    };

    const startTime = performance.now();
    const duration = 13000; // ~13.0 seconds staged game-like loading duration

    // Keyframes for authentic game-like staged progression:
    // 10% stuck -> 40% stuck -> 55% stuck -> 80% stuck -> 95% stuck -> direct snap to 100% & open
    const checkpoints = [
      { t: 0.00, p: 0 },
      { t: 0.06, p: 10 },  // 0.8s: Reach 10%
      { t: 0.20, p: 10 },  // 2.6s: Stuck at 10%
      { t: 0.28, p: 40 },  // 3.6s: Reach 40%
      { t: 0.42, p: 40 },  // 5.5s: Stuck at 40%
      { t: 0.49, p: 55 },  // 6.4s: Reach 55%
      { t: 0.61, p: 55 },  // 7.9s: Stuck at 55%
      { t: 0.69, p: 80 },  // 9.0s: Reach 80%
      { t: 0.80, p: 80 },  // 10.4s: Stuck at 80%
      { t: 0.86, p: 95 },  // 11.2s: Reach 95%
      { t: 0.95, p: 95 },  // 12.3s: Stuck at 95%
      { t: 0.97, p: 100 }, // 12.6s: Direct jump to 100%
      { t: 1.00, p: 100 }  // 13.0s: Complete & Open
    ];

    function calculateProgress(ratio) {
      if (ratio <= 0) return 0;
      if (ratio >= 1) return 100;
      for (let i = 0; i < checkpoints.length - 1; i++) {
        const c1 = checkpoints[i];
        const c2 = checkpoints[i + 1];
        if (ratio >= c1.t && ratio <= c2.t) {
          if (c1.p === c2.p) return c1.p;
          const localRatio = (ratio - c1.t) / (c2.t - c1.t);
          // Smooth cubic ease between checkpoints
          const ease = localRatio < 0.5
            ? 2 * localRatio * localRatio
            : 1 - Math.pow(-2 * localRatio + 2, 2) / 2;
          return c1.p + (c2.p - c1.p) * ease;
        }
      }
      return 100;
    }

    function animateProgress(now) {
      const elapsed = now - startTime;
      const timeRatio = Math.min(1, elapsed / duration);

      const targetProgress = calculateProgress(timeRatio);
      updateUI(targetProgress);

      if (timeRatio >= 1 && !isFinished) {
        isFinished = true;
        updateUI(100);

        // Smoothly fade out the loading screen and transition directly into AR
        setTimeout(() => {
          loadingScreen.classList.add('fade-out');

          // Trigger camera start simultaneously
          if (typeof onComplete === 'function') {
            onComplete();
          }

          // Clean up DOM after fade transition completes
          setTimeout(() => {
            loadingScreen.style.display = 'none';
          }, 550);
        }, 200);
        return;
      }

      requestAnimationFrame(animateProgress);
    }

    requestAnimationFrame(animateProgress);
  }

  // ==========================================================================
  // 6. PERMISSION STATE QUERY & AUTOMATIC STARTUP
  // ==========================================================================
  async function checkPermissionsAndAutoStart() {
    unlockAudioContext();

    // Catch MindAR arError events cleanly
    const arScene = document.getElementById('ar-scene');
    if (arScene) {
      arScene.addEventListener('arError', (event) => {
        console.warn("MindAR reported arError:", event.detail);
        handleCameraError({ name: 'NotAllowedError', message: 'Camera permission denied or stream failed' });
      });

      // When MindAR stream is ready and tracking begins
      arScene.addEventListener('arReady', () => {
        console.log("Shivam Jewels WebAR stream ready.");
        hideCameraGuidance();
        isARRunning = true;
        isARStarting = false;
      });
    }

    if (navigator.permissions && navigator.permissions.query) {
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'camera' });
        console.log("[Permissions API] Camera state:", permissionStatus.state);

        if (permissionStatus.state === 'granted') {
          // Camera already permitted -> Start automatically with zero clicks/modals
          startARSession();
        } else if (permissionStatus.state === 'prompt') {
          // First visit / Prompt -> Launch directly so the browser shows native prompt
          startARSession();
        } else if (permissionStatus.state === 'denied') {
          // Blocked -> Show guidance
          handleCameraError({ name: 'NotAllowedError' });
        }

        // Listen for permission changes (e.g. user toggles in site settings)
        permissionStatus.onchange = () => {
          console.log("[Permissions API] Camera permission changed to:", permissionStatus.state);
          if (permissionStatus.state === 'granted' && !isARRunning) {
            startARSession();
          }
        };
        return;
      } catch (e) {
        console.log("[Permissions API] Query unsupported, falling back to direct launch:", e);
      }
    }

    // Fallback for iOS Safari / browsers without navigator.permissions.query({ name: 'camera' })
    // Directly attempt camera start to trigger browser's native permission prompt
    startARSession();
  }

  // ==========================================================================
  // 7. MAIN APPLICATION INITIALIZATION
  // ==========================================================================
  function initApp() {
    const targetEntity = document.getElementById('ar-target');
    const statusPill = document.getElementById('status-pill');
    const statusText = document.getElementById('status-text');
    const reticle = document.getElementById('scanning-reticle');
    const arWrapper = document.getElementById('ar-content-wrapper');
    const arScene = document.getElementById('ar-scene');

    // Transparent WebGL canvas: Prevents white/black/blue screen flicker
    if (arScene) {
      const makeCanvasTransparent = () => {
        if (arScene.renderer) {
          arScene.renderer.setClearColor(0x000000, 0);
          arScene.renderer.alpha = true;
        }
      };

      if (arScene.renderStarted) {
        makeCanvasTransparent();
      } else {
        arScene.addEventListener('renderstart', makeCanvasTransparent, { once: true });
      }
    }

    // Remove any A-Frame default VR / AR UI buttons
    const removeVRUI = () => {
      const vrElements = document.querySelectorAll(
        '.a-enter-vr, .a-enter-vr-button, .a-enter-ar, .a-enter-ar-button, .a-orientation-modal, [data-a-enter-vr-button]'
      );
      vrElements.forEach((el) => {
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });
    };
    removeVRUI();

    // iOS Safari video attributes & UI cleanup observer
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            if (node.tagName === 'VIDEO') {
              node.setAttribute('playsinline', 'true');
              node.setAttribute('webkit-playsinline', 'true');
              node.setAttribute('muted', 'true');
              node.setAttribute('autoplay', 'true');
              node.playsInline = true;
              node.muted = true;
            }
            if (
              node.classList &&
              (node.classList.contains('a-enter-vr') ||
                node.classList.contains('a-enter-vr-button') ||
                node.classList.contains('a-enter-ar') ||
                node.classList.contains('a-orientation-modal'))
            ) {
              node.remove();
            }
          }
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Target Recognition Events
    if (targetEntity) {
      targetEntity.addEventListener('targetFound', () => {
        if (statusPill) statusPill.className = 'status-pill tracking';
        if (statusText) statusText.textContent = 'SJ Card Detected';
        if (reticle) reticle.classList.add('hidden');
        playChime('success');

        if (arWrapper) {
          arWrapper.setAttribute('visible', 'true');
          if (arWrapper.object3D) arWrapper.object3D.visible = true;
          arWrapper.emit('targetFound');
        }
      });

      targetEntity.addEventListener('targetLost', () => {
        if (statusPill) statusPill.className = 'status-pill searching';
        if (statusText) statusText.textContent = 'Scan SJ Card';
        if (reticle) reticle.classList.remove('hidden');

        if (arWrapper) {
          arWrapper.setAttribute('visible', 'false');
          if (arWrapper.object3D) arWrapper.object3D.visible = false;
          arWrapper.setAttribute('scale', '0 0 0');
        }
      });

      // Material Enhancer for 3D Diamond & Platinum Models
      const enhanceModelMaterials = (entity) => {
        if (!entity) return;
        const applyEnhancement = () => {
          const meshObj = entity.getObject3D('mesh');
          if (meshObj && window.THREE) {
            meshObj.traverse((child) => {
              if (child.isMesh && child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach((mat) => {
                  if (mat.name && mat.name.includes("Diamond")) {
                    mat.color = new THREE.Color(0xffffff);
                    mat.emissive = new THREE.Color(0x182c48);
                    mat.roughness = 0.05;
                    mat.metalness = 0.2;
                  } else if (mat.name && mat.name.includes("Platinum")) {
                    mat.color = new THREE.Color(0xdce2ea);
                    mat.roughness = 0.15;
                    mat.metalness = 0.9;
                  }
                  mat.side = THREE.DoubleSide;
                  mat.needsUpdate = true;
                });
              }
            });
          }
        };

        if (entity.getObject3D('mesh')) {
          applyEnhancement();
        }
        entity.addEventListener('model-loaded', applyEnhancement);
      };

      enhanceModelMaterials(document.getElementById('ring-model-entity'));
      enhanceModelMaterials(document.getElementById('shivam-model-entity'));
    }

    // Attach click handler on start button
    const btnStartAr = document.getElementById('btn-start-ar');
    if (btnStartAr) {
      btnStartAr.onclick = window.handleStartARClick;
    }

    // Launch loading screen first, then start camera session smoothly upon completion
    setupLoadingScreen(() => {
      checkPermissionsAndAutoStart();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();

