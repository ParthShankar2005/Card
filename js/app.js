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

  // Constants & State Management
  const MODES = {
    LOADING: 'LOADING',
    SELECT: 'SELECT',
    AR: 'AR',
    THREED: 'THREED',
    TRYON: 'TRYON'
  };

  let currentMode = MODES.LOADING;
  let has3DUnlocked = false;
  let isARStarting = false;
  let isARRunning = false;

  // 3D Mode Tracking Loop
  const THREED_STATE = {
    INITIAL_SCAN: 'INITIAL_SCAN',       // Initial: Point camera at Card (3s confirmation)
    ACTIVE_3D_LOOP: 'ACTIVE_3D_LOOP'    // 3D Mode: Foreground 3D exploration + continuous 30s background tracking loop
  };

  let threedState = THREED_STATE.INITIAL_SCAN;
  let isCardInView = false;
  let cardConfirmTimer = null;
  let background30SecTimer = null;

  // 3D Control Modes
  const CONTROL_MODES = {
    GYRO: 'GYRO',   // Pure Gyroscope & Compass 360° Look (Touch Drag Paused)
    TOUCH: 'TOUCH'  // Pure Touch Drag & Pinch Zoom (Gyro Sensor Paused)
  };
  let active3DControlMode = CONTROL_MODES.GYRO;

  // A-Frame Custom Components
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

  // Lifecycle & Background Controller
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
          if (!isARRunning) {
            arSystem.start();
            isARRunning = true;
          }
          hideCameraGuidance();
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
              if (!isARRunning) {
                sys.start();
                isARRunning = true;
              }
              hideCameraGuidance();
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

  // Reticle & HUD Updater
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

  // 3D Control Mode Controller
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

  // 4C. ADVANCED VIRTUAL RING TRY-ON ENGINE (MEDIAPIPE TASKS VISION & THREE.JS)
  const THREE = window.THREE || (typeof AFRAME !== "undefined" ? AFRAME.THREE : window.THREE);

  const CONFIG = {
    MODEL_URL: "./assets/glb/ringwithdaimond.glb",
    RING_SCALE: 2.0,
    PLACEMENT_FACTOR: 0.50,
    DEPTH_OFFSET: 0.0,
    LERP_SPEED: 0.40,
    ROTATION_SPEED: 0.30,
    MIN_DISTANCE_CM: 20,
    MAX_DISTANCE_CM: 40,
    MIN_DISTANCE_EXIT_CM: 19,
    MAX_DISTANCE_EXIT_CM: 41,
    FINGER_SCALES: { index: 1.0, middle: 1.0, ring: 1.0, pinky: 1.0 }
  };

  const FINGER_LANDMARKS = {
    index: { mcp: 5, pip: 6, dip: 7, tip: 8 },
    middle: { mcp: 9, pip: 10, dip: 11, tip: 12 },
    ring: { mcp: 13, pip: 14, dip: 15, tip: 16 },
    pinky: { mcp: 17, pip: 18, dip: 19, tip: 20 }
  };

  const REQUIRED_FINGERS = ["index", "middle", "ring", "pinky"];
  const FINGER_CHAINS = {
    thumb: [1, 2, 3, 4],
    index: [5, 6, 7, 8],
    middle: [9, 10, 11, 12],
    ring: [13, 14, 15, 16],
    pinky: [17, 18, 19, 20]
  };

  const HandView = { UNKNOWN: "UNKNOWN", PALM: "PALM", BACK: "BACK" };

  let selectedFinger = "ring";
  let activeHandSide = null;
  let currentHandView = HandView.UNKNOWN;
  let smoothedLandmarks = {};
  let smoothedDotProduct = 0.0;
  let handLandmarker = null;
  let isInitializingLandmarker = false;
  let lastVideoTime = -1;
  let tryOnAnimFrameId = null;
  let tryOnWebcamStream = null;

  let renderer, scene, camera;
  let ringModel = null;
  let ringModelLoaded = false;
  let handMeshes = [];

  const targetRingPos = new THREE.Vector3();
  const targetRingQuat = new THREE.Quaternion();
  const targetRingScale = new THREE.Vector3(1, 1, 1);
  const prevRingQuaternion = new THREE.Quaternion();
  let targetRingVisible = false;

  const ringClippingPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _v3 = new THREE.Vector3();
  const _q1 = new THREE.Quaternion();
  const _m1 = new THREE.Matrix4();

  const transferAnim = { active: false, fromFinger: null, toFinger: null, startTime: 0, duration: 520 };
  const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  let isFingerMenuOpen = false;
  let currentCameraFacing = 'environment';

  window.toggleFingerMenu = function (e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    isFingerMenuOpen = !isFingerMenuOpen;
    updateFingerMenuState();
  };

  window.closeFingerMenu = function () {
    isFingerMenuOpen = false;
    updateFingerMenuState();
  };

  function updateFingerMenuState() {
    const menu = document.getElementById("finger-popover-menu");
    const chevron = document.getElementById("finger-menu-chevron");
    if (menu) {
      menu.classList.toggle("hidden", !isFingerMenuOpen);
    }
    if (chevron) {
      chevron.style.transform = isFingerMenuOpen ? "rotate(180deg)" : "rotate(0deg)";
    }
  }

  window.onSelectFinger = function (fingerKey, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!FINGER_LANDMARKS[fingerKey]) {
      closeFingerMenu();
      return;
    }

    const prevFinger = selectedFinger;
    selectedFinger = fingerKey;

    document.querySelectorAll(".finger-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.finger === fingerKey);
    });

    if (prevFinger !== fingerKey) {
      transferAnim.fromFinger = prevFinger;
      transferAnim.toFinger = fingerKey;
      transferAnim.startTime = performance.now();
      transferAnim.active = true;
    }

    const label = document.getElementById("selected-finger-text");
    if (label) {
      label.textContent = `Finger: ${fingerKey.toUpperCase()}`;
    }

    closeFingerMenu();
  };

  window.handleToggleCameraFacing = function () {
    currentCameraFacing = (currentCameraFacing === 'environment') ? 'user' : 'environment';
    const btnText = document.getElementById('camera-facing-label');
    if (btnText) {
      btnText.textContent = (currentCameraFacing === 'user') ? 'Front' : 'Rear';
    }
    if (currentMode === MODES.TRYON) {
      startCamera();
    }
  };

  window.onSelectCameraQuality = function (deviceId) {
    if (deviceId && currentMode === MODES.TRYON) {
      startCamera(deviceId);
    }
  };

  function isCameraMirrored() {
    const video = document.getElementById("webcam");
    return video ? (video.style.transform || "").includes("scaleX(-1)") : true;
  }

  function isMobileDevice() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
  }

  function setupThree() {
    const canvas = document.getElementById("three-canvas");
    if (!canvas || renderer) return;

    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
    camera.position.set(0, 0, 1000);

    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance"
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.localClippingEnabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const ambLight = new THREE.AmbientLight(0xffffff, 1.5);
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 3.0);
    dirLight1.position.set(150, 300, 400);
    const dirLight2 = new THREE.DirectionalLight(0x82b2df, 2.2);
    dirLight2.position.set(-150, -100, 300);
    scene.add(ambLight, dirLight1, dirLight2);

    window.addEventListener("resize", onWindowResize);
    onWindowResize();
  }

  function onWindowResize() {
    if (!renderer || !camera) return;
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.left = -w / 2;
    camera.right = w / 2;
    camera.top = h / 2;
    camera.bottom = -h / 2;
    camera.updateProjectionMatrix();
  }

  function loadRingModel() {
    if (ringModelLoaded && ringModel) return;

    const canvas = document.getElementById("three-canvas");
    const THREE_INST = window.THREE || (typeof AFRAME !== "undefined" ? AFRAME.THREE : null);
    if (!canvas || !THREE_INST) return;

    const GLTFLoaderClass = THREE_INST.GLTFLoader || (typeof THREE !== "undefined" ? THREE.GLTFLoader : null);
    if (!GLTFLoaderClass) return;

    const loader = new GLTFLoaderClass();
    const modelPath = (canvas && canvas.dataset.model) || CONFIG.MODEL_URL;

    loader.load(
      modelPath,
      (gltf) => {
        ringModel = gltf.scene;
        ringModel.traverse((child) => {
          if (child.isMesh && child.material) {
            child.renderOrder = 2;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(mat => {
              mat.clippingPlanes = [ringClippingPlane];
              mat.clipShadows = true;
              mat.needsUpdate = true;
            });
          }
        });
        ringModel.visible = false;
        scene.add(ringModel);
        ringModelLoaded = true;
        console.log("[Three.js] Virtual Try-On Ring Model Loaded successfully.");
      },
      undefined,
      (err) => console.error("Error loading ring model:", err)
    );
  }

  function createHandMesh() {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      side: THREE.DoubleSide,
      depthTest: true
    });
    const surface = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    surface.renderOrder = 0;
    group.add(surface);
    return { group, surface };
  }

  function updateHandMesh(hand, landmarks) {
    const points = landmarks.map(landmarkToScreen);
    const handScale = (Math.hypot(points[5].x - points[17].x, points[5].y - points[17].y) + Math.hypot(points[0].x - points[9].x, points[0].y - points[9].y)) * 0.5;
    const positions = [], indices = [];
    const addV = p => { const id = positions.length / 3; positions.push(p.x, p.y, p.z); return id; };
    const addQ = (v0, v1, v2, v3) => indices.push(v0, v1, v2, v0, v2, v3);

    const wrist = points[0], iMcp = points[5], pMcp = points[17];
    const contours = [
      [wrist, { x: (wrist.x + iMcp.x) * 0.5, y: (wrist.y + iMcp.y) * 0.5, z: (wrist.z + iMcp.z) * 0.5 }, iMcp],
      [wrist, { x: (wrist.x + points[9].x) * 0.5, y: (wrist.y + points[9].y) * 0.5, z: (wrist.z + points[9].z) * 0.5 }, points[9]],
      [wrist, { x: (wrist.x + points[13].x) * 0.5, y: (wrist.y + points[13].y) * 0.5, z: (wrist.z + points[13].z) * 0.5 }, points[13]],
      [wrist, { x: (wrist.x + pMcp.x) * 0.5, y: (wrist.y + pMcp.y) * 0.5, z: (wrist.z + pMcp.z) * 0.5 }, pMcp]
    ];

    const grid = [];
    for (let r = 0; r < 4; r++) {
      const row = [], t = r / 3, omt = 1 - t;
      for (let c = 0; c < contours.length; c++) {
        const [p0, p1, p2] = contours[c];
        row.push(addV({
          x: omt * omt * p0.x + 2 * omt * t * p1.x + t * t * p2.x,
          y: omt * omt * p0.y + 2 * omt * t * p1.y + t * t * p2.y,
          z: omt * omt * p0.z + 2 * omt * t * p1.z + t * t * p2.z
        }));
      }
      grid.push(row);
    }

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < contours.length - 1; c++) {
        addQ(grid[r][c], grid[r + 1][c], grid[r + 1][c + 1], grid[r][c + 1]);
      }
    }

    for (const chain of Object.values(FINGER_CHAINS)) {
      const fingerRings = [];
      for (let i = 0; i < chain.length; i++) {
        const pt = points[chain[i]];
        const nextPt = points[chain[Math.min(chain.length - 1, i + 1)]];
        const prevPt = points[chain[Math.max(0, i - 1)]];
        const dx = nextPt.x - prevPt.x, dy = nextPt.y - prevPt.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        const radius = Math.max(3.5, handScale * ((i === 0) ? 0.055 : (i === 3 ? 0.038 : 0.048)));

        const ring = [];
        for (let s = 0; s < 8; s++) {
          const ang = (s / 8) * Math.PI * 2;
          ring.push(addV({
            x: pt.x + (nx * Math.cos(ang)) * radius,
            y: pt.y + (ny * Math.cos(ang)) * radius,
            z: pt.z + Math.sin(ang) * radius * 0.95
          }));
        }
        fingerRings.push(ring);
      }

      for (let r = 0; r < fingerRings.length - 1; r++) {
        const a = fingerRings[r], b = fingerRings[r + 1];
        for (let s = 0; s < 8; s++) {
          addQ(a[s], b[s], b[(s + 1) % 8], a[(s + 1) % 8]);
        }
      }
    }

    const geom = hand.surface.geometry;
    geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    geom.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    geom.computeVertexNormals();
  }

  function landmarkToScreen(lm) {
    const video = document.getElementById("webcam");
    const vpW = window.innerWidth, vpH = window.innerHeight;
    const srcW = (video && video.videoWidth) || vpW, srcH = (video && video.videoHeight) || vpH;
    const scale = Math.max(vpW / srcW, vpH / srcH);
    const offX = (vpW - srcW * scale) * 0.5, offY = (vpH - srcH * scale) * 0.5;
    return {
      x: (lm.x * srcW * scale + offX) - vpW / 2,
      y: vpH / 2 - (lm.y * srcH * scale + offY),
      z: THREE.MathUtils.clamp(-lm.z * 180, -60, 60)
    };
  }

  function smoothLandmarks(handIdx, raw) {
    if (!smoothedLandmarks[handIdx]) {
      smoothedLandmarks[handIdx] = raw.map(lm => ({ ...lm }));
      return raw;
    }
    const prev = smoothedLandmarks[handIdx];
    const smoothed = [];
    for (let i = 0; i < raw.length; i++) {
      const d = Math.hypot(raw[i].x - prev[i].x, raw[i].y - prev[i].y, raw[i].z - prev[i].z);
      const alpha = d < 0.002 ? 0.08 : (d > 0.008 ? 0.80 : 0.45);
      smoothed.push({
        x: prev[i].x + (raw[i].x - prev[i].x) * alpha,
        y: prev[i].y + (raw[i].y - prev[i].y) * alpha,
        z: prev[i].z + (raw[i].z - prev[i].z) * alpha
      });
    }
    smoothedLandmarks[handIdx] = smoothed;
    return smoothed;
  }

  function classifyHandView(landmarks, worldLandmarks, handSide) {
    let v1, v2;
    if (worldLandmarks && worldLandmarks.length >= 21) {
      const w = worldLandmarks[0], iMcp = worldLandmarks[5], pMcp = worldLandmarks[17];
      v1 = _v1.set(iMcp.x - w.x, iMcp.y - w.y, iMcp.z - w.z);
      v2 = _v2.set(pMcp.x - w.x, pMcp.y - w.y, pMcp.z - w.z);
    } else {
      const w = landmarks[0], iMcp = landmarks[5], pMcp = landmarks[17];
      v1 = _v1.set(iMcp.x - w.x, -(iMcp.y - w.y), -(iMcp.z - w.z));
      v2 = _v2.set(pMcp.x - w.x, -(pMcp.y - w.y), -(pMcp.z - w.z));
    }

    const norm = _v3;
    if (handSide === "RIGHT") norm.crossVectors(v2, v1).normalize();
    else norm.crossVectors(v1, v2).normalize();

    smoothedDotProduct += (norm.z - smoothedDotProduct) * 0.20;
    if (smoothedDotProduct > 0.25) currentHandView = HandView.PALM;
    else if (smoothedDotProduct < -0.25) currentHandView = HandView.BACK;
    else currentHandView = HandView.UNKNOWN;

    const badge = document.getElementById("hand-view-badge");
    if (badge) {
      if (currentHandView === HandView.PALM) {
        badge.textContent = "PALM VIEW";
        badge.className = "hand-view-badge palm";
      } else if (currentHandView === HandView.BACK) {
        badge.textContent = "BACK VIEW";
        badge.className = "hand-view-badge back";
      } else {
        badge.textContent = "HAND TRACKED";
        badge.className = "hand-view-badge";
      }
    }

    return currentHandView;
  }

  function getSegment2DClosestPoint(px, py, p0, p1) {
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return { dist: Math.hypot(px - p0.x, py - p0.y), z: p0.z };
    let t = Math.max(0, Math.min(1, ((px - p0.x) * dx + (py - p0.y) * dy) / l2));
    return {
      dist: Math.hypot(px - (p0.x + t * dx), py - (p0.y + t * dy)),
      z: p0.z + t * (p1.z - p0.z)
    };
  }

  function evaluateRingOcclusion(landmarks, targetFingerKey = selectedFinger) {
    const points = landmarks.map(landmarkToScreen);
    const targetMap = FINGER_LANDMARKS[targetFingerKey] || FINGER_LANDMARKS.ring;
    const mcp = points[targetMap.mcp], pip = points[targetMap.pip];

    const pCenter = {
      x: mcp.x + (pip.x - mcp.x) * CONFIG.PLACEMENT_FACTOR,
      y: mcp.y + (pip.y - mcp.y) * CONFIG.PLACEMENT_FACTOR,
      z: mcp.z + (pip.z - mcp.z) * CONFIG.PLACEMENT_FACTOR
    };

    const phalanxLen = Math.hypot(pip.x - mcp.x, pip.y - mcp.y, pip.z - mcp.z);
    const ringRadiusThresh = Math.max(12, phalanxLen * 0.32);
    const checkChains = Object.keys(FINGER_CHAINS).filter(k => k !== targetFingerKey);

    for (const key of checkChains) {
      const chain = FINGER_CHAINS[key];
      for (let s = 0; s < chain.length - 1; s++) {
        const p0 = points[chain[s]], p1 = points[chain[s + 1]];
        if (!p0 || !p1) continue;
        const closest = getSegment2DClosestPoint(pCenter.x, pCenter.y, p0, p1);
        if (closest.dist < ringRadiusThresh && closest.z > pCenter.z + 3.5) {
          return true;
        }
      }
    }
    return false;
  }

  function detectFistPose(rawLandmarks) {
    if (!rawLandmarks || rawLandmarks.length < 21) return false;
    const wrist = rawLandmarks[0];
    let flexed = 0;
    for (const fKey of REQUIRED_FINGERS) {
      const chain = FINGER_CHAINS[fKey];
      const mcp = rawLandmarks[chain[0]], tip = rawLandmarks[chain[3]];
      if (mcp && tip && (Math.hypot(tip.x - wrist.x, tip.y - wrist.y) < Math.hypot(mcp.x - wrist.x, mcp.y - wrist.y) * 1.05)) {
        flexed++;
      }
    }
    return flexed >= 3;
  }

  function isSelectedFingerOpen(landmarks, rawLandmarks, fingerKey) {
    const map = FINGER_LANDMARKS[fingerKey] || FINGER_LANDMARKS.ring;
    const mcpLm = rawLandmarks[map.mcp], pipLm = rawLandmarks[map.pip], tipLm = rawLandmarks[map.tip];
    if (!mcpLm || !pipLm || !tipLm) return false;

    const pts = landmarks.map(landmarkToScreen);
    const mcp = pts[map.mcp], pip = pts[map.pip], tip = pts[map.tip], wrist = pts[0];
    const mcpDist = Math.hypot(mcp.x - wrist.x, mcp.y - wrist.y);
    const tipDist = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
    const isExtended = tipDist > mcpDist * 1.15;

    const vProx = _v1.set(pip.x - mcp.x, pip.y - mcp.y, pip.z - mcp.z).normalize();
    const vDist = _v2.set(tip.x - pip.x, tip.y - pip.y, tip.z - pip.z).normalize();
    return isExtended && (vProx.dot(vDist) > -0.2);
  }

  function calculateFingerFrame(landmarks, fingerKey, handSide) {
    const points = landmarks.map(landmarkToScreen);
    const map = FINGER_LANDMARKS[fingerKey] || FINGER_LANDMARKS.ring;
    const mcp = points[map.mcp], pip = points[map.pip], tip = points[map.tip];
    const indexMcp = points[5], pinkyMcp = points[17];

    const posX = mcp.x + (pip.x - mcp.x) * CONFIG.PLACEMENT_FACTOR;
    const posY = mcp.y + (pip.y - mcp.y) * CONFIG.PLACEMENT_FACTOR;
    const posZ = mcp.z + (pip.z - mcp.z) * CONFIG.PLACEMENT_FACTOR + CONFIG.DEPTH_OFFSET;

    const dip = points[map.dip];
    const dX = tip.x - dip.x, dY = tip.y - dip.y, dZ = tip.z - dip.z;
    const dLen = Math.hypot(dX, dY, dZ) || 20;
    const clearance = Math.max(42, dLen * 1.95);
    const tipX = tip.x + (dX / dLen) * clearance;
    const tipY = tip.y + (dY / dLen) * clearance;
    const tipZ = tip.z + (dZ / dLen) * clearance + 12;

    const fingerVec = _v1.set(pip.x - mcp.x, pip.y - mcp.y, pip.z - mcp.z).normalize();
    const knuckleSpan = _v2.set(pinkyMcp.x - indexMcp.x, pinkyMcp.y - indexMcp.y, pinkyMcp.z - indexMcp.z).normalize();

    const dorsalNorm = _v3;
    if (handSide === "RIGHT") dorsalNorm.crossVectors(fingerVec, knuckleSpan).normalize();
    else dorsalNorm.crossVectors(knuckleSpan, fingerVec).normalize();

    const sideVec = new THREE.Vector3().crossVectors(fingerVec, dorsalNorm).normalize();
    dorsalNorm.crossVectors(sideVec, fingerVec).normalize();

    const quat = new THREE.Quaternion();
    if (currentHandView === HandView.UNKNOWN && prevRingQuaternion.lengthSq() > 0) {
      quat.copy(prevRingQuaternion);
    } else {
      _m1.makeBasis(sideVec, fingerVec, dorsalNorm);
      quat.setFromRotationMatrix(_m1);
      _q1.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      quat.multiply(_q1);

      if (!isCameraMirrored()) {
        _q1.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
        quat.multiply(_q1);
      }
      if (prevRingQuaternion.dot(quat) < 0) quat.set(-quat.x, -quat.y, -quat.z, -quat.w);
    }

    const handScale = (Math.hypot(points[5].x - points[17].x, points[5].y - points[17].y) + Math.hypot(points[0].x - points[9].x, points[0].y - points[9].y)) * 0.5;
    const fingerRadius = THREE.MathUtils.clamp(handScale * 0.052, 4.5, 14.0);
    const fingerMult = CONFIG.FINGER_SCALES[fingerKey] || 1.0;
    const targetScaleVal = fingerRadius * 1.05 * CONFIG.RING_SCALE * fingerMult;

    return {
      position: new THREE.Vector3(posX, posY, posZ),
      tipPosition: new THREE.Vector3(tipX, tipY, tipZ),
      quaternion: quat,
      scale: new THREE.Vector3(targetScaleVal, targetScaleVal, targetScaleVal),
      phalanxLength: Math.hypot(pip.x - mcp.x, pip.y - mcp.y, pip.z - mcp.z)
    };
  }

  let smoothedHandDistanceCm = 28.0;
  let isDistanceStateValid = true;

  function calculateHandDistanceCm(landmarks) {
    const points = landmarks.map(landmarkToScreen);
    const palmHeightPx = Math.hypot(points[9].x - points[0].x, points[9].y - points[0].y);
    const palmWidthPx = Math.hypot(points[17].x - points[5].x, points[17].y - points[5].y);
    const handPx = (palmHeightPx + palmWidthPx) * 0.5 || 100;

    const rawDist = THREE.MathUtils.clamp(4800 / handPx, 10, 80);
    smoothedHandDistanceCm = smoothedHandDistanceCm * 0.85 + rawDist * 0.15;

    if (isDistanceStateValid) {
      if (smoothedHandDistanceCm < CONFIG.MIN_DISTANCE_EXIT_CM || smoothedHandDistanceCm > CONFIG.MAX_DISTANCE_EXIT_CM) {
        isDistanceStateValid = false;
      }
    } else {
      if (smoothedHandDistanceCm >= CONFIG.MIN_DISTANCE_CM && smoothedHandDistanceCm <= CONFIG.MAX_DISTANCE_CM) {
        isDistanceStateValid = true;
      }
    }

    return {
      distanceCm: parseFloat(smoothedHandDistanceCm.toFixed(1)),
      isValid: isDistanceStateValid,
      isTooClose: smoothedHandDistanceCm < (isDistanceStateValid ? CONFIG.MIN_DISTANCE_EXIT_CM : CONFIG.MIN_DISTANCE_CM),
      isTooFar: smoothedHandDistanceCm > (isDistanceStateValid ? CONFIG.MAX_DISTANCE_EXIT_CM : CONFIG.MAX_DISTANCE_CM)
    };
  }

  function processTrackingResult(result) {
    const handGuideOverlay = document.getElementById("hand-guide-overlay");
    const handGuideText = document.getElementById("hand-guide-text");
    const handGuideSubtext = document.getElementById("hand-guide-subtext");

    if (!handMeshes.length) {
      const mesh = createHandMesh();
      scene.add(mesh.group);
      handMeshes.push(mesh);
    }

    const tryonStatusText = document.getElementById("tryon-status-text");

    const detectedHands = result?.landmarks || [];
    if (!detectedHands.length) {
      targetRingVisible = false;
      if (handMeshes[0]) handMeshes[0].group.visible = false;
      if (handGuideOverlay) handGuideOverlay.classList.add("active");
      if (handGuideText) handGuideText.textContent = "PLACE YOUR HAND IN FRAME";
      if (handGuideSubtext) handGuideSubtext.textContent = "Keep fingers visible to try on the ring";
      if (tryonStatusText) tryonStatusText.textContent = "Searching Hand";
      return;
    }

    if (tryonStatusText) tryonStatusText.textContent = "Hand Tracked";

    const rawLandmarks = detectedHands[0];
    const worldLandmarks = result?.worldLandmarks?.[0] || null;
    const info = result?.handednesses?.[0]?.[0];
    let side = info ? info.categoryName.toUpperCase() : "RIGHT";
    if (isCameraMirrored()) side = (side === "LEFT" ? "RIGHT" : "LEFT");
    activeHandSide = side;

    const landmarks = smoothLandmarks(0, rawLandmarks);
    classifyHandView(landmarks, worldLandmarks, side);

    const distInfo = calculateHandDistanceCm(landmarks);
    if (!distInfo.isValid) {
      targetRingVisible = false;
      if (handGuideOverlay) handGuideOverlay.classList.add("active");
      if (distInfo.isTooClose) {
        if (handGuideText) handGuideText.textContent = "HAND TOO CLOSE";
        if (handGuideSubtext) handGuideSubtext.textContent = "Move your hand farther from the camera (20–40 cm)";
      } else {
        if (handGuideText) handGuideText.textContent = "HAND TOO FAR";
        if (handGuideSubtext) handGuideSubtext.textContent = "Move your hand closer to the camera (20–40 cm)";
      }
      if (handMeshes[0]) {
        handMeshes[0].group.visible = true;
        updateHandMesh(handMeshes[0], landmarks);
      }
      return;
    }

    const isFist = detectFistPose(rawLandmarks);
    const selectedOpen = isSelectedFingerOpen(landmarks, rawLandmarks, selectedFinger);
    const isOccluded = evaluateRingOcclusion(landmarks, selectedFinger);

    if (isOccluded) {
      targetRingVisible = false;
      if (handMeshes[0]) {
        handMeshes[0].group.visible = true;
        updateHandMesh(handMeshes[0], landmarks);
      }
      return;
    }

    if (isFist) {
      if (!selectedOpen) {
        targetRingVisible = false;
        if (handMeshes[0]) {
          handMeshes[0].group.visible = true;
          updateHandMesh(handMeshes[0], landmarks);
        }
        return;
      }
    } else {
      let validCount = 0;
      for (const fKey of REQUIRED_FINGERS) {
        let fValid = true;
        for (const idx of FINGER_CHAINS[fKey]) {
          const lm = rawLandmarks[idx];
          if (!lm || lm.x < 0.0 || lm.x > 1.0 || lm.y < 0.0 || lm.y > 1.0) { fValid = false; break; }
        }
        if (fValid) validCount++;
      }

      if (validCount < 4) {
        targetRingVisible = false;
        if (handMeshes[0]) handMeshes[0].group.visible = false;
        if (handGuideOverlay) handGuideOverlay.classList.add("active");
        if (handGuideText) handGuideText.textContent = "KEEP ALL FOUR FINGERS VISIBLE";
        if (handGuideSubtext) handGuideSubtext.textContent = "Keep fingers visible to try on the ring";
        return;
      }
    }

    if (handGuideOverlay) handGuideOverlay.classList.remove("active");
    if (handMeshes[0]) {
      handMeshes[0].group.visible = true;
      updateHandMesh(handMeshes[0], landmarks);
    }

    const now = performance.now();
    if (transferAnim.active) {
      const elapsed = now - transferAnim.startTime;
      const p = THREE.MathUtils.clamp(elapsed / transferAnim.duration, 0, 1);
      const src = calculateFingerFrame(landmarks, transferAnim.fromFinger, side);
      const dst = calculateFingerFrame(landmarks, transferAnim.toFinger, side);

      if (p < 0.32) {
        const e = easeOutCubic(p / 0.32);
        targetRingPos.lerpVectors(src.position, src.tipPosition, e);
        targetRingQuat.copy(src.quaternion);
        targetRingScale.copy(src.scale);
      } else if (p < 0.68) {
        const tB = (p - 0.32) / 0.36;
        const e = easeInOutCubic(tB);
        targetRingPos.lerpVectors(src.tipPosition, dst.tipPosition, e);
        targetRingPos.z += Math.sin(tB * Math.PI) * (dst.phalanxLength * 0.75);
        targetRingQuat.slerpQuaternions(src.quaternion, dst.quaternion, e);
        targetRingScale.lerpVectors(src.scale, dst.scale, e);
      } else {
        const e = easeOutCubic((p - 0.68) / 0.32);
        targetRingPos.lerpVectors(dst.tipPosition, dst.position, e);
        targetRingQuat.copy(dst.quaternion);
        targetRingScale.copy(dst.scale);
      }
      targetRingVisible = true;
      if (p >= 1.0) transferAnim.active = false;
    } else {
      const frame = calculateFingerFrame(landmarks, selectedFinger, side);
      targetRingPos.copy(frame.position);
      targetRingQuat.copy(frame.quaternion);
      targetRingScale.copy(frame.scale);
      targetRingVisible = true;
    }
  }

  function renderLoop(timestamp) {
    if (currentMode !== MODES.TRYON) return;
    tryOnAnimFrameId = requestAnimationFrame(renderLoop);

    if (ringModel && ringModelLoaded) {
      if (targetRingVisible) {
        ringModel.position.lerp(targetRingPos, CONFIG.LERP_SPEED);
        ringModel.quaternion.slerp(targetRingQuat, CONFIG.ROTATION_SPEED);
        ringModel.scale.lerp(targetRingScale, CONFIG.LERP_SPEED);
        ringModel.visible = true;
        ringClippingPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), ringModel.position);
        prevRingQuaternion.copy(ringModel.quaternion);
      } else {
        ringModel.visible = false;
      }
    }

    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }

    const video = document.getElementById("webcam");
    if (handLandmarker && video && video.readyState >= 2 && video.videoWidth > 0 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      try {
        const result = handLandmarker.detectForVideo(video, timestamp);
        processTrackingResult(result);
      } catch (e) {
        console.warn("Detection error:", e);
      }
    }
  }

  async function populateCameraSources(activeDeviceId = null) {
    const select = document.getElementById("camera-quality-select");
    if (!select || !navigator.mediaDevices?.enumerateDevices) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = devices.filter(d => d.kind === "videoinput");
      select.innerHTML = "";

      const autoOpt = document.createElement("option");
      autoOpt.value = "auto";
      autoOpt.text = "★ AUTO CAMERA";
      if (!activeDeviceId || activeDeviceId === "auto") autoOpt.selected = true;
      select.appendChild(autoOpt);

      videoDevs.forEach((dev, idx) => {
        const opt = document.createElement("option");
        opt.value = dev.deviceId;
        opt.text = dev.label || `Camera ${idx + 1}`;
        if (activeDeviceId && dev.deviceId === activeDeviceId) opt.selected = true;
        select.appendChild(opt);
      });
    } catch (e) {
      console.warn("Camera enum error:", e);
    }
  }

  async function startCamera(targetDeviceId = null) {
    const video = document.getElementById("webcam");
    const canvas = document.getElementById("three-canvas");
    if (!video || !canvas || !navigator.mediaDevices?.getUserMedia) return;

    if (tryOnWebcamStream) {
      tryOnWebcamStream.getTracks().forEach(t => t.stop());
      tryOnWebcamStream = null;
    }

    const qualityConstraints = [
      { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
      { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } },
      { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
    ];

    let stream = null;
    for (const q of qualityConstraints) {
      const constraints = { ...q };
      if (targetDeviceId && targetDeviceId !== "auto") {
        constraints.deviceId = { exact: targetDeviceId };
      } else {
        constraints.facingMode = { ideal: currentCameraFacing };
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: constraints });
        if (stream) break;
      } catch (e) {
        console.warn("Camera retry...", e);
      }
    }

    if (!stream) stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });

    tryOnWebcamStream = stream;
    const track = stream.getVideoTracks()[0];
    const settings = track?.getSettings ? track.getSettings() : {};
    await populateCameraSources(settings.deviceId || targetDeviceId);

    const isFront = (settings.facingMode === "user" || (!settings.facingMode && !isMobileDevice()));
    const mirrorStyle = isFront ? "scaleX(-1)" : "none";
    video.style.transform = mirrorStyle;
    canvas.style.transform = mirrorStyle;

    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    onWindowResize();
  }

  async function initHandLandmarker() {
    if (handLandmarker || isInitializingLandmarker) return;
    isInitializingLandmarker = true;

    try {
      let attempts = 0;
      while (!window.MediaPipeVision && attempts < 50) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }

      if (window.MediaPipeVision) {
        const { FilesetResolver, HandLandmarker } = window.MediaPipeVision;
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.30,
          minHandPresenceConfidence: 0.30,
          minTrackingConfidence: 0.30
        });
        console.log("[MediaPipe Vision] HandLandmarker initialized with occlusion & distance tracking.");
      }
    } catch (err) {
      console.error("Initialization error:", err);
    } finally {
      isInitializingLandmarker = false;
    }
  }

  window.addEventListener("mediapipe-ready", () => {
    initHandLandmarker();
  });

  async function startTryOnSession() {
    const viewport = document.getElementById("viewport");
    if (viewport) {
      viewport.classList.remove("hidden");
      viewport.style.display = "block";
    }

    try {
      setupThree();
      loadRingModel();
      await startCamera();
      await initHandLandmarker();

      if (tryOnAnimFrameId) cancelAnimationFrame(tryOnAnimFrameId);
      tryOnAnimFrameId = requestAnimationFrame(renderLoop);
    } catch (err) {
      console.error("Failed to start Try-On session:", err);
      handleCameraError(err);
    }
  }

  function stopTryOnSession() {
    const viewport = document.getElementById("viewport");
    if (viewport) {
      viewport.classList.add("hidden");
      viewport.style.display = "none";
    }

    if (tryOnAnimFrameId) {
      cancelAnimationFrame(tryOnAnimFrameId);
      tryOnAnimFrameId = null;
    }

    if (tryOnWebcamStream) {
      tryOnWebcamStream.getTracks().forEach(t => t.stop());
      tryOnWebcamStream = null;
    }

    targetRingVisible = false;
    if (ringModel) ringModel.visible = false;
    if (handMeshes[0]) handMeshes[0].group.visible = false;
  }




  // Mode Switcher & Selection Controller
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
        updateStatusPill('searching', 'Scan SJ 3D Card');
        updateReticleVisibility();
      }

      startARSession();

    } else if (selectedMode === 'TRYON') {
      currentMode = MODES.TRYON;
      if (modeLabel) modeLabel.textContent = 'Try On Mode';

      // Hide 3D Control Mode Toggle Button & AR Reticle
      const ctrlToggleBtn = document.getElementById('btn-control-toggle');
      if (ctrlToggleBtn) ctrlToggleBtn.classList.add('hidden');

      const reticle = document.getElementById('scanning-reticle');
      if (reticle) reticle.classList.add('hidden');

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
      if (arSceneEl && arSceneEl.systems && arSceneEl.systems['mindar-image-system']) {
        try {
          arSceneEl.systems['mindar-image-system'].stop();
          isARRunning = false;
        } catch (e) {
          console.warn("Stopping MindAR for Try-On mode:", e);
        }
      }

      // Stop any existing non-tryon video streams to free camera hardware
      document.querySelectorAll('video').forEach(v => {
        if (v.id !== 'webcam' && v.srcObject && v.srcObject.getTracks) {
          v.srcObject.getTracks().forEach(t => t.stop());
          v.srcObject = null;
        }
      });

      updateStatusPill('tracking', 'Virtual Ring Try-On');
      startTryOnSession();
    }
  };

  // 6. REAL ASSET LOADING & DIAMOND FILL CONTROLLER
  function setupLoadingScreen(onComplete) {
    const loadingScreen = document.getElementById('loading-screen');
    const diamondFill = document.getElementById('diamond-fill');

    if (!loadingScreen) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    // Critical UI assets required for initial startup
    const criticalAssets = [
      { url: './assets/daimond.png', type: 'image' },
      { url: './assets/AR/shivam_logo.png', type: 'image' }
    ];

    // Non-critical heavy assets loaded asynchronously in background
    const backgroundAssets = [
      { url: './assets/glb/ringwithdaimond.glb', type: 'fetch' },
      { url: './assets/glb/Shivam.glb', type: 'fetch' },
      { url: './assets/AR/shivam_banner.png', type: 'image' },
      { url: './assets/AR/Booth.png', type: 'image' },
      { url: './assets/cards/targets.png', type: 'image' },
      { url: './assets/targets.mind', type: 'fetch' }
    ];

    const totalWeight = criticalAssets.length + 1; // +1 for scene
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

    function stepProgress() {
      currentDisplayProgress += (targetProgress - currentDisplayProgress) * 0.25;

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
            }, 400);
          }, 150);
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

    // Preload critical assets synchronously to unblock UI immediately
    criticalAssets.forEach((asset) => {
      const img = new Image();
      img.onload = onItemLoaded;
      img.onerror = onItemLoaded;
      img.src = asset.url;
    });

    // Background fetch non-critical assets asynchronously without blocking UI startup
    setTimeout(() => {
      backgroundAssets.forEach((asset) => {
        if (asset.type === 'image') {
          const img = new Image();
          img.src = asset.url;
        } else {
          fetch(asset.url).catch(() => { });
        }
      });
    }, 100);

    // Ultra-fast failsafe timeout (800ms) so user never waits unnecessarily
    setTimeout(() => {
      if (!isFinished) {
        targetProgress = 100;
      }
    }, 800);
  }

  // Application Initialization
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
                node.play().catch(() => { });
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

    // Target Recognition Events
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


