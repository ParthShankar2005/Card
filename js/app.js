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
    THREED: 'THREED',
    TRYON: 'TRYON'
  };

  // Port 5000 is the offline Dev Bypass Mode for rapid model inspection
  // Port 3000 and Production STRICTLY require a physical card scan (No URL link bypass)
  const isBypassMode = window.location.port === '5000';

  let currentMode = MODES.LOADING;
  let has3DUnlocked = false;
  let isARStarting = false;
  let isARRunning = false;
  let devSimulateTimeout = null;
  let isSimulatedTargetFound = false;

  // ==========================================================================
  // 3D MODE — CONTINUOUS 30-SECOND BACKGROUND IMAGE TRACKING LOOP
  // ==========================================================================
  const THREED_STATE = {
    INITIAL_SCAN: 'INITIAL_SCAN',       // Initial: Point camera at Card (3s confirmation)
    ACTIVE_3D_LOOP: 'ACTIVE_3D_LOOP'    // 3D Mode: Foreground 3D exploration + continuous 30s background tracking loop
  };

  let threedState = THREED_STATE.INITIAL_SCAN;
  let isCardInView = false;
  let cardConfirmTimer = null;
  let background30SecTimer = null;

  // ==========================================================================
  // 3D CONTROL MODES (GYROSCOPE 360° vs MANUAL TOUCH GESTURES)
  // ==========================================================================
  const CONTROL_MODES = {
    GYRO: 'GYRO',   // Pure Gyroscope & Compass 360° Look (Touch Drag Paused)
    TOUCH: 'TOUCH'  // Pure Touch Drag & Pinch Zoom (Gyro Sensor Paused)
  };
  let active3DControlMode = CONTROL_MODES.GYRO;

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

    // First-Person True 360° Spatial Camera (6-DOF Dolly Zoom & High-Sensitivity Gyro) for 3D Mode
    AFRAME.registerComponent('touch-rotate', {
      init: function () {
        this.isDragging = false;
        this.previousX = 0;
        this.previousY = 0;
        this.camYaw = 0;          // Touch offset yaw
        this.camPitch = 0;        // Touch offset pitch
        this.targetYaw = 0;       // Target yaw (full 360°)
        this.targetPitch = 0;     // Target pitch (full up/down)
        this.currentYaw = 0;      // Current smoothed yaw
        this.currentPitch = 0;    // Current smoothed pitch
        this.targetDolly = 0;     // Target Camera Dolly distance in meters (Closer/Further)
        this.currentDolly = 0;    // Smoothed Camera Dolly distance
        this.initialPinchDist = 0;
        this.rotationSpeed = 0.4;
        this.initialHeading = null; // Baseline compass heading at moment of scan
        this.initialBeta = null;    // Baseline pitch at moment of scan
        this.lastHeading = null;
        this.lastBeta = null;

        const getCameraEl = () => document.getElementById('main-camera');

        // Calibrates baseline sensor angles to zero out view at the exact scan moment
        this.calibrateScanOrientation = () => {
          this.initialHeading = this.lastHeading;
          this.initialBeta = this.lastBeta;
          this.camYaw = 0;
          this.camPitch = 0;
          this.targetYaw = 0;
          this.targetPitch = 0;
          this.currentYaw = 0;
          this.currentPitch = 0;
          this.targetDolly = 0;
          this.currentDolly = 0;
          const cameraEl = getCameraEl();
          if (cameraEl && cameraEl.object3D) {
            cameraEl.object3D.rotation.set(0, 0, 0);
            cameraEl.object3D.position.set(0, 0, 0);
          }
          console.log("[Spatial Camera] Calibrated directly on card normal with compass. Zero orientation locked.");
        };

        // Synchronizes gyro baseline when switching back to Gyro mode from Touch mode
        this.syncGyroBaseline = () => {
          if (this.lastHeading !== null) {
            this.initialHeading = this.lastHeading - this.targetYaw;
          }
          if (this.lastBeta !== null) {
            this.initialBeta = this.lastBeta - this.targetPitch;
          }
          this.camYaw = 0;
          this.camPitch = 0;
        };

        const onPointerDown = (e) => {
          if (currentMode !== MODES.THREED || !has3DUnlocked) return;
          if (e.target.closest('#app-header') || e.target.closest('.modal-overlay') || e.target.closest('#btn-control-toggle')) return;

          // Two-Finger Pinch Gesture Start
          if (e.touches && e.touches.length === 2) {
            this.isDragging = false;
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            this.initialPinchDist = Math.hypot(dx, dy);
            return;
          }

          // In Touch Mode: Enable drag rotation
          if (active3DControlMode === CONTROL_MODES.TOUCH) {
            this.isDragging = true;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            this.previousX = clientX;
            this.previousY = clientY;
          }
        };

        const onPointerMove = (e) => {
          if (currentMode !== MODES.THREED) return;

          // Blender-style Spatial Dolly Zoom (Pinch Spread = Dolly In / Pinch Close = Dolly Out)
          if (e.touches && e.touches.length === 2 && this.initialPinchDist > 0) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const newDist = Math.hypot(dx, dy);
            const pinchDelta = (newDist - this.initialPinchDist) * 0.006;
            // Dolly range: from close-up inspection (+0.8m) to wide full-world overview (-2.5m)
            this.targetDolly = Math.max(-2.5, Math.min(0.85, this.targetDolly + pinchDelta));
            this.initialPinchDist = newDist;
            return;
          }

          // Drag Rotation: ONLY active in TOUCH Mode
          if (active3DControlMode !== CONTROL_MODES.TOUCH || !this.isDragging) return;

          const clientX = e.touches ? e.touches[0].clientX : e.clientX;
          const clientY = e.touches ? e.touches[0].clientY : e.clientY;
          const deltaX = clientX - this.previousX;
          const deltaY = clientY - this.previousY;

          this.previousX = clientX;
          this.previousY = clientY;

          // Smooth touch look offset (Full 360° range)
          this.camYaw = (this.camYaw - deltaX * this.rotationSpeed) % 360;
          this.camPitch = Math.max(-88, Math.min(88, this.camPitch + deltaY * (this.rotationSpeed * 0.5)));

          this.targetYaw = this.camYaw;
          this.targetPitch = this.camPitch;
        };

        const onPointerUp = (e) => {
          if (!e.touches || e.touches.length === 0) {
            this.isDragging = false;
            this.initialPinchDist = 0;
          }
        };

        // Computes True 360° Yaw and Full Elevation Pitch from compass and gyro
        this.updateTargetRotation = () => {
          if (active3DControlMode !== CONTROL_MODES.GYRO) return;

          let gyroYawDelta = 0;
          let gyroPitchDelta = 0;

          if (this.initialHeading !== null && this.lastHeading !== null) {
            gyroYawDelta = (this.lastHeading - this.initialHeading);
            // Shortest rotational delta wrapping around 360°
            while (gyroYawDelta > 180) gyroYawDelta -= 360;
            while (gyroYawDelta < -180) gyroYawDelta += 360;
          }

          if (this.initialBeta !== null && this.lastBeta !== null) {
            gyroPitchDelta = (this.lastBeta - this.initialBeta);
          }

          // Sub-pixel threshold for instant, highly sensitive response
          if (Math.abs(gyroYawDelta) < 0.05) gyroYawDelta = 0;
          if (Math.abs(gyroPitchDelta) < 0.05) gyroPitchDelta = 0;

          this.targetYaw = this.camYaw + gyroYawDelta;
          this.targetPitch = Math.max(-88, Math.min(88, this.camPitch + gyroPitchDelta));
        };

        // Mouse Wheel Spatial Camera Dolly In / Dolly Out
        const onWheel = (e) => {
          if (currentMode !== MODES.THREED || !has3DUnlocked) return;
          e.preventDefault();
          const dollyDelta = -e.deltaY * 0.002;
          this.targetDolly = Math.max(-2.5, Math.min(0.85, this.targetDolly + dollyDelta));
        };

        // Double-click or Double-tap to reset camera look angle and distance to center
        let lastTapTime = 0;
        const onDoubleTap = (e) => {
          if (currentMode !== MODES.THREED || !has3DUnlocked) return;
          if (e.target.closest('#app-header') || e.target.closest('.modal-overlay') || e.target.closest('#btn-control-toggle')) return;
          const now = performance.now();
          if (now - lastTapTime < 300) {
            this.calibrateScanOrientation();
          }
          lastTapTime = now;
        };

        // True 360° Compass & Gyroscope Fusion Event Listener
        window.addEventListener('deviceorientation', (event) => {
          console.log('GYRO:', {
            alpha: event.alpha,
            beta: event.beta,
            gamma: event.gamma,
            compass: event.webkitCompassHeading
          });

          // Accurate heading (using iOS WebKit compass heading when available or standard alpha)
          const heading = (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null)
            ? (360 - event.webkitCompassHeading)
            : event.alpha;

          this.lastHeading = heading;
          this.lastBeta = event.beta;

          if (currentMode !== MODES.THREED || !has3DUnlocked) return;
          if (heading === null || heading === undefined) return;

          // Gyro orientation only updates target pose when GYRO mode is active
          if (active3DControlMode === CONTROL_MODES.GYRO) {
            if (this.initialHeading === null) {
              this.initialHeading = heading;
            }
            if (this.initialBeta === null && event.beta !== null) {
              this.initialBeta = event.beta;
            }
            this.updateTargetRotation();
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
                  console.log("[Gyroscope] iOS Compass & Gyro Permission Granted.");
                }
              })
              .catch(console.error);
          };
          window.addEventListener('click', requestGyroPermission, { once: true });
          window.addEventListener('touchend', requestGyroPermission, { once: true });
        }
      },

      // High-frequency responsive 60fps spatial camera loop (Dolly Zoom + 360 Rotation)
      tick: function (t, dt) {
        if (currentMode !== MODES.THREED || !has3DUnlocked) return;
        if (!dt) return;

        const cameraEl = document.getElementById('main-camera');
        if (cameraEl && cameraEl.object3D) {
          // Responsive 60fps damping factor (LERP)
          const lerpFactor = Math.min(1.0, (dt / 1000) * 16.0);
          this.currentYaw = THREE.MathUtils.lerp(this.currentYaw, this.targetYaw, lerpFactor);
          this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, this.targetPitch, lerpFactor);
          this.currentDolly = THREE.MathUtils.lerp(this.currentDolly, this.targetDolly, lerpFactor);

          // 360 Rotation
          cameraEl.object3D.rotation.y = THREE.MathUtils.degToRad(this.currentYaw);
          cameraEl.object3D.rotation.x = THREE.MathUtils.degToRad(this.currentPitch);
          cameraEl.object3D.rotation.z = 0;

          // Spatial 3D Camera Dolly (Moves closer to inspect models or dollies out to view full world)
          cameraEl.object3D.position.z = -this.currentDolly;
        }
      }
    });
  }

  // ==========================================================================
  // 3. LIFECYCLE & 30-SECOND BACKGROUND LOOP CONTROLLER
  // ==========================================================================
  function updateStatusPill(className, text) {
    const statusPill = document.getElementById('status-pill');
    const statusText = document.getElementById('status-text');
    if (statusPill) statusPill.className = `status-pill ${className}`;
    if (statusText) statusText.textContent = text;
  }

  function start3SecondConfirmation(onSuccess) {
    clearConfirmationTimer();
    updateStatusPill('scanning', 'Scanning...');

    cardConfirmTimer = setTimeout(() => {
      cardConfirmTimer = null;
      if (typeof onSuccess === 'function') onSuccess();
    }, 3000); // 3 continuous seconds required for confirmation
  }

  function clearConfirmationTimer() {
    if (cardConfirmTimer) {
      clearTimeout(cardConfirmTimer);
      cardConfirmTimer = null;
    }
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

    // Creates NEW 3D Space (30% further camera distance + refreshed models & animations)
    if (threedWrapper) {
      threedWrapper.setAttribute('visible', 'true');
      threedWrapper.setAttribute('position', '0 0 -0.45');
      threedWrapper.setAttribute('scale', '0.75 0.75 0.75');
      if (threedWrapper.object3D) {
        threedWrapper.object3D.visible = true;
        threedWrapper.object3D.position.set(0, 0, -0.45);
        threedWrapper.object3D.scale.set(0.75, 0.75, 0.75);
      }
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
    console.log("[3D Mode] 3-Second Card Scan Confirmed! Creating NEW 3D Space & Removing OLD Space.");

    // 1. Create or refresh the 3D environment & update status pill
    buildOrRefresh3DEnvironment();

    // 2. Lock the new 3D location in place — STOPS continuous card tracking completely!
    const targetEntity = document.getElementById('ar-target');
    if (targetEntity && targetEntity.components['freeze-on-lock']) {
      targetEntity.components['freeze-on-lock'].lockCurrentPose();
    }

    // 3. Reset camera and calibrate gyro baseline straight along the card normal (0, 0, 0)
    const cameraEl = document.getElementById('main-camera');
    if (cameraEl && cameraEl.object3D) {
      cameraEl.object3D.rotation.set(0, 0, 0);
    }
    const threedWrapper = document.getElementById('threed-content-wrapper');
    if (threedWrapper && threedWrapper.components['touch-rotate']) {
      threedWrapper.components['touch-rotate'].calibrateScanOrientation();
    }

    // 4. Transition state to ACTIVE_3D_LOOP
    threedState = THREED_STATE.ACTIVE_3D_LOOP;

    // 5. Start / Reset 30-Second Background Loop
    start30SecondBackgroundLoop();
  }

  function start30SecondBackgroundLoop() {
    if (background30SecTimer) {
      clearTimeout(background30SecTimer);
      background30SecTimer = null;
    }

    if (currentMode !== MODES.THREED) return;

    console.log("[3D Background Loop] Starting new 30-second tracking/build cycle...");

    background30SecTimer = setTimeout(() => {
      background30SecTimer = null;
      on30SecondCycleComplete();
    }, 30000); // 30-Second cycle
  }

  function on30SecondCycleComplete() {
    if (currentMode !== MODES.THREED) return;

    console.log("[3D Background Loop] 30 seconds complete.");

    // Case 1 — Card Not Found / Cycle Elapsed:
    // Keep current 3D space untouched, no error, no interruption.
    // Immediately restart another 30-second cycle forever!
    start30SecondBackgroundLoop();

    // If card happens to be in view at cycle boundary, ensure 3-second confirmation runs
    if (isCardInView && !cardConfirmTimer) {
      start3SecondConfirmation(() => {
        handleCardConfirmed();
      });
    }
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
      clearConfirmationTimer();
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
  // 4B. 3D CONTROL MODE CONTROLLER (GYRO vs TOUCH)
  // ==========================================================================
  window.handleToggleControlMode = function () {
    active3DControlMode = (active3DControlMode === CONTROL_MODES.GYRO) ? CONTROL_MODES.TOUCH : CONTROL_MODES.GYRO;
    updateControlModeUI(true);
  };

  function updateControlModeUI(showToast = false) {
    const btn = document.getElementById('btn-control-toggle');
    const icon = document.getElementById('control-toggle-icon');
    const text = document.getElementById('control-toggle-text');
    const gestureHint = document.getElementById('gesture-hint');
    const gestureHintText = document.getElementById('gesture-hint-text');

    if (!btn || !icon || !text) return;

    if (active3DControlMode === CONTROL_MODES.GYRO) {
      btn.className = 'control-toggle-btn';
      icon.innerHTML = '<i class="fas fa-compass"></i>';
      text.textContent = 'Gyro';
      btn.title = 'Current: Gyroscope Mode (Tap to switch to Touch Mode)';

      // Sync gyro baseline when switching back to Gyro
      const threedWrapper = document.getElementById('threed-content-wrapper');
      if (threedWrapper && threedWrapper.components['touch-rotate']) {
        threedWrapper.components['touch-rotate'].syncGyroBaseline();
      }

      if (showToast && gestureHint && gestureHintText) {
        const iconEl = gestureHint.querySelector('i');
        if (iconEl) iconEl.className = 'fas fa-compass';
        gestureHintText.textContent = 'Gyro Mode Active — Move phone to explore';
        gestureHint.classList.remove('hidden');
        setTimeout(() => gestureHint.classList.add('hidden'), 3200);
      }
    } else {
      btn.className = 'control-toggle-btn mode-touch';
      icon.innerHTML = '<i class="fas fa-hand-pointer"></i>';
      text.textContent = 'Touch';
      btn.title = 'Current: Touch Mode (Tap to switch to Gyroscope Mode)';

      if (showToast && gestureHint && gestureHintText) {
        const iconEl = gestureHint.querySelector('i');
        if (iconEl) iconEl.className = 'fas fa-hand-pointer';
        gestureHintText.textContent = 'Touch Mode Active — Drag to rotate & pinch to zoom';
        gestureHint.classList.remove('hidden');
        setTimeout(() => gestureHint.classList.add('hidden'), 3200);
      }
    }
  }

  // ==========================================================================
  // 4C. RING VIRTUAL TRY-ON ENGINE (MEDIAPIPE HANDS & OVERLAY)
  // ==========================================================================
  const tryOnState = {
    targetFinger: 'INDEX',
    diamondScaleRatio: 0.48,
    detConf: 0.7,
    trackConf: 0.7,
    isInitialized: false,
    isRunning: false
  };

  let tryOnCameraHelper = null;
  let tryOnHandsEngine = null;

  const diamondImg = new Image();
  let diamondImgLoaded = false;
  diamondImg.src = './assets/daimond.png';
  diamondImg.onload = () => {
    diamondImgLoaded = true;
  };

  const smoothedStates = {
    'Left': { x: null, y: null, angle: null, size: null, visible: false },
    'Right': { x: null, y: null, angle: null, size: null, visible: false }
  };

  function setupTryOnUIEvents() {
    const btnFingerTrigger = document.getElementById('btn_finger_trigger');
    const horizontalFingerBar = document.getElementById('horizontal_finger_bar');
    const triggerText = document.getElementById('trigger_text');
    const fingerOptionBtns = document.querySelectorAll('.finger-option-btn');

    if (btnFingerTrigger && horizontalFingerBar) {
      btnFingerTrigger.onclick = (e) => {
        e.stopPropagation();
        horizontalFingerBar.classList.toggle('open');
        btnFingerTrigger.classList.toggle('active-open');
      };

      document.addEventListener('click', (e) => {
        if (!e.target.closest('.expandable-finger-wrapper')) {
          if (horizontalFingerBar) horizontalFingerBar.classList.remove('open');
          if (btnFingerTrigger) btnFingerTrigger.classList.remove('active-open');
        }
      });
    }

    fingerOptionBtns.forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const selectedFinger = btn.dataset.finger;
        tryOnState.targetFinger = selectedFinger;

        if (triggerText) triggerText.textContent = selectedFinger;

        fingerOptionBtns.forEach(b => {
          if (b.dataset.finger === selectedFinger) {
            b.classList.add('active');
          } else {
            b.classList.remove('active');
          }
        });

        if (horizontalFingerBar) horizontalFingerBar.classList.remove('open');
        if (btnFingerTrigger) btnFingerTrigger.classList.remove('active-open');
      };
    });
  }

  function isHandFullyInFrame(landmarks) {
    if (!landmarks || landmarks.length < 21) return false;

    let mcpIdx = 5;
    let pipIdx = 6;
    if (tryOnState.targetFinger === 'MIDDLE') { mcpIdx = 9; pipIdx = 10; }
    else if (tryOnState.targetFinger === 'RING') { mcpIdx = 13; pipIdx = 14; }
    else if (tryOnState.targetFinger === 'PINKY') { mcpIdx = 17; pipIdx = 18; }

    const pMcp = landmarks[mcpIdx];
    const pPip = landmarks[pipIdx];

    if (!pMcp || !pPip || typeof pMcp.x !== 'number' || typeof pPip.x !== 'number') return false;

    const minBound = 0.005;
    const maxBound = 0.995;

    if (pMcp.x < minBound || pMcp.x > maxBound || pMcp.y < minBound || pMcp.y > maxBound) return false;
    if (pPip.x < minBound || pPip.x > maxBound || pPip.y < minBound || pPip.y > maxBound) return false;

    return true;
  }

  function getHandOrientation(landmarks, handedness) {
    if (!landmarks || landmarks.length < 21) return { isBackOfHand: true };

    const p0 = landmarks[0];   // Wrist
    const p5 = landmarks[5];   // Index MCP
    const p9 = landmarks[9];   // Middle MCP
    const p17 = landmarks[17]; // Pinky MCP

    const anchor = p0 || p9;

    const v1x = p5.x - anchor.x;
    const v1y = p5.y - anchor.y;
    const v2x = p17.x - anchor.x;
    const v2y = p17.y - anchor.y;

    const crossZ = (v1x * v2y) - (v1y * v2x);
    const isRight = (handedness === 'Right');

    const isBackOfHand = isRight ? (crossZ < 0) : (crossZ > 0);
    return { isBackOfHand };
  }

  function drawDiamondOnHandTop(canvasCtx, landmarks, handedness, width, height) {
    const handKey = (handedness === 'Left' || handedness === 'Right') ? handedness : 'Right';
    const smoothedState = smoothedStates[handKey];

    if (!landmarks || landmarks.length < 21) {
      smoothedState.visible = false;
      return;
    }

    if (!isHandFullyInFrame(landmarks)) {
      smoothedState.visible = false;
      return;
    }

    const orientation = getHandOrientation(landmarks, handedness);
    if (!orientation.isBackOfHand) {
      smoothedState.visible = false;
      return;
    }

    if (!diamondImgLoaded) return;

    let mcpIdx = 5;
    let pipIdx = 6;
    if (tryOnState.targetFinger === 'MIDDLE') { mcpIdx = 9; pipIdx = 10; }
    else if (tryOnState.targetFinger === 'RING') { mcpIdx = 13; pipIdx = 14; }
    else if (tryOnState.targetFinger === 'PINKY') { mcpIdx = 17; pipIdx = 18; }

    const pMcp = landmarks[mcpIdx];
    const pPip = landmarks[pipIdx];

    const rawX = ((pMcp.x + pPip.x) / 2) * width;
    const rawY = ((pMcp.y + pPip.y) / 2) * height;

    const dx = (pPip.x - pMcp.x) * width;
    const dy = (pPip.y - pMcp.y) * height;
    const rawAngle = Math.atan2(dy, dx) + Math.PI / 2;

    const pIndexMcp = landmarks[5];
    const pIndexPip = landmarks[6];
    const indexLength = Math.hypot((pIndexPip.x - pIndexMcp.x) * width, (pIndexPip.y - pIndexMcp.y) * height);
    const ratio = tryOnState.diamondScaleRatio || 0.48;
    const rawSize = Math.max(12, Math.min(width * 0.15, indexLength * ratio));

    if (!smoothedState.visible || smoothedState.x === null) {
      smoothedState.x = rawX;
      smoothedState.y = rawY;
      smoothedState.angle = rawAngle;
      smoothedState.size = rawSize;
      smoothedState.visible = true;
    } else {
      const deltaDist = Math.hypot(rawX - smoothedState.x, rawY - smoothedState.y);
      if (deltaDist > 1.0) {
        const aPos = Math.min(0.35, Math.max(0.08, deltaDist * 0.02));
        smoothedState.x += (rawX - smoothedState.x) * aPos;
        smoothedState.y += (rawY - smoothedState.y) * aPos;
      }

      let dAngle = rawAngle - smoothedState.angle;
      while (dAngle < -Math.PI) dAngle += Math.PI * 2;
      while (dAngle > Math.PI) dAngle -= Math.PI * 2;

      const aAngle = Math.min(0.5, Math.max(0.18, Math.abs(dAngle) * 0.7));
      smoothedState.angle += dAngle * aAngle;

      const dSize = rawSize - smoothedState.size;
      if (Math.abs(dSize) > 0.8) {
        smoothedState.size += dSize * 0.1;
      }
    }

    const { x, y, angle, size } = smoothedState;

    canvasCtx.save();
    canvasCtx.translate(x, y);
    canvasCtx.rotate(angle);

    canvasCtx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    canvasCtx.shadowBlur = 10;
    canvasCtx.shadowOffsetX = 1;
    canvasCtx.shadowOffsetY = 4;

    canvasCtx.drawImage(
      diamondImg,
      -size / 2,
      -size / 2,
      size,
      size
    );

    canvasCtx.restore();
  }

  function onTryOnResults(results) {
    const loader = document.getElementById('tryon-camera-loader');
    if (loader && loader.style.display !== 'none') {
      loader.style.display = 'none';
    }

    const webcamEl = document.getElementById('tryon-webcam');
    const canvasEl = document.getElementById('tryon-canvas');
    if (!canvasEl || !webcamEl) return;

    const canvasCtx = canvasEl.getContext('2d');
    if (webcamEl.videoWidth && webcamEl.videoHeight) {
      canvasEl.width = webcamEl.videoWidth;
      canvasEl.height = webcamEl.videoHeight;
    }

    const width = canvasEl.width;
    const height = canvasEl.height;

    canvasCtx.clearRect(0, 0, width, height);

    if (results.multiHandLandmarks && results.multiHandedness && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0];
      const handedness = results.multiHandedness[0].label;

      drawDiamondOnHandTop(canvasCtx, landmarks, handedness, width, height);
    } else {
      smoothedStates['Left'].visible = false;
      smoothedStates['Right'].visible = false;
    }
  }

  function startTryOnSession() {
    const webcamEl = document.getElementById('tryon-webcam');
    const container = document.getElementById('tryon-container');
    const loader = document.getElementById('tryon-camera-loader');

    if (!webcamEl || !container) return;

    container.classList.remove('hidden');
    container.style.display = 'block';
    if (loader) loader.style.display = 'flex';

    if (!tryOnState.isInitialized) {
      setupTryOnUIEvents();
      if (typeof Hands !== 'undefined') {
        tryOnHandsEngine = new Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        tryOnHandsEngine.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: tryOnState.detConf,
          minTrackingConfidence: tryOnState.trackConf
        });

        tryOnHandsEngine.onResults(onTryOnResults);
        tryOnState.isInitialized = true;
      }
    }

    if (typeof Camera !== 'undefined' && tryOnHandsEngine) {
      if (tryOnCameraHelper) {
        tryOnCameraHelper.start().catch(console.warn);
        tryOnState.isRunning = true;
        return;
      }

      tryOnCameraHelper = new Camera(webcamEl, {
        onFrame: async () => {
          if (tryOnHandsEngine && currentMode === MODES.TRYON) {
            await tryOnHandsEngine.send({ image: webcamEl });
          }
        },
        width: 1280,
        height: 720,
        facingMode: 'environment'
      });

      tryOnCameraHelper.start().catch(err => {
        console.warn("Front/default camera fallback for Try On:", err);
        const fallbackCam = new Camera(webcamEl, {
          onFrame: async () => {
            if (tryOnHandsEngine && currentMode === MODES.TRYON) {
              await tryOnHandsEngine.send({ image: webcamEl });
            }
          },
          width: 1280,
          height: 720
        });
        fallbackCam.start();
        tryOnCameraHelper = fallbackCam;
      });
      tryOnState.isRunning = true;
    }
  }

  function stopTryOnSession() {
    const container = document.getElementById('tryon-container');
    if (container) {
      container.classList.add('hidden');
      container.style.display = 'none';
    }
    if (tryOnCameraHelper) {
      tryOnCameraHelper.stop().catch(() => {});
    }
    tryOnState.isRunning = false;
    smoothedStates['Left'].visible = false;
    smoothedStates['Right'].visible = false;
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

      // Stop Try On Session & Restore A-Frame Scene
      stopTryOnSession();
      const arSceneEl = document.getElementById('ar-scene');
      if (arSceneEl) arSceneEl.style.display = 'block';

      // Hide 3D Control Mode Toggle Button
      const ctrlToggleBtn = document.getElementById('btn-control-toggle');
      if (ctrlToggleBtn) ctrlToggleBtn.classList.add('hidden');

      // Clear 3D Lifecycle Timers & Unfreeze
      clearConfirmationTimer();
      if (background30SecTimer) { clearTimeout(background30SecTimer); background30SecTimer = null; }

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

      // Stop Try On Session & Restore A-Frame Scene
      stopTryOnSession();
      const arSceneEl = document.getElementById('ar-scene');
      if (arSceneEl) arSceneEl.style.display = 'block';

      // Show 3D Control Mode Toggle Button
      const ctrlToggleBtn = document.getElementById('btn-control-toggle');
      if (ctrlToggleBtn) {
        ctrlToggleBtn.classList.remove('hidden');
        updateControlModeUI();
      }

      // Hide AR content
      if (arWrapper) {
        arWrapper.setAttribute('visible', 'false');
        if (arWrapper.object3D) arWrapper.object3D.visible = false;
      }

      if (has3DUnlocked) {
        // Already unlocked: directly show 3D world and start 30s background loop
        if (threedWrapper) {
          threedWrapper.setAttribute('visible', 'true');
          threedWrapper.setAttribute('position', '0 0 -0.45');
          threedWrapper.setAttribute('scale', '0.75 0.75 0.75');
          if (threedWrapper.object3D) {
            threedWrapper.object3D.visible = true;
            threedWrapper.object3D.position.set(0, 0, -0.45);
            threedWrapper.object3D.scale.set(0.75, 0.75, 0.75);
          }
        }
        updateStatusPill('threed-active', 'Card Found');
        start30SecondBackgroundLoop();

        if (gestureHint) {
          gestureHint.classList.remove('hidden');
          setTimeout(() => gestureHint.classList.add('hidden'), 4500);
        }
        updateReticleVisibility();
      } else {
        // Needs initial 3-second scan
        threedState = THREED_STATE.INITIAL_SCAN;
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

    } else if (selectedMode === 'TRYON') {
      currentMode = MODES.TRYON;
      if (modeLabel) modeLabel.textContent = 'Try On Mode';

      // Hide 3D Control Mode Toggle Button & AR Reticle
      const ctrlToggleBtn = document.getElementById('btn-control-toggle');
      if (ctrlToggleBtn) ctrlToggleBtn.classList.add('hidden');

      const reticle = document.getElementById('scanning-reticle');
      if (reticle) {
        reticle.classList.add('hidden');
        reticle.style.display = 'none';
      }

      // Clear 3D Lifecycle Timers & Unfreeze
      clearConfirmationTimer();
      if (background30SecTimer) { clearTimeout(background30SecTimer); background30SecTimer = null; }

      // Hide AR & 3D content wrappers
      if (arWrapper) {
        arWrapper.setAttribute('visible', 'false');
        if (arWrapper.object3D) arWrapper.object3D.visible = false;
      }
      if (threedWrapper) {
        threedWrapper.setAttribute('visible', 'false');
        if (threedWrapper.object3D) threedWrapper.object3D.visible = false;
      }

      // Hide A-Frame scene element
      const arSceneEl = document.getElementById('ar-scene');
      if (arSceneEl) arSceneEl.style.display = 'none';

      // Stop MindAR system if running
      if (arSceneEl && arSceneEl.systems && arSceneEl.systems['mindar-image-system'] && isARRunning) {
        try {
          arSceneEl.systems['mindar-image-system'].stop();
          isARRunning = false;
        } catch (e) {
          console.warn("Stopping MindAR for Try-On mode:", e);
        }
      }

      updateStatusPill('tracking', 'Virtual Ring Try-On');
      startTryOnSession();
    }
  };

  // ==========================================================================
  // 6. REAL ASSET LOADING & DIAMOND FILL CONTROLLER (NOT PER SECONDS)
  // ==========================================================================
  function setupLoadingScreen(onComplete) {
    const loadingScreen = document.getElementById('loading-screen');
    const diamondFill = document.getElementById('diamond-fill');

    if (!loadingScreen) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    const assetsToLoad = [
      { url: './assets/glb/Ring.glb', type: 'fetch' },
      { url: './assets/glb/Shivam.glb', type: 'fetch' },
      { url: './assets/AR/shivam_banner.png', type: 'image' },
      { url: './assets/AR/shivam_logo.png', type: 'image' },
      { url: './assets/AR/Booth.png', type: 'image' },
      { url: './assets/cards/targets.png', type: 'image' },
      { url: './assets/daimond.png', type: 'image' },
      { url: './assets/targets.mind', type: 'fetch' }
    ];

    const totalWeight = assetsToLoad.length + 1; // +1 for A-Frame WebGL Scene ready
    let loadedCount = 0;
    let targetProgress = 0;
    let currentDisplayProgress = 0;
    let isFinished = false;

    const updateUI = (pct) => {
      if (diamondFill) {
        diamondFill.style.setProperty('--loading-progress', `${pct.toFixed(1)}%`);
      }
    };

    const onItemLoaded = () => {
      loadedCount++;
      targetProgress = Math.min(100, (loadedCount / totalWeight) * 100);
    };

    // Smooth 60fps interpolation for natural visual diamond filling
    function stepProgress() {
      // Smoothly advance displayed percentage towards actual asset download progress
      currentDisplayProgress += (targetProgress - currentDisplayProgress) * 0.15;

      if (targetProgress >= 100 && (100 - currentDisplayProgress) < 0.5) {
        currentDisplayProgress = 100;
        updateUI(100);

        if (!isFinished) {
          isFinished = true;
          setTimeout(() => {
            loadingScreen.classList.add('fade-out');
            if (typeof onComplete === 'function') onComplete();
            setTimeout(() => {
              loadingScreen.style.display = 'none';
            }, 600);
          }, 300);
        }
        return;
      }

      updateUI(currentDisplayProgress);
      requestAnimationFrame(stepProgress);
    }

    requestAnimationFrame(stepProgress);

    // Track A-Frame Scene initialization
    const arScene = document.getElementById('ar-scene');
    if (arScene) {
      if (arScene.hasLoaded) {
        onItemLoaded();
      } else {
        arScene.addEventListener('loaded', onItemLoaded, { once: true });
      }
    } else {
      onItemLoaded();
    }

    // Preload & track all actual network assets
    assetsToLoad.forEach((asset) => {
      if (asset.type === 'image') {
        const img = new Image();
        img.onload = onItemLoaded;
        img.onerror = onItemLoaded;
        img.src = asset.url;
      } else {
        fetch(asset.url)
          .then(() => onItemLoaded())
          .catch(() => onItemLoaded());
      }
    });

    // Failsafe timeout in case of network stall so user is never blocked
    setTimeout(() => {
      if (!isFinished) {
        targetProgress = 100;
      }
    }, 15000);
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
              node.style.position = 'absolute';
              node.style.top = '0';
              node.style.left = '0';
              node.style.width = '100%';
              node.style.height = '100%';
              node.style.objectFit = 'cover';
              node.style.zIndex = '1';
              // Force play for Android Chrome
              if (node.play) {
                node.play().catch(() => {});
              }
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
            if (arWrapper.object3D) {
              arWrapper.object3D.visible = true;
              arWrapper.object3D.scale.set(1, 1, 1);
            }
            arWrapper.setAttribute('scale', '1 1 1');
            arWrapper.emit('targetFound');

            const models = arWrapper.querySelectorAll('[play-all-animations]');
            models.forEach((m) => {
              const comp = m.components['play-all-animations'];
              if (comp) comp.playAnimations();
            });
          }
        } else if (currentMode === MODES.THREED) {
          // --- 3D MODE: Background Card Recognition ---
          isCardInView = true;

          // When card is detected during initial scan or any 30s background cycle:
          // Start continuous 3-second confirmation
          start3SecondConfirmation(() => {
            handleCardConfirmed();
          });
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
          // --- 3D MODE: Card absence is completely fine ---
          isCardInView = false;
          clearConfirmationTimer();

          if (threedState === THREED_STATE.INITIAL_SCAN && !has3DUnlocked) {
            updateStatusPill('searching', 'Point camera at Card');
          } else {
            // Case 1 — Card Not in View: Foreground 3D environment stays 100% active and untouched!
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


