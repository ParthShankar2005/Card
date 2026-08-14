/**
 * Shivam Jewels — Interactive WebAR & 3D Experience
 * Client: Shivam Jewels (ar.testsjit.in)
 * Version: 2.0.0
 * 
 * Features:
 * - Dual Mode: Interactive AR Mode (live card tracking) & 3D View (360° virtual showroom)
 * - Post-loading Experience Selection Modal with side-by-side buttons
 * - Smooth 360° touch/mouse orbit controls for 3D View
 * - 13s Game-like staged diamond loading animation (10% -> 40% -> 55% -> 80% -> 95% -> 100%)
 * - Enhanced PBR diamond & platinum material shaders on GLTF models
 */

(function () {
  'use strict';

  // ==========================================================================
  // 1. APPLICATION CONSTANTS & STATE MANAGEMENT
  // ==========================================================================
  const MODES = {
    LOADING: 'LOADING',
    SELECTION: 'SELECTION',
    AR: 'AR',
    VIEW_3D: 'VIEW_3D'
  };

  let currentMode = MODES.LOADING;
  let is3DWorldAnchored = false;

  // ==========================================================================
  // 2. A-FRAME GLTF ANIMATION CONTROLLER COMPONENT
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
            this.mixer = new THREE.AnimationMixer(model);
            this.actions = animations.map((clip) => {
              const action = this.mixer.clipAction(clip);
              action.setLoop(THREE.LoopRepeat, Infinity);
              action.clampWhenFinished = false;
              return action;
            });
            this.playAnimations();
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
  }

  // ==========================================================================
  // 3. CAMERA PERMISSION & GUIDANCE MODAL (AR MODE)
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
    if (reticle && currentMode === MODES.AR) {
      reticle.classList.remove('hidden');
      reticle.style.display = 'flex';
    }
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

  function stopARSession() {
    const arScene = document.getElementById('ar-scene');
    if (arScene && arScene.systems && arScene.systems['mindar-image-system']) {
      try {
        const arSystem = arScene.systems['mindar-image-system'];
        if (arSystem && isARRunning) {
          arSystem.stop();
        }
      } catch (e) {
        console.warn("Error stopping MindAR session:", e);
      }
    }
    isARRunning = false;
    isARStarting = false;

    // Hide any AR video feeds
    const videos = document.querySelectorAll('video');
    videos.forEach((v) => {
      if (v && v.srcObject) {
        try {
          const tracks = v.srcObject.getTracks();
          tracks.forEach(track => track.stop());
        } catch (e) { }
      }
      v.style.display = 'none';
    });
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
  // 4. EXPERIENCE SELECTION MODAL & MODE SWITCHING
  // ==========================================================================
  window.openExperienceModal = function () {
    const expModal = document.getElementById('experience-modal');
    const permModal = document.getElementById('permission-modal');
    const reticle = document.getElementById('scanning-reticle');

    if (permModal) {
      permModal.classList.add('hidden');
      permModal.style.display = 'none';
    }
    if (reticle) reticle.classList.add('hidden');

    if (expModal) {
      expModal.classList.remove('hidden');
      expModal.style.display = 'flex';
    }
  };

  window.closeExperienceModal = function () {
    const expModal = document.getElementById('experience-modal');
    if (expModal) {
      expModal.classList.add('hidden');
      expModal.style.display = 'none';
    }
  };

  window.selectExperienceMode = function (mode) {
    window.closeExperienceModal();
    const statusPill = document.getElementById('status-pill');
    const statusText = document.getElementById('status-text');
    const reticle = document.getElementById('scanning-reticle');
    const labelText = document.getElementById('scanning-label-text');
    const worldScene = document.getElementById('world-3d-scene');
    const arWrapper = document.getElementById('ar-content-wrapper');

    if (mode === 'AR') {
      currentMode = MODES.AR;

      // Deactivate 3D world scene
      if (worldScene) worldScene.setAttribute('visible', 'false');

      // Reset AR status and show reticle
      if (statusPill) statusPill.className = 'status-pill searching';
      if (statusText) statusText.textContent = 'AR SJ Card';
      if (labelText) labelText.textContent = 'Point camera at Shivam Jewels card';
      if (reticle) {
        reticle.classList.remove('hidden');
        reticle.style.display = 'flex';
      }

      startARSession();
    } else if (mode === '3D') {
      currentMode = MODES.VIEW_3D;
      is3DWorldAnchored = false;

      // Deactivate 3D world scene until card is scanned
      if (worldScene) worldScene.setAttribute('visible', 'false');
      if (arWrapper) {
        arWrapper.setAttribute('visible', 'false');
        arWrapper.setAttribute('scale', '0 0 0');
      }

      // Show reticle to scan card for distance-based 3D World creation
      if (statusPill) statusPill.className = 'status-pill searching';
      if (statusText) statusText.textContent = '3D SJ Card';
      if (labelText) labelText.textContent = 'Point camera at Shivam Jewels card';
      if (reticle) {
        reticle.classList.remove('hidden');
        reticle.style.display = 'flex';
      }

      startARSession();
    }
  };

  // ==========================================================================
  // 5. 360° SMOOTH ORBIT TOUCH/MOUSE CONTROLS (3D VIEW MODE)
  // ==========================================================================
  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };
  let rotationY = 0;
  let rotationX = 0;
  let zoomZ = -2.0;
  let initialPinchDistance = null;

  function resetWorldOrbit(customDistance) {
    rotationY = 0;
    rotationX = 0;
    zoomZ = (typeof customDistance === 'number' && !isNaN(customDistance)) ? customDistance : -2.0;
    updateWorldTransform();
  }

  function updateWorldTransform() {
    const wrapper = document.getElementById('world-content-wrapper');
    if (wrapper) {
      wrapper.setAttribute('rotation', `${rotationX} ${rotationY} 0`);
      wrapper.setAttribute('position', `0 0 ${zoomZ}`);
    }
  }

  function setupOrbitControls() {
    const scene = document.querySelector('a-scene');
    if (!scene) return;

    // Touch events for mobile
    window.addEventListener('touchstart', (e) => {
      if (currentMode !== MODES.VIEW_3D) return;
      if (e.touches.length === 1) {
        isDragging = true;
        previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        isDragging = false;
        initialPinchDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (currentMode !== MODES.VIEW_3D) return;
      if (isDragging && e.touches.length === 1) {
        const deltaX = e.touches[0].clientX - previousMousePosition.x;
        const deltaY = e.touches[0].clientY - previousMousePosition.y;

        rotationY += deltaX * 0.45;
        rotationX = Math.max(-30, Math.min(30, rotationX + deltaY * 0.25));

        previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        updateWorldTransform();
      } else if (e.touches.length === 2 && initialPinchDistance) {
        const currentDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const diff = (currentDistance - initialPinchDistance) * 0.005;
        zoomZ = Math.max(-3.5, Math.min(-1.2, zoomZ + diff));
        initialPinchDistance = currentDistance;
        updateWorldTransform();
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      isDragging = false;
      initialPinchDistance = null;
    }, { passive: true });

    // Mouse events for desktop
    window.addEventListener('mousedown', (e) => {
      if (currentMode !== MODES.VIEW_3D) return;
      // Don't drag if clicking buttons
      if (e.target.closest('button, .modal-card, header')) return;
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mousemove', (e) => {
      if (currentMode !== MODES.VIEW_3D || !isDragging) return;
      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      rotationY += deltaX * 0.45;
      rotationX = Math.max(-30, Math.min(30, rotationX + deltaY * 0.25));

      previousMousePosition = { x: e.clientX, y: e.clientY };
      updateWorldTransform();
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    window.addEventListener('wheel', (e) => {
      if (currentMode !== MODES.VIEW_3D) return;
      const delta = e.deltaY * -0.002;
      zoomZ = Math.max(-3.5, Math.min(-1.2, zoomZ + delta));
      updateWorldTransform();
    }, { passive: true });
  }

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

    // Setup 360 orbit listeners
    setupOrbitControls();

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
        if (currentMode === MODES.AR) {
          // Standard AR Mode: continuous card tracking
          if (statusPill) statusPill.className = 'status-pill tracking';
          if (statusText) statusText.textContent = 'AR SJ Card';
          if (reticle) reticle.classList.add('hidden');

          if (arWrapper) {
            arWrapper.setAttribute('visible', 'true');
            if (arWrapper.object3D) arWrapper.object3D.visible = true;
            arWrapper.emit('targetFound');
          }
        } else if (currentMode === MODES.VIEW_3D) {
          if (!is3DWorldAnchored) {
            is3DWorldAnchored = true;
            // 3D View Mode: calculate card distance from user at (0,0,0) and create anchored 3D world
            const worldScene = document.getElementById('world-3d-scene');
            const worldPos = new THREE.Vector3();
            if (targetEntity.object3D) {
              targetEntity.object3D.getWorldPosition(worldPos);
            }

            let calculatedDistance = worldPos.length();
            if (!calculatedDistance || isNaN(calculatedDistance) || calculatedDistance < 0.6) {
              calculatedDistance = 2.0;
            } else {
              // Keep within comfortable viewing range
              calculatedDistance = Math.min(3.5, Math.max(1.2, calculatedDistance));
            }

            // Anchor 3D world at the calculated distance
            resetWorldOrbit(-calculatedDistance);

            // Hide reticle & AR wrapper, show 3D world (live camera stream stays ON in background)
            if (reticle) reticle.classList.add('hidden');
            if (arWrapper) {
              arWrapper.setAttribute('visible', 'false');
              arWrapper.setAttribute('scale', '0 0 0');
            }
            if (worldScene) {
              worldScene.setAttribute('visible', 'true');
            }

            if (statusPill) statusPill.className = 'status-pill tracking';
            if (statusText) statusText.textContent = '3D SJ Card';

            // Trigger model animations in 3D world
            const ring3D = document.getElementById('world-ring-entity');
            const shivam3D = document.getElementById('world-shivam-entity');
            if (ring3D && ring3D.components['play-all-animations']) ring3D.components['play-all-animations'].playAnimations();
            if (shivam3D && shivam3D.components['play-all-animations']) shivam3D.components['play-all-animations'].playAnimations();
          }
        }
      });

      targetEntity.addEventListener('targetLost', () => {
        if (currentMode === MODES.AR) {
          if (statusPill) statusPill.className = 'status-pill searching';
          if (statusText) statusText.textContent = 'AR SJ CARD';
          if (reticle) reticle.classList.remove('hidden');

          if (arWrapper) {
            arWrapper.setAttribute('visible', 'false');
            if (arWrapper.object3D) arWrapper.object3D.visible = false;
            arWrapper.setAttribute('scale', '0 0 0');
          }
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

      // Enhance materials for both AR and 3D scenes
      enhanceModelMaterials(document.getElementById('ring-model-entity'));
      enhanceModelMaterials(document.getElementById('shivam-model-entity'));
      enhanceModelMaterials(document.getElementById('world-ring-entity'));
      enhanceModelMaterials(document.getElementById('world-shivam-entity'));
    }

    // Attach click handler on start AR button
    const btnStartAr = document.getElementById('btn-start-ar');
    if (btnStartAr) {
      btnStartAr.onclick = window.handleStartARClick;
    }

    // Launch loading screen first, then open experience selection modal upon completion
    setupLoadingScreen(() => {
      currentMode = MODES.SELECTION;
      window.openExperienceModal();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();

