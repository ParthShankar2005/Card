/**
 * WebAR Image Target Recognition & 3D Model Controller
 * Client: Shivam Jewels (card.shivamai.studio)
 * 
 * Target Image: assets/targets.png (1254x1254 compiled to assets/targets.mind)
 * Features:
 * - Direct image target recognition via MindAR
 * - Instant camera launch with iOS Safari playsinline & zero-white-screen fix
 * - Robust camera permission handling with user-friendly error recovery
 * - AudioContext auto-unlock on user gesture
 * - 3D model entrance animation & diamond material enhancements
 */
(function () {
  'use strict';

  // Synthesized Web Audio API Synthesizer for feedback chimes
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

  // Display helpful error message if camera permission fails
  function showCameraError(msg) {
    const modalOverlay = document.getElementById('permission-modal');
    const modalIcon = document.getElementById('modal-icon');
    const modalTitle = document.getElementById('modal-title');
    const errorBox = document.getElementById('camera-error');
    const btnStart = document.getElementById('btn-start-ar');
    const btnIcon = document.getElementById('btn-icon');
    const btnText = document.getElementById('btn-text');
    const reticle = document.getElementById('scanning-reticle');

    if (reticle) reticle.classList.add('hidden');

    if (modalOverlay) {
      modalOverlay.style.display = 'flex';
      modalOverlay.classList.remove('hidden');
    }
    if (modalIcon) modalIcon.className = 'modal-icon error';
    if (modalTitle) modalTitle.textContent = 'Camera Access Required';
    if (errorBox) {
      errorBox.innerHTML = `<strong><i class="fas fa-exclamation-triangle"></i> Notice:</strong><br>${msg}`;
      errorBox.classList.add('show');
    }
    if (btnStart) {
      btnStart.disabled = false;
      if (btnIcon) btnIcon.className = 'fas fa-redo';
      if (btnText) btnText.textContent = 'Retry Camera Access';
    }
  }

  // Camera Permission & Launch WebAR Button Click Handler
  window.handleStartARClick = async function (e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    unlockAudioContext();
    playChime('tap');

    const btnStart = document.getElementById('btn-start-ar');
    const btnIcon = document.getElementById('btn-icon');
    const btnText = document.getElementById('btn-text');
    const modalOverlay = document.getElementById('permission-modal');
    const reticle = document.getElementById('scanning-reticle');
    const errorBox = document.getElementById('camera-error');
    const arScene = document.getElementById('ar-scene');

    if (btnStart) btnStart.disabled = true;
    if (btnIcon) btnIcon.className = 'fas fa-spinner fa-spin';
    if (btnText) btnText.textContent = 'Starting Camera...';
    if (errorBox) errorBox.classList.remove('show');

    // Verify browser supports mediaDevices
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showCameraError(
        'Your browser does not support camera access or the connection is not secure (HTTPS is required). Please open this site over HTTPS.'
      );
      return;
    }

    try {
      // Test camera permission directly
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'environment' }
      });
      // Stop the test stream immediately so MindAR can claim the device
      stream.getTracks().forEach(t => t.stop());

      // Hide modal & show scanning reticle
      if (modalOverlay) {
        modalOverlay.style.display = 'none';
        modalOverlay.classList.add('hidden');
      }
      if (reticle) {
        reticle.classList.remove('hidden');
        reticle.style.display = 'flex';
      }

      // Start MindAR
      if (arScene) {
        const arSystem = arScene.systems && arScene.systems['mindar-image-system'];
        if (arSystem) {
          arSystem.start();
        } else {
          arScene.addEventListener('renderstart', () => {
            const sys = arScene.systems && arScene.systems['mindar-image-system'];
            if (sys) sys.start();
          }, { once: true });
        }
      }
    } catch (err) {
      console.error("Camera access error:", err);
      let message = 'Camera access could not be established.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        message = 'Camera permission was denied. Please allow camera access in your browser site settings and tap Retry.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        message = 'No camera device found on this device.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        message = 'Camera is in use by another app or browser tab. Please close other camera apps and retry.';
      }
      showCameraError(message);
    }
  };

  function initApp() {
    const targetEntity = document.getElementById('ar-target');
    const statusPill = document.getElementById('status-pill');
    const statusText = document.getElementById('status-text');
    const reticle = document.getElementById('scanning-reticle');
    const arWrapper = document.getElementById('ar-content-wrapper');
    const arScene = document.getElementById('ar-scene');

    // Eliminate white/black screen: Set WebGL canvas clear color to 100% transparent
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

      // Catch MindAR internal errors
      arScene.addEventListener('arError', (event) => {
        console.error("MindAR arError:", event.detail);
        showCameraError("WebAR tracking encountered an issue starting the video stream.");
      });
    }

    // Fix iOS video playback attributes when video element is added to DOM
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.tagName === 'VIDEO') {
            node.setAttribute('playsinline', 'true');
            node.setAttribute('webkit-playsinline', 'true');
            node.setAttribute('muted', 'true');
            node.setAttribute('autoplay', 'true');
            node.playsInline = true;
            node.muted = true;
          }
        });
      });
    });
    observer.observe(document.body, { childList: true });

    // Target Recognition Events
    if (targetEntity) {
      targetEntity.addEventListener('targetFound', () => {
        if (statusPill) statusPill.className = 'status-pill tracking';
        if (statusText) statusText.textContent = '✅ Shivam Jewels Card Recognized (3D Model Active)';
        if (reticle) reticle.classList.add('hidden');
        playChime('success');

        if (arWrapper) {
          arWrapper.setAttribute('visible', 'true');
          if (arWrapper.object3D) arWrapper.object3D.visible = true;
          // Trigger the A-Frame pop-up zoom-in animation
          arWrapper.emit('targetFound');
        }
      });

      targetEntity.addEventListener('targetLost', () => {
        if (statusPill) statusPill.className = 'status-pill searching';
        if (statusText) statusText.textContent = 'Scanning for Shivam Jewels Card Target...';
        if (reticle) reticle.classList.remove('hidden');

        if (arWrapper) {
          arWrapper.setAttribute('visible', 'false');
          if (arWrapper.object3D) arWrapper.object3D.visible = false;
          // Reset the scale back to 0 0 0 for next recognition
          arWrapper.setAttribute('scale', '0 0 0');
        }
      });

      // Material Enhancer for 3D Diamond GLB Model
      const gltfModel = document.getElementById('3d-model-entity');
      if (gltfModel) {
        gltfModel.addEventListener('model-loaded', () => {
          const meshObj = gltfModel.getObject3D('mesh');
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
        });
      }
    }

    const btnStartAr = document.getElementById('btn-start-ar');
    if (btnStartAr) {
      btnStartAr.onclick = window.handleStartARClick;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
