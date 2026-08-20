/**
 * Pure Direct Camera View & Diamond Ring Overlay Engine
 * High-Accuracy MediaPipe Hands Tracking with Expandable Finger Selector
 */

document.addEventListener('DOMContentLoaded', () => {
  const webcamElement = document.getElementById('webcam');
  const canvasElement = document.getElementById('output_canvas');
  const canvasCtx = canvasElement.getContext('2d');
  const cameraLoader = document.getElementById('camera_loader');

  let cameraHelper = null;
  let handsEngine = null;

  // Preload Daimond Overlay PNG Asset
  const diamondImg = new Image();
  let diamondImgLoaded = false;
  diamondImg.src = 'assets/daimond.png';
  diamondImg.onload = () => {
    diamondImgLoaded = true;
  };

  // State Management
  const state = {
    mirrorVideo: false, // Default: Unmirrored (1:1 match with original camera & OBS Studio)
    targetFinger: 'INDEX', // Selected Finger ('INDEX' | 'MIDDLE' | 'RING' | 'PINKY')
    diamondScaleRatio: 0.48, // Realistic ring stone size ratio
    detConf: 0.7,
    trackConf: 0.7
  };

  // UI Elements for Expandable Horizontal Finger Selector
  const btnFingerTrigger = document.getElementById('btn_finger_trigger');
  const horizontalFingerBar = document.getElementById('horizontal_finger_bar');
  const triggerText = document.getElementById('trigger_text');
  const fingerOptionBtns = document.querySelectorAll('.finger-option-btn');

  if (btnFingerTrigger && horizontalFingerBar) {
    btnFingerTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      horizontalFingerBar.classList.toggle('open');
      btnFingerTrigger.classList.toggle('active-open');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.expandable-finger-wrapper')) {
        horizontalFingerBar.classList.remove('open');
        btnFingerTrigger.classList.remove('active-open');
      }
    });
  }

  fingerOptionBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const selectedFinger = btn.dataset.finger;
      state.targetFinger = selectedFinger;

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
    });
  });

  // Set Mirror State across video & canvas
  function setMirrorState(isMirrored) {
    state.mirrorVideo = isMirrored;
    if (isMirrored) {
      webcamElement.classList.add('mirrored');
      webcamElement.classList.remove('unmirrored');
      canvasElement.classList.add('mirrored');
      canvasElement.classList.remove('unmirrored');
    } else {
      webcamElement.classList.add('unmirrored');
      webcamElement.classList.remove('mirrored');
      canvasElement.classList.add('unmirrored');
      canvasElement.classList.remove('mirrored');
    }
  }

  setMirrorState(state.mirrorVideo);

  function resizeCanvas() {
    if (webcamElement.videoWidth && webcamElement.videoHeight) {
      canvasElement.width = webcamElement.videoWidth;
      canvasElement.height = webcamElement.videoHeight;
    }
  }

  webcamElement.addEventListener('loadedmetadata', resizeCanvas);
  window.addEventListener('resize', resizeCanvas);

  // --- Flexible Hand Boundary Validation ---
  function isHandFullyInFrame(landmarks) {
    if (!landmarks || landmarks.length < 21) return false;
    
    // Determine Finger Keypoint Indices based on targetFinger
    let mcpIdx = 5;
    let pipIdx = 6;
    if (state.targetFinger === 'MIDDLE') { mcpIdx = 9; pipIdx = 10; }
    else if (state.targetFinger === 'RING') { mcpIdx = 13; pipIdx = 14; }
    else if (state.targetFinger === 'PINKY') { mcpIdx = 17; pipIdx = 18; }

    const pMcp = landmarks[mcpIdx];
    const pPip = landmarks[pipIdx];

    if (!pMcp || !pPip || typeof pMcp.x !== 'number' || typeof pPip.x !== 'number') return false;

    const minBound = 0.005;
    const maxBound = 0.995;

    if (pMcp.x < minBound || pMcp.x > maxBound || pMcp.y < minBound || pMcp.y > maxBound) return false;
    if (pPip.x < minBound || pPip.x > maxBound || pPip.y < minBound || pPip.y > maxBound) return false;

    return true;
  }

  // --- Hand Facing Normal Vector Analysis (Back of Hand vs Palm) ---
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

  // --- Ultra-Stable Zero-Jitter Adaptive Filter Memory (Per Handedness) ---
  const smoothedStates = {
    'Left': { x: null, y: null, angle: null, size: null, visible: false },
    'Right': { x: null, y: null, angle: null, size: null, visible: false }
  };

  // --- Diamond Ring Rendering on Finger Midpoint ---
  function drawDiamondOnHandTop(landmarks, handedness, width, height) {
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

    // Selected Finger Keypoint Indices
    let mcpIdx = 5;
    let pipIdx = 6;
    if (state.targetFinger === 'MIDDLE') { mcpIdx = 9; pipIdx = 10; }
    else if (state.targetFinger === 'RING') { mcpIdx = 13; pipIdx = 14; }
    else if (state.targetFinger === 'PINKY') { mcpIdx = 17; pipIdx = 18; }

    const pMcp = landmarks[mcpIdx];
    const pPip = landmarks[pipIdx];

    // RAW TARGET POSITION (Exact midpoint of selected finger segment)
    const rawX = ((pMcp.x + pPip.x) / 2) * width;
    const rawY = ((pMcp.y + pPip.y) / 2) * height;

    // DYNAMIC FINGER AXIS ROTATION: Calculates exact 2D/3D tilt & rotation angle of the selected finger
    const dx = (pPip.x - pMcp.x) * width;
    const dy = (pPip.y - pMcp.y) * height;
    const rawAngle = Math.atan2(dy, dx) + Math.PI / 2;

    // UNIFORM SIZE REFERENCE: Always reference Index finger segment length (5 to 6)
    // so stone size stays 100% constant across all fingers!
    const pIndexMcp = landmarks[5];
    const pIndexPip = landmarks[6];
    const indexLength = Math.hypot((pIndexPip.x - pIndexMcp.x) * width, (pIndexPip.y - pIndexMcp.y) * height);
    const ratio = state.diamondScaleRatio || 0.48;
    const rawSize = Math.max(12, Math.min(width * 0.15, indexLength * ratio));

    // ZERO-JITTER DUAL-STAGE ADAPTIVE SMOOTHING FILTER
    if (!smoothedState.visible || smoothedState.x === null) {
      smoothedState.x = rawX;
      smoothedState.y = rawY;
      smoothedState.angle = rawAngle;
      smoothedState.size = rawSize;
      smoothedState.visible = true;
    } else {
      // 1. Position Deadband & Adaptive Filter
      const deltaDist = Math.hypot(rawX - smoothedState.x, rawY - smoothedState.y);
      if (deltaDist > 1.0) { // Ignore sub-pixel sensor noise (<1.0px)
        const aPos = Math.min(0.35, Math.max(0.08, deltaDist * 0.02));
        smoothedState.x += (rawX - smoothedState.x) * aPos;
        smoothedState.y += (rawY - smoothedState.y) * aPos;
      }

      // 2. Continuous 1:1 Angular Rotation Tracking (Rotates immediately as hand rotates)
      let dAngle = rawAngle - smoothedState.angle;
      while (dAngle < -Math.PI) dAngle += Math.PI * 2;
      while (dAngle > Math.PI) dAngle -= Math.PI * 2;

      // Responsive Angular Filter: Follows hand rotation 1:1 in real time
      const aAngle = Math.min(0.5, Math.max(0.18, Math.abs(dAngle) * 0.7));
      smoothedState.angle += dAngle * aAngle;

      // 3. Size Interpolation
      const dSize = rawSize - smoothedState.size;
      if (Math.abs(dSize) > 0.8) {
        smoothedState.size += dSize * 0.1;
      }
    }

    const { x, y, angle, size } = smoothedState;

    canvasCtx.save();
    canvasCtx.translate(x, y);
    canvasCtx.rotate(angle);

    // REALISTIC POLITE SKIN DROP SHADOW
    canvasCtx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    canvasCtx.shadowBlur = 10;
    canvasCtx.shadowOffsetX = 1;
    canvasCtx.shadowOffsetY = 4;

    // Render daimond.png with rock-solid zero-jitter tracking
    canvasCtx.drawImage(
      diamondImg,
      -size / 2,
      -size / 2,
      size,
      size
    );

    canvasCtx.restore();
  }

  // --- MediaPipe Hands Frame Processing ---
  function onResults(results) {
    if (cameraLoader && cameraLoader.style.display !== 'none') {
      cameraLoader.style.display = 'none';
    }

    resizeCanvas();
    const width = canvasElement.width;
    const height = canvasElement.height;

    canvasCtx.clearRect(0, 0, width, height);

    if (results.multiHandLandmarks && results.multiHandedness && results.multiHandLandmarks.length > 0) {
      // Process ONLY the primary single detected hand (Hand Index 0)
      const landmarks = results.multiHandLandmarks[0];
      const handedness = results.multiHandedness[0].label;

      drawDiamondOnHandTop(landmarks, handedness, width, height);
    } else {
      smoothedStates['Left'].visible = false;
      smoothedStates['Right'].visible = false;
    }
  }

  function initMediaPipe() {
    handsEngine = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    handsEngine.setOptions({
      maxNumHands: 1, // Single Hand Detection Only
      modelComplexity: 1,
      minDetectionConfidence: state.detConf,
      minTrackingConfidence: state.trackConf
    });

    handsEngine.onResults(onResults);

    cameraHelper = new Camera(webcamElement, {
      onFrame: async () => {
        if (handsEngine) {
          await handsEngine.send({ image: webcamElement });
        }
      },
      width: 1280,
      height: 720,
      facingMode: 'environment'
    });

    cameraHelper.start().catch(err => {
      console.warn("Front/default camera fallback:", err);
      const fallbackCam = new Camera(webcamElement, {
        onFrame: async () => {
          if (handsEngine) {
            await handsEngine.send({ image: webcamElement });
          }
        },
        width: 1280,
        height: 720
      });
      fallbackCam.start();
    });
  }

  initMediaPipe();
});
