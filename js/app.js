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

  // Port 5000 is the Card Detection Bypass Mode (No physical card needed)
  // Port 3000 and Production are 100% Normal Camera & Card Scanning Mode
  const isBypassMode = window.location.port === '5000' ||
    new URLSearchParams(window.location.search).has('dev') ||
    new URLSearchParams(window.location.search).has('bypass');

  let currentMode = MODES.LOADING;
  let has3DUnlocked = false;
  let isARStarting = false;
  let isARRunning = false;
  let devSimulateTimeout = null;
  let isSimulatedTargetFound = false;

  // ==========================================================================
  // 3D ENVIRONMENT & CARD LIFECYCLE STATE MACHINE
  // ==========================================================================
  const THREED_STATE = {
    SEARCHING_INITIAL: 'SEARCHING_INITIAL',         // Initial: Waiting for 3-second continuous card scan
    ACTIVE_BUILDING: 'ACTIVE_BUILDING',             // 3D Space active, 20s background process running
    WAITING_FOR_CARD_1MIN: 'WAITING_FOR_CARD_1MIN', // 20s complete, 1-minute waiting for card return
    REQUIRE_RESCAN: 'REQUIRE_RESCAN'               // 1-minute expired, status "Scan card again"
  };

  let threedState = THREED_STATE.SEARCHING_INITIAL;
  let isCardInView = false;
  let cardConfirmTimer = null;
  let cardConfirmStart = null;
  let background20SecTimer = null;
  let cardReturn1MinTimer = null;

  // ==========================================================================
  // 2. A-FRAME CUSTOM COMPONENTS
  // ==========================================================================
  if (typeof AFRAME !== 'undefined') {
    // Anchor & Freeze Pose Component for 3D Mode (Stops continuous card tracking after scan)
    AFRAME.registerComponent('freeze-on-lock', {
      init: function () {
        this.frozenMatrix = new THREE.Matrix4();
        this.isFrozen = false;
      },
      lockCurrentPose: function () {
        if (this.el && this.el.object3D) {
          this.frozenMatrix.copy(this.el.object3D.matrix);
          this.isFrozen = true;
          console.log("[3D Anchor] World pose locked. Continuous card tracking stopped.");
        }
      },
      unlock: function () {
        this.isFrozen = false;
        console.log("[3D Anchor] Unlocked tracking for background scan check.");
      },
      tick: function () {
        if (currentMode === MODES.THREED && this.isFrozen && this.el.object3D) {
          this.el.object3D.matrix.copy(this.frozenMatrix);
          this.el.object3D.matrixWorldNeedsUpdate = true;
          this.el.object3D.visible = true;
        }
      }
    });

    // GLTF Animation Controller (Plays all animations on models reliably)
    AFRAME.registerComponent('play-all-animations', {
      init: function () {
        this.mixer = null;
        this.actions = [];
        this.isPlaying = false;

        const setupAndPlay = () => {
          const meshObj = this.el.getObject3D('mesh');
          const gltfComp = this.el.components['gltf-model'];
          const animations = (gltfComp && gltfComp.model && gltfComp.model.animations) ||
            (meshObj && meshObj.animations) || [];

          if (meshObj && animations && animations.length > 0) {
            if (!this.mixer) {
              this.mixer = new THREE.AnimationMixer(meshObj);
              this.actions = animations.map((clip) => {
                const action = this.mixer.clipAction(clip);
                action.setLoop(THREE.LoopRepeat, Infinity);
                action.clampWhenFinished = false;
                action.play();
                return action;
              });
              this.isPlaying = true;
              console.log(`[Animation] Playing ${this.actions.length} animation track(s) on #${this.el.id || 'model'}`);
            }
          }
        };

        this.el.addEventListener('model-loaded', setupAndPlay);
        if (this.el.getObject3D('mesh')) {
          setupAndPlay();
        }

        // Synchronize AR animation playback with image target detection
        const targetEntity = document.getElementById('ar-target');
        if (targetEntity) {
          targetEntity.addEventListener('targetFound', () => {
            this.playAnimations();
          });
          targetEntity.addEventListener('targetLost', () => {
            if (currentMode === MODES.AR) this.pauseAnimations();
          });
        }
      },
      playAnimations: function () {
        if (!this.mixer || this.actions.length === 0) return;
        this.actions.forEach((action) => {
          action.paused = false;
          action.play();
        });
        this.isPlaying = true;
      },
      pauseAnimations: function () {
        if (!this.mixer) return;
        this.actions.forEach((action) => {
          action.paused = true;
        });
        this.isPlaying = false;
      },
      tick: function (t, dt) {
        if (this.mixer && this.isPlaying && dt) {
          this.mixer.update(dt / 1000);
        }
      }
    });

    // First-Person 360 Camera Look & Device Orientation Controller for 3D Mode
    AFRAME.registerComponent('touch-rotate', {
      init: function () {
        this.isDragging = false;
        this.previousX = 0;
        this.previousY = 0;
        this.camYaw = 0;   // Horizontal camera angle in degrees (0 = front facing fixed assets)
        this.camPitch = 0; // Vertical camera angle in degrees
        this.currentScale = 1.0;
        this.initialPinchDist = 0;
        this.rotationSpeed = 0.4;
        this.autoRotateSpeed = 0.15;
        this.lastInteractTime = performance.now();
        this.initialAlpha = null;

        const getCameraEl = () => document.getElementById('main-camera');

        const updateCameraRotation = () => {
          const cameraEl = getCameraEl();
          if (cameraEl && cameraEl.object3D) {
            cameraEl.object3D.rotation.y = THREE.MathUtils.degToRad(this.camYaw);
            cameraEl.object3D.rotation.x = THREE.MathUtils.degToRad(this.camPitch);
            cameraEl.object3D.rotation.z = 0;
          }
        };

        const onPointerDown = (e) => {
          if (currentMode !== MODES.THREED || !has3DUnlocked) return;
          if (e.target.closest('#app-header') || e.target.closest('.modal-overlay')) return;

          if (e.touches && e.touches.length === 2) {
            // Two-finger pinch gesture start
            this.isDragging = false;
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            this.initialPinchDist = Math.hypot(dx, dy);
            return;
          }

          this.isDragging = true;
          const clientX = e.touches ? e.touches[0].clientX : e.clientX;
          const clientY = e.touches ? e.touches[0].clientY : e.clientY;
          this.previousX = clientX;
          this.previousY = clientY;
          this.lastInteractTime = performance.now();
        };

        const onPointerMove = (e) => {
          if (currentMode !== MODES.THREED) return;

          // Handle Two-Finger Pinch Zoom on Mobile
          if (e.touches && e.touches.length === 2 && this.initialPinchDist > 0) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const newDist = Math.hypot(dx, dy);
            const scaleDelta = (newDist - this.initialPinchDist) * 0.005;
            this.currentScale = Math.max(0.4, Math.min(3.0, this.currentScale + scaleDelta));
            this.el.setAttribute('scale', `${this.currentScale.toFixed(2)} ${this.currentScale.toFixed(2)} ${this.currentScale.toFixed(2)}`);
            this.initialPinchDist = newDist;
            this.lastInteractTime = performance.now();
            return;
          }

          if (!this.isDragging) return;

          const clientX = e.touches ? e.touches[0].clientX : e.clientX;
          const clientY = e.touches ? e.touches[0].clientY : e.clientY;
          const deltaX = clientX - this.previousX;
          const deltaY = clientY - this.previousY;

          this.previousX = clientX;
          this.previousY = clientY;
          this.lastInteractTime = performance.now();

          // Camera Look: Moving mouse/touch rotates camera angle in 360 degrees
          this.camYaw = (this.camYaw - deltaX * this.rotationSpeed) % 360;
          this.camPitch = Math.max(-60, Math.min(60, this.camPitch + deltaY * (this.rotationSpeed * 0.45)));

          updateCameraRotation();
        };

        const onPointerUp = (e) => {
          if (!e.touches || e.touches.length === 0) {
            this.isDragging = false;
            this.initialPinchDist = 0;
          }
        };

        // Mouse Wheel Scroll Zoom In / Zoom Out
        const onWheel = (e) => {
          if (currentMode !== MODES.THREED || !has3DUnlocked) return;
          e.preventDefault();
          const zoomDelta = -e.deltaY * 0.0015;
          this.currentScale = Math.max(0.4, Math.min(3.0, this.currentScale + zoomDelta));
          this.el.setAttribute('scale', `${this.currentScale.toFixed(2)} ${this.currentScale.toFixed(2)} ${this.currentScale.toFixed(2)}`);
          this.lastInteractTime = performance.now();
        };

        // Double-click or Double-tap to reset camera look angle to center (0° front view)
        let lastTapTime = 0;
        const onDoubleTap = (e) => {
          if (currentMode !== MODES.THREED || !has3DUnlocked) return;
          if (e.target.closest('#app-header') || e.target.closest('.modal-overlay')) return;
          const now = performance.now();
          if (now - lastTapTime < 300) {
            this.camYaw = 0;
            this.camPitch = 0;
            this.currentScale = 1.0;
            updateCameraRotation();
            this.el.setAttribute('scale', '1 1 1');
            this.lastInteractTime = performance.now();
          }
          lastTapTime = now;
        };

        // Device Orientation (Phone Physical 360° Turning & Gyroscope Look)
        window.addEventListener('deviceorientation', (event) => {
          console.log('GYRO:', {
            alpha: event.alpha,
            beta: event.beta,
            gamma: event.gamma
          });

          if (currentMode !== MODES.THREED || !has3DUnlocked || this.isDragging) return;
          if (event.alpha === null || event.alpha === undefined) return;

          if (this.initialAlpha === null) {
            this.initialAlpha = event.alpha;
          }
          // Relative heading delta around Y-axis (Turning phone left/right/behind in room)
          const deltaHeading = (event.alpha - this.initialAlpha);
          if (Math.abs(deltaHeading) > 0.5) {
            const cameraEl = getCameraEl();
            if (cameraEl && cameraEl.object3D) {
              const effectiveYaw = this.camYaw + deltaHeading;
              cameraEl.object3D.rotation.y = THREE.MathUtils.degToRad(effectiveYaw);
            }
          }
        }, { passive: true });

        window.addEventListener('mousedown', onPointerDown, { passive: true });
        window.addEventListener('mousemove', onPointerMove, { passive: true });
        window.addEventListener('mouseup', onPointerUp, { passive: true });
        window.addEventListener('click', onDoubleTap, { passive: true });

        window.addEventListener('touchstart', onPointerDown, { passive: true });
        window.addEventListener('touchmove', onPointerMove, { passive: true });
        window.addEventListener('touchend', onPointerUp, { passive: true });
        window.addEventListener('touchend', onDoubleTap, { passive: true });
        window.addEventListener('wheel', onWheel, { passive: false });

        // iOS Safari DeviceOrientation Permission Initializer
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
          const requestGyroPermission = () => {
            DeviceOrientationEvent.requestPermission()
              .then((permissionState) => {
                if (permissionState === 'granted') {
                  console.log("[Gyroscope] iOS Sensor Permission Granted.");
                }
              })
              .catch(console.error);
          };
          window.addEventListener('click', requestGyroPermission, { once: true });
          window.addEventListener('touchend', requestGyroPermission, { once: true });
        }
      }
    });
  }

  // ==========================================================================
  // 3. LIFECYCLE & STATE MACHINE CONTROLLERS
  // ==========================================================================
  function updateStatusPill(className, text) {
    const statusPill = document.getElementById('status-pill');
    const statusText = document.getElementById('status-text');
    if (statusPill) statusPill.className = `status-pill ${className}`;
    if (statusText) statusText.textContent = text;
  }

  function start3SecondConfirmation(onSuccess) {
    clear3SecondConfirmation();
    cardConfirmStart = performance.now();
    updateStatusPill('scanning', 'Scanning... Hold Still');

    cardConfirmTimer = setTimeout(() => {
      cardConfirmTimer = null;
      cardConfirmStart = null;
      if (typeof onSuccess === 'function') onSuccess();
    }, 3000);
  }

  function clear3SecondConfirmation() {
    if (cardConfirmTimer) {
      clearTimeout(cardConfirmTimer);
      cardConfirmTimer = null;
    }
    cardConfirmStart = null;
  }

  function buildOrRefresh3DEnvironment() {
    has3DUnlocked = true;
    const threedWrapper = document.getElementById('threed-content-wrapper');
    const targetEntity = document.getElementById('ar-target');
    const reticle = document.getElementById('scanning-reticle');
    const gestureHint = document.getElementById('gesture-hint');

    if (reticle) {
      reticle.classList.add('hidden');
      reticle.style.display = 'none';
    }

    if (targetEntity && targetEntity.object3D) {
      targetEntity.object3D.visible = true;
    }

    if (threedWrapper) {
      threedWrapper.setAttribute('visible', 'true');
      if (threedWrapper.object3D) {
        threedWrapper.object3D.visible = true;
        threedWrapper.object3D.scale.set(1, 1, 1);
      }
      threedWrapper.setAttribute('scale', '1 1 1');
      threedWrapper.emit('threedFound');

      const models = threedWrapper.querySelectorAll('[play-all-animations]');
      models.forEach((m) => {
        const comp = m.components['play-all-animations'];
        if (comp) comp.playAnimations();
      });
    }

    // Status Pill: "Card Found"
    updateStatusPill('threed-active', 'Card Found');

    if (gestureHint) {
      gestureHint.classList.remove('hidden');
      setTimeout(() => {
        if (gestureHint) gestureHint.classList.add('hidden');
      }, 4500);
    }
  }

  function handleCardConfirmed() {
    console.log("[Lifecycle] 3-Second Card Scan Confirmed! Creating/refreshing 3D Environment.");

    // Clear any active 1-minute card-return timers
    clear1MinCardTimeout();

    // 1. Create or refresh the 3D environment
    buildOrRefresh3DEnvironment();

    // 2. Lock the 3D pose in place — STOPS continuous card tracking completely!
    const targetEntity = document.getElementById('ar-target');
    if (targetEntity && targetEntity.components['freeze-on-lock']) {
      targetEntity.components['freeze-on-lock'].lockCurrentPose();
    }

    // 3. Transition to ACTIVE_BUILDING state
    threedState = THREED_STATE.ACTIVE_BUILDING;

    // 4. Start 20-Second Background Build Process (invisible to user)
    start20SecondBackgroundBuild();
  }

  function start20SecondBackgroundBuild() {
    if (background20SecTimer) {
      clearTimeout(background20SecTimer);
    }
    console.log("[Lifecycle] Starting 20-second background environment build process...");

    background20SecTimer = setTimeout(() => {
      background20SecTimer = null;
      on20SecondBackgroundComplete();
    }, 20000);
  }

  function on20SecondBackgroundComplete() {
    console.log("[Lifecycle] 20-second background process complete. Checking card presence for new build...");

    // Unlock target pose to allow background scanner to evaluate new card placement
    const targetEntity = document.getElementById('ar-target');
    if (targetEntity && targetEntity.components['freeze-on-lock']) {
      targetEntity.components['freeze-on-lock'].unlock();
    }

    if (isCardInView) {
      // Case: Card is currently inside the camera frame -> Require 3-second continuous scan
      console.log("[Lifecycle] Card is visible! Requiring 3-second continuous confirmation...");
      start3SecondConfirmation(() => {
        handleCardConfirmed();
      });
    } else {
      // Case: Card is NOT in camera frame -> Transition to 1-Minute Waiting State (Card absent is OK)
      console.log("[Lifecycle] Card is not in frame. Entering 1-Minute Waiting Period...");
      threedState = THREED_STATE.WAITING_FOR_CARD_1MIN;
      start1MinCardTimeout();
    }
  }

  function start1MinCardTimeout() {
    clear1MinCardTimeout();
    console.log("[Lifecycle] 1-Minute card-return countdown started.");

    cardReturn1MinTimer = setTimeout(() => {
      cardReturn1MinTimer = null;
      on1MinCardTimeoutExpired();
    }, 60000);
  }

  function clear1MinCardTimeout() {
    if (cardReturn1MinTimer) {
      clearTimeout(cardReturn1MinTimer);
      cardReturn1MinTimer = null;
    }
  }

  function on1MinCardTimeoutExpired() {
    console.log("[Lifecycle] 1-Minute waiting period expired without card return.");
    threedState = THREED_STATE.REQUIRE_RESCAN;

    // Change status pill to warning state
    updateStatusPill('warning', 'Scan card again');
  }

  function simulateTargetFound() {
    isSimulatedTargetFound = true;
    const targetEntity = document.getElementById('ar-target');
    const arWrapper = document.getElementById('ar-content-wrapper');
    const reticle = document.getElementById('scanning-reticle');

    if (reticle) {
      reticle.classList.add('hidden');
      reticle.style.display = 'none';
    }

    if (currentMode === MODES.AR) {
      updateStatusPill('tracking', 'SJ AR Card');

      if (arWrapper) {
        arWrapper.setAttribute('visible', 'true');
        if (arWrapper.object3D) arWrapper.object3D.visible = true;
        arWrapper.setAttribute('scale', '1 1 1');
        arWrapper.emit('targetFound');
      }
      if (targetEntity) targetEntity.emit('targetFound');

    } else if (currentMode === MODES.THREED) {
      isCardInView = true;
      start3SecondConfirmation(() => {
        handleCardConfirmed();
      });
    }
  }

  function simulateTargetLost() {
    isSimulatedTargetFound = false;
    const targetEntity = document.getElementById('ar-target');
    const arWrapper = document.getElementById('ar-content-wrapper');
    const reticle = document.getElementById('scanning-reticle');

    if (currentMode === MODES.AR) {
      updateStatusPill('searching', 'Scan SJ AR Card');
      if (reticle) {
        reticle.classList.remove('hidden');
        reticle.style.display = 'flex';
      }
      if (arWrapper) {
        arWrapper.setAttribute('visible', 'false');
        if (arWrapper.object3D) arWrapper.object3D.visible = false;
      }
      if (targetEntity) targetEntity.emit('targetLost');
    } else if (currentMode === MODES.THREED) {
      isCardInView = false;
      clear3SecondConfirmation();
    }
  }

  function showCameraGuidance(title, desc, errorDetails, isBlocked) {
    // If on localhost dev bypass mode (port 5000), automatically proceed with simulation
    if (isBypassMode) {
      console.log("[Bypass Mode :5000] Auto-bypassing camera restriction on port 5000.");
      hideCameraGuidance();
      setTimeout(simulateTargetFound, 600);
      return;
    }

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
      if (isBypassMode) {
        hideCameraGuidance();
        setTimeout(simulateTargetFound, 600);
        return;
      }
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

    if (isBypassMode) {
      console.log("[Bypass Mode :5000] Camera error on port 5000 - automatically falling back to simulated models.");
      hideCameraGuidance();
      setTimeout(simulateTargetFound, 600);
      return;
    }

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

    if (devSimulateTimeout) {
      clearTimeout(devSimulateTimeout);
      devSimulateTimeout = null;
    }

    if (selectedMode === 'AR') {
      currentMode = MODES.AR;
      if (modeLabel) modeLabel.textContent = 'AR Mode';

      // Clear 3D Lifecycle Timers & Unfreeze
      clear3SecondConfirmation();
      if (background20SecTimer) { clearTimeout(background20SecTimer); background20SecTimer = null; }
      clear1MinCardTimeout();

      const targetEntity = document.getElementById('ar-target');
      if (targetEntity && targetEntity.components['freeze-on-lock']) {
        targetEntity.components['freeze-on-lock'].unlock();
      }

      // Hide 3D content, reset status
      if (threedWrapper) {
        threedWrapper.setAttribute('visible', 'false');
        if (threedWrapper.object3D) threedWrapper.object3D.visible = false;
      }
      const cameraEl = document.getElementById('main-camera');
      if (cameraEl && cameraEl.object3D) cameraEl.object3D.rotation.set(0, 0, 0);

      if (gestureHint) gestureHint.classList.add('hidden');

      updateStatusPill('searching', 'Scan SJ AR Card');

      updateReticleVisibility();
      startARSession();

      // On Port 5000 Bypass mode, automatically trigger detection in 600ms
      if (isBypassMode) {
        devSimulateTimeout = setTimeout(() => {
          if (currentMode === MODES.AR) {
            console.log("[Bypass Mode :5000] Auto-detecting SJ AR Card.");
            simulateTargetFound();
          }
        }, 600);
      }

    } else if (selectedMode === 'THREED') {
      currentMode = MODES.THREED;
      if (modeLabel) modeLabel.textContent = '3D Mode';

      // Hide AR content
      if (arWrapper) {
        arWrapper.setAttribute('visible', 'false');
        if (arWrapper.object3D) arWrapper.object3D.visible = false;
      }

      if (has3DUnlocked) {
        // Already unlocked: directly show 3D world
        if (threedWrapper) {
          threedWrapper.setAttribute('visible', 'true');
          if (threedWrapper.object3D) threedWrapper.object3D.visible = true;
          threedWrapper.setAttribute('scale', '1 1 1');
        }
        if (threedState === THREED_STATE.REQUIRE_RESCAN) {
          updateStatusPill('warning', 'Scan card again');
        } else {
          updateStatusPill('threed-active', 'Card Found');
        }
        if (gestureHint) {
          gestureHint.classList.remove('hidden');
          setTimeout(() => gestureHint.classList.add('hidden'), 4500);
        }
        updateReticleVisibility();
      } else {
        // Needs initial 3-second scan
        threedState = THREED_STATE.SEARCHING_INITIAL;
        updateStatusPill('searching', 'Point camera at Card');
        updateReticleVisibility();

        // On Port 5000 Bypass mode, automatically trigger detection in 600ms
        if (isBypassMode) {
          devSimulateTimeout = setTimeout(() => {
            if (currentMode === MODES.THREED && !has3DUnlocked) {
              console.log("[Bypass Mode :5000] Auto-detecting SJ 3D Card.");
              simulateTargetFound();
            }
          }, 600);
        }
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
    // Target Recognition Events (Handles AR Continuous Tracking vs 3D Lifecycle)
    // ========================================================================
    if (targetEntity) {
      targetEntity.addEventListener('targetFound', () => {
        if (currentMode === MODES.AR) {
          // --- AR MODE (Continuous Live Tracking) ---
          updateStatusPill('tracking', 'SJ AR Card');
          if (reticle) reticle.classList.add('hidden');

          if (arWrapper) {
            arWrapper.setAttribute('visible', 'true');
            if (arWrapper.object3D) arWrapper.object3D.visible = true;
            arWrapper.emit('targetFound');
          }
        } else if (currentMode === MODES.THREED) {
          // --- 3D MODE (3-Second Card Confirmation & Lifecycle Manager) ---
          isCardInView = true;

          if (threedWrapper) {
            threedWrapper.setAttribute('visible', 'true');
            if (threedWrapper.object3D) {
              threedWrapper.object3D.visible = true;
              threedWrapper.object3D.scale.set(1, 1, 1);
            }
          }

          if (threedState === THREED_STATE.SEARCHING_INITIAL ||
              threedState === THREED_STATE.WAITING_FOR_CARD_1MIN ||
              threedState === THREED_STATE.REQUIRE_RESCAN) {
            // Start continuous 3-second card confirmation
            start3SecondConfirmation(() => {
              handleCardConfirmed();
            });
          } else if (threedState === THREED_STATE.ACTIVE_BUILDING) {
            // During 20s background process, card in frame is noted but user explores undisturbed
          }
        }
      });

      targetEntity.addEventListener('targetLost', () => {
        if (currentMode === MODES.AR) {
          // --- AR MODE: Hide models when card is lost ---
          updateStatusPill('searching', 'Scan SJ AR Card');
          if (reticle) reticle.classList.remove('hidden');

          if (arWrapper) {
            arWrapper.setAttribute('visible', 'false');
            if (arWrapper.object3D) arWrapper.object3D.visible = false;
          }
        } else if (currentMode === MODES.THREED) {
          // --- 3D MODE: Card absence is completely acceptable ---
          isCardInView = false;
          clear3SecondConfirmation();

          if (threedState === THREED_STATE.SEARCHING_INITIAL) {
            updateStatusPill('searching', 'Point camera at Card');
          } else if (threedState === THREED_STATE.ACTIVE_BUILDING) {
            // Keep 3D models visible! Status stays "Card Found"
            targetEntity.object3D.visible = true;
            if (threedWrapper) {
              threedWrapper.setAttribute('visible', 'true');
              if (threedWrapper.object3D) threedWrapper.object3D.visible = true;
            }
          } else if (threedState === THREED_STATE.WAITING_FOR_CARD_1MIN) {
            // 1-minute countdown continues in background
            targetEntity.object3D.visible = true;
            if (threedWrapper) {
              threedWrapper.setAttribute('visible', 'true');
              if (threedWrapper.object3D) threedWrapper.object3D.visible = true;
            }
          } else if (threedState === THREED_STATE.REQUIRE_RESCAN) {
            // Status remains "Scan card again"
            updateStatusPill('warning', 'Scan card again');
            targetEntity.object3D.visible = true;
            if (threedWrapper) {
              threedWrapper.setAttribute('visible', 'true');
              if (threedWrapper.object3D) threedWrapper.object3D.visible = true;
            }
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

    // Port 5000 Bypass Helpers: Click status-pill or press Spacebar to toggle card detection
    if (isBypassMode) {
      console.log("%c[WebAR Card Bypass Mode Active :5000] Running on Port 5000. Card scanning bypassed! Press SPACEBAR or tap the Status Pill to toggle.", "color: #10b981; font-weight: bold; font-size: 13px;");
      if (statusPill) {
        statusPill.style.cursor = 'pointer';
        statusPill.title = 'Bypass Mode: Click to toggle Card Detection';
        statusPill.addEventListener('click', () => {
          if (isSimulatedTargetFound) {
            simulateTargetLost();
          } else {
            simulateTargetFound();
          }
        });
      }

      window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
          e.preventDefault();
          if (isSimulatedTargetFound) {
            simulateTargetLost();
          } else {
            simulateTargetFound();
          }
        }
      });
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


