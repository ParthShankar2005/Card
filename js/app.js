/**
 * WebAR Image Target Recognition & 3D Model Controller
 * Client: Shivam Jewels (ar.testsjit.in)
 * 
 * Features:
 * - Direct image target recognition via MindAR
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
        ctx.resume().catch(() => {});
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

    if (modalTitle) modalTitle.textContent = title || 'Camera Access Required';
    if (modalDesc) modalDesc.textContent = desc || 'Please allow camera access in your browser to experience Shivam Jewels WebAR.';

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
      if (btnText) btnText.textContent = isBlocked ? 'Retry Camera Access' : 'Enable Camera & Start AR';
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
    if (btnText) btnText.textContent = 'Starting Camera...';
    if (errorBox) errorBox.classList.remove('show');

    // Ensure secure origin
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      isARStarting = false;
      showCameraGuidance(
        'HTTPS Connection Required',
        'Camera access requires a secure HTTPS connection or supported modern browser.',
        'Please open this site using HTTPS (e.g. https://ar.testsjit.in).',
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

    let title = 'Camera Access Required';
    let desc = 'Shivam Jewels WebAR needs camera access to recognize the card tracking target.';
    let guide = `
      <ol class="camera-steps-guide">
        <li>Tap the lock/settings icon in your browser address bar.</li>
        <li>Ensure <strong>Camera</strong> is set to <strong>Allow</strong>.</li>
        <li>Tap <strong>Retry Camera Access</strong> below.</li>
      </ol>
    `;

    if (err && (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError')) {
      title = 'No Camera Detected';
      desc = 'No suitable camera hardware was detected on this device.';
      guide = 'Please open this link on a mobile smartphone with a working rear camera.';
    } else if (err && (err.name === 'NotReadableError' || err.name === 'TrackStartError')) {
      title = 'Camera In Use';
      desc = 'The camera is currently being used by another application or browser tab.';
      guide = 'Please close any background camera apps or tabs and tap Retry.';
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
  // 5. PERMISSION STATE QUERY & AUTOMATIC STARTUP
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
  // 6. MAIN APPLICATION INITIALIZATION
  // ==========================================================================
  function initApp() {
    const targetEntity = document.getElementById('ar-target');
    const statusPill = document.getElementById('status-pill');
    const statusText = document.getElementById('status-text');
    const reticle = document.getElementById('scanning-reticle');
    const arWrapper = document.getElementById('ar-content-wrapper');
    const arScene = document.getElementById('ar-scene');

    // Transparent WebGL canvas: Prevents white/black screen flicker
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
        if (statusText) statusText.textContent = '✨ Card Recognized';
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
        if (statusText) statusText.textContent = 'Scanning Target...';
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

    // Automatic Camera Launch
    checkPermissionsAndAutoStart();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
