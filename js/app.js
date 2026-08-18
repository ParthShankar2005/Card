/**
 * Shivam Jewels — Interactive WebAR & 3D Experience
 * Client: Shivam Jewels (ar.testsjit.in)
 * Version: 2.1.0
 * 
 * Features:
 * - Dual Mode Architecture: AR Mode (Continuous Tracking) & 3D Mode (One-Time Scan Unlock)
 * - 13s Staged Game-like Diamond Loading Animation
 * - Luxury Glassmorphic Mode Selection System & Mode Switcher
 * - Touch & Drag Orbit Rotation Component for 3D Mode
 * - Persistent 3D World Anchor with Camera 0° Alignment
 * - PBR Diamond & Platinum Material Shaders for GLTF Models
 */

(function () {
  'use strict';

  // ==========================================================================
  // 1. APPLICATION CONSTANTS & STATE MANAGEMENT
  // ==========================================================================
  const MODES = {
    LOADING: 'LOADING',
    SELECT: 'SELECT',
    AR: 'AR',
    THREED: 'THREED'
  };

  let currentMode = MODES.LOADING;
  let has3DUnlocked = false;
  let isARStarting = false;
  let isARRunning = false;

  // ==========================================================================
  // 2. A-FRAME CUSTOM COMPONENTS
  // ==========================================================================
  if (typeof AFRAME !== 'undefined') {
    // GLTF Animation Controller (Plays all animations on models)
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
            this.mixer = new THREE.AnimationMixer(model);
            this.actions = animations.map((clip) => {
              const action = this.mixer.clipAction(clip);
              action.setLoop(THREE.LoopRepeat, Infinity);
              action.clampWhenFinished = false;
              return action;
            });

            // Automatically play if 3D mode is unlocked or when ready
            if (currentMode === MODES.THREED && has3DUnlocked) {
              this.playAnimations();
            }
          }
        });

        // Synchronize AR animation playback with image target detection
        const targetEntity = document.getElementById('ar-target');
        if (targetEntity) {
          targetEntity.addEventListener('targetFound', () => {
            if (currentMode === MODES.AR) this.playAnimations();
          });
          targetEntity.addEventListener('targetLost', () => {
            if (currentMode === MODES.AR) this.pauseAnimations();
          });
        }
      },
      playAnimations: function () {
        if (!this.mixer || this.actions.length === 0) return;
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

    // Touch / Pointer Drag Rotation Controller for 3D Mode
    AFRAME.registerComponent('touch-rotate', {
      init: function () {
        this.isDragging = false;
        this.previousX = 0;
        this.previousY = 0;
        this.rotationSpeed = 0.45;
        this.autoRotateSpeed = 0.2;
        this.lastInteractTime = performance.now();

        const onPointerDown = (e) => {
          if (currentMode !== MODES.THREED || !has3DUnlocked) return;
          // Ignore clicks on UI header or modal buttons
          if (e.target.closest('#app-header') || e.target.closest('.modal-overlay')) return;

          this.isDragging = true;
          const clientX = e.touches ? e.touches[0].clientX : e.clientX;
          const clientY = e.touches ? e.touches[0].clientY : e.clientY;
          this.previousX = clientX;
          this.previousY = clientY;
          this.lastInteractTime = performance.now();
        };

        const onPointerMove = (e) => {
          if (!this.isDragging || currentMode !== MODES.THREED) return;
          const clientX = e.touches ? e.touches[0].clientX : e.clientX;
          const clientY = e.touches ? e.touches[0].clientY : e.clientY;
          const deltaX = clientX - this.previousX;
          const deltaY = clientY - this.previousY;

          this.previousX = clientX;
          this.previousY = clientY;
          this.lastInteractTime = performance.now();

          const currentRot = this.el.getAttribute('rotation') || { x: 0, y: 0, z: 0 };
          const newY = currentRot.y + deltaX * this.rotationSpeed;
          const newX = Math.max(-25, Math.min(25, currentRot.x + deltaY * (this.rotationSpeed * 0.4)));

          this.el.setAttribute('rotation', `${newX} ${newY} ${currentRot.z}`);
        };

        const onPointerUp = () => {
          this.isDragging = false;
        };

        window.addEventListener('mousedown', onPointerDown, { passive: true });
        window.addEventListener('mousemove', onPointerMove, { passive: true });
        window.addEventListener('mouseup', onPointerUp, { passive: true });

        window.addEventListener('touchstart', onPointerDown, { passive: true });
        window.addEventListener('touchmove', onPointerMove, { passive: true });
        window.addEventListener('touchend', onPointerUp, { passive: true });
      },
      tick: function (t, dt) {
        // Gentle slow ambient auto-rotation when user is idle in 3D Mode
        if (currentMode === MODES.THREED && has3DUnlocked && !this.isDragging && dt) {
          if (performance.now() - this.lastInteractTime > 2500) {
            const rot = this.el.getAttribute('rotation') || { x: 0, y: 0, z: 0 };
            const deltaRot = (this.autoRotateSpeed * dt) / 1000 * 15;
            this.el.setAttribute('rotation', `${rot.x} ${rot.y + deltaRot} ${rot.z}`);
          }
        }
      }
    });
  }

  // ==========================================================================
  // 3. CAMERA PERMISSION & LIFECYCLE CONTROLLER
  // ==========================================================================
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
    if (modalDesc) modalDesc.textContent = desc || 'Camera permission is needed to scan the SJ card and launch the experience.';

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
    if (modalOverlay) {
      modalOverlay.classList.add('hidden');
      modalOverlay.style.display = 'none';
    }
    updateReticleVisibility();
  }

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

  window.handleStartARClick = async function (e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    startARSession();
  };

  // ==========================================================================
  // 4. RETICLE & HUD UPDATER
  // ==========================================================================
  function updateReticleVisibility() {
    const reticle = document.getElementById('scanning-reticle');
    const labelText = document.getElementById('scanning-label-text');
    if (!reticle) return;

    if (currentMode === MODES.AR) {
      if (labelText) labelText.textContent = 'Point camera at SJ AR Card';
      reticle.classList.remove('hidden');
      reticle.style.display = 'flex';
    } else if (currentMode === MODES.THREED) {
      if (!has3DUnlocked) {
        if (labelText) labelText.textContent = 'Point camera at SJ 3D Card to unlock';
        reticle.classList.remove('hidden');
        reticle.style.display = 'flex';
      } else {
        reticle.classList.add('hidden');
        reticle.style.display = 'none';
      }
    } else {
      reticle.classList.add('hidden');
      reticle.style.display = 'none';
    }
  }

  // ==========================================================================
  // 5. MODE SWITCHER & SELECTION CONTROLLER
  // ==========================================================================
  window.handleOpenModeSelect = function () {
    const modeModal = document.getElementById('mode-selection-modal');
    if (modeModal) {
      modeModal.classList.remove('hidden');
      modeModal.style.display = 'flex';
    }
  };

  window.handleSelectMode = function (selectedMode) {
    const modeModal = document.getElementById('mode-selection-modal');
    if (modeModal) {
      modeModal.classList.add('hidden');
      modeModal.style.display = 'none';
    }

    const arWrapper = document.getElementById('ar-content-wrapper');
    const threedWrapper = document.getElementById('threed-content-wrapper');
    const statusPill = document.getElementById('status-pill');
    const statusText = document.getElementById('status-text');
    const modeLabel = document.getElementById('current-mode-label');
    const gestureHint = document.getElementById('gesture-hint');

    if (selectedMode === 'AR') {
      currentMode = MODES.AR;
      if (modeLabel) modeLabel.textContent = 'AR Mode';

      // Hide 3D content, reset status
      if (threedWrapper) {
        threedWrapper.setAttribute('visible', 'false');
        if (threedWrapper.object3D) threedWrapper.object3D.visible = false;
        threedWrapper.setAttribute('scale', '0 0 0');
      }
      if (gestureHint) gestureHint.classList.add('hidden');

      if (statusPill) statusPill.className = 'status-pill searching';
      if (statusText) statusText.textContent = 'Scan SJ AR Card';

      updateReticleVisibility();
      startARSession();

    } else if (selectedMode === 'THREED') {
      currentMode = MODES.THREED;
      if (modeLabel) modeLabel.textContent = '3D Mode';

      // Hide AR content
      if (arWrapper) {
        arWrapper.setAttribute('visible', 'false');
        if (arWrapper.object3D) arWrapper.object3D.visible = false;
        arWrapper.setAttribute('scale', '0 0 0');
      }

      if (has3DUnlocked) {
        // Already unlocked: directly show 3D world
        if (threedWrapper) {
          threedWrapper.setAttribute('visible', 'true');
          if (threedWrapper.object3D) threedWrapper.object3D.visible = true;
          threedWrapper.setAttribute('scale', '1 1 1');
        }
        if (statusPill) statusPill.className = 'status-pill threed-active';
        if (statusText) statusText.textContent = 'SJ 3D Card Detected';
        if (gestureHint) {
          gestureHint.classList.remove('hidden');
          setTimeout(() => gestureHint.classList.add('hidden'), 4500);
        }
        updateReticleVisibility();
      } else {
        // Needs initial 1-time scan
        if (statusPill) statusPill.className = 'status-pill searching';
        if (statusText) statusText.textContent = 'Scan SJ 3D Card';
        updateReticleVisibility();
      }

      startARSession();
    }
  };

  // ==========================================================================
  // 6. DIAMOND LOADING SCREEN CONTROLLER
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

    const checkpoints = [
      { t: 0.00, p: 0 },
      { t: 0.06, p: 10 },
      { t: 0.20, p: 10 },
      { t: 0.28, p: 40 },
      { t: 0.42, p: 40 },
      { t: 0.49, p: 55 },
      { t: 0.61, p: 55 },
      { t: 0.69, p: 80 },
      { t: 0.80, p: 80 },
      { t: 0.86, p: 95 },
      { t: 0.95, p: 95 },
      { t: 0.97, p: 100 },
      { t: 1.00, p: 100 }
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

        setTimeout(() => {
          loadingScreen.classList.add('fade-out');

          if (typeof onComplete === 'function') {
            onComplete();
          }

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
  // 7. MAIN APPLICATION INITIALIZATION
  // ==========================================================================
  function initApp() {
    const targetEntity = document.getElementById('ar-target');
    const statusPill = document.getElementById('status-pill');
    const statusText = document.getElementById('status-text');
    const reticle = document.getElementById('scanning-reticle');
    const arWrapper = document.getElementById('ar-content-wrapper');
    const threedWrapper = document.getElementById('threed-content-wrapper');
    const gestureHint = document.getElementById('gesture-hint');
    const arScene = document.getElementById('ar-scene');

    // Transparent WebGL canvas setup
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

    // ========================================================================
    // Target Recognition Events (Handles AR Continuous Tracking vs 3D Unlock)
    // ========================================================================
    if (targetEntity) {
      targetEntity.addEventListener('targetFound', () => {
        if (currentMode === MODES.AR) {
          // --- AR MODE (Continuous Live Tracking) ---
          if (statusPill) statusPill.className = 'status-pill tracking';
          if (statusText) statusText.textContent = 'SJ AR Card Detected';
          if (reticle) reticle.classList.add('hidden');

          if (arWrapper) {
            arWrapper.setAttribute('visible', 'true');
            if (arWrapper.object3D) arWrapper.object3D.visible = true;
            arWrapper.emit('targetFound');
          }
        } else if (currentMode === MODES.THREED) {
          // --- 3D MODE (One-Time Scan Unlock) ---
          has3DUnlocked = true;

          if (statusPill) statusPill.className = 'status-pill threed-active';
          if (statusText) statusText.textContent = 'SJ 3D Card Detected';
          if (reticle) reticle.classList.add('hidden');

          if (threedWrapper) {
            threedWrapper.setAttribute('visible', 'true');
            if (threedWrapper.object3D) threedWrapper.object3D.visible = true;
            threedWrapper.setAttribute('scale', '1 1 1');

            // Trigger animations on models
            const models = threedWrapper.querySelectorAll('[play-all-animations]');
            models.forEach((m) => {
              const comp = m.components['play-all-animations'];
              if (comp) comp.playAnimations();
            });
          }

          if (gestureHint) {
            gestureHint.classList.remove('hidden');
            setTimeout(() => {
              if (gestureHint) gestureHint.classList.add('hidden');
            }, 4500);
          }
        }
      });

      targetEntity.addEventListener('targetLost', () => {
        if (currentMode === MODES.AR) {
          // --- AR MODE: Hide models when card is lost ---
          if (statusPill) statusPill.className = 'status-pill searching';
          if (statusText) statusText.textContent = 'Scan SJ AR Card';
          if (reticle) reticle.classList.remove('hidden');

          if (arWrapper) {
            arWrapper.setAttribute('visible', 'false');
            if (arWrapper.object3D) arWrapper.object3D.visible = false;
            arWrapper.setAttribute('scale', '0 0 0');
          }
        } else if (currentMode === MODES.THREED) {
          // --- 3D MODE: Keep 3D World Persistently Visible! ---
          if (has3DUnlocked) {
            if (statusPill) statusPill.className = 'status-pill threed-active';
            if (statusText) statusText.textContent = 'SJ 3D Card Detected';
            if (reticle) reticle.classList.add('hidden');
            // Do NOT hide threedWrapper! It stays permanently active.
          } else {
            if (statusPill) statusPill.className = 'status-pill searching';
            if (statusText) statusText.textContent = 'Scan SJ 3D Card';
            if (reticle) reticle.classList.remove('hidden');
          }
        }
      });

      // Material Enhancer for PBR Diamond & Platinum Shaders
      const enhanceModelMaterials = (entityId) => {
        const entity = document.getElementById(entityId);
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

      // Enhance both AR and 3D mode models
      enhanceModelMaterials('ring-model-entity');
      enhanceModelMaterials('shivam-model-entity');
      enhanceModelMaterials('ring-model-entity-3d');
      enhanceModelMaterials('shivam-model-entity-3d');
    }

    // Attach click handler on start AR button in permission modal
    const btnStartAr = document.getElementById('btn-start-ar');
    if (btnStartAr) {
      btnStartAr.onclick = window.handleStartARClick;
    }

    // Launch loading screen first, then open Mode Selection screen upon completion
    setupLoadingScreen(() => {
      currentMode = MODES.SELECT;
      window.handleOpenModeSelect();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();


