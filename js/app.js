/**
 * WebAR Image Target Recognition & 3D Model Controller
 * Client: Shivam Jewels (card.shivamai.studio)
 * 
 * Target Image: assets/Shivam_Jewels_Card_Shape.png
 * Features:
 * - Direct image target recognition via MindAR (compiled to targets.mind)
 * - Opens and displays 3D model directly upon target detection (no QR required)
 */
(function () {
  'use strict';

  // Synthesized Web Audio API Synthesizer for feedback chimes (lazy init)
  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
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

  // Camera Permission & Launch WebAR Button Click Handler
  window.handleStartARClick = function (e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const modalOverlay = document.getElementById('permission-modal');
    const reticle = document.getElementById('scanning-reticle');
    const arScene = document.getElementById('ar-scene');

    if (modalOverlay) {
      modalOverlay.style.display = 'none';
      modalOverlay.classList.add('hidden');
    }
    if (reticle) {
      reticle.classList.remove('hidden');
      reticle.style.display = 'flex';
    }

    try { playChime('tap'); } catch (err) { }

    const launchAR = () => {
      if (!arScene) return;

      const arSystem = arScene.systems && arScene.systems['mindar-image-system'];
      if (arSystem) {
        arSystem.start();
      } else {
        arScene.addEventListener('renderstart', () => {
          const sys = arScene.systems && arScene.systems['mindar-image-system'];
          if (sys) sys.start();
        }, { once: true });
      }
    };

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then((tempStream) => {
          tempStream.getTracks().forEach(track => track.stop());
          launchAR();
        })
        .catch((err) => {
          console.error("Camera permission error:", err);
          launchAR();
        });
    } else {
      launchAR();
    }
  };

  function initApp() {
    const targetEntity = document.getElementById('ar-target');
    const statusPill = document.getElementById('status-pill');
    const statusText = document.getElementById('status-text');
    const reticle = document.getElementById('scanning-reticle');
    const arWrapper = document.getElementById('ar-content-wrapper');

    if (targetEntity) {
      targetEntity.addEventListener('targetFound', () => {
        if (statusPill) statusPill.className = 'status-pill tracking';
        if (statusText) statusText.textContent = '✅ Shivam Jewels Card Recognized (3D Model Active)';
        if (reticle) reticle.classList.add('hidden');
        playChime('success');

        if (arWrapper) {
          arWrapper.setAttribute('visible', 'true');
          if (arWrapper.object3D) arWrapper.object3D.visible = true;
        }
      });

      targetEntity.addEventListener('targetLost', () => {
        if (statusPill) statusPill.className = 'status-pill searching';
        if (statusText) statusText.textContent = 'Scanning for Shivam Jewels Card Target...';
        if (reticle) reticle.classList.remove('hidden');

        if (arWrapper) {
          arWrapper.setAttribute('visible', 'false');
          if (arWrapper.object3D) arWrapper.object3D.visible = false;
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
                  if (mat.name.includes("Diamond")) {
                    mat.color = new THREE.Color(0xffffff);
                    mat.emissive = new THREE.Color(0x182c48);
                    mat.roughness = 0.05;
                    mat.metalness = 0.2;
                  } else if (mat.name.includes("Platinum")) {
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
