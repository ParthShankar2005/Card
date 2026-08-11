# Shivam Jewels WebAR — Technical Documentation & Architecture

An app-less WebAR experience for **Shivam Jewels (JCK Las Vegas Collection)** built with MindAR.js, A-Frame, and Three.js.

Live WebAR App: [https://card.shivamai.studio](https://card.shivamai.studio)

---

## 🏗️ Architecture & Component Connections

Below is the connection flow showing how every component in the codebase interacts:

```
                  ┌──────────────────────────────┐
                  │       User Mobile Browser    │
                  └──────────────┬───────────────┘
                                 │ Taps "Allow Camera & Start WebAR"
                                 ▼
                  ┌──────────────────────────────┐
                  │         index.html           │
                  └──────────────┬───────────────┘
                                 │ Loads App Logic
                                 ▼
                  ┌──────────────────────────────┐
                  │          js/app.js           │
                  └──────┬────────────────┬──────┘
                         │                │
      Scans Video Frames │                │ Controls MindAR Target
                         ▼                ▼
     ┌───────────────────────┐   ┌────────────────────────┐
     │       js/jsQR.js      │   │  js/mindar-image-      │
     │                       │   │   aframe.prod.js       │
     └───────────┬───────────┘   └───────────┬────────────┘
                 │ Decodes URL               │ Matches Feature Descriptors
                 └───────────┬───────────────┘
                             │
                             ▼ Matches Target QR
                 ┌───────────────────────┐
                 │       <a-scene>       │
                 └───────────┬───────────┘
                             │ Anchor 0: ar-target
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Poster Card │     │  3D Diamond  │     │ 3D Logo Badge│
│  (plane)     │     │ (gltf-model) │     │   (plane)    │
└──────────────┘     └──────────────┘     └──────────────┘
```

---

## 📁 Folder Structure & Clear File Descriptions

```
f:\SJ 3D
├── assets/                       # 3D Assets, Textures, & Target Descriptor Binaries
│   ├── model.gltf                # 57-Facet Brilliant Cut Diamond 3D model
│   ├── model.glb                 # Binary GLB version of 3D Diamond
│   ├── shivam_banner.png         # JCK Las Vegas Booth Poster (1:1 QR aspect overlay)
│   ├── shivam_logo.png           # Official Shivam Jewels transparent logo plane
│   ├── target.png                # High-res 1024x1024 QR target image
│   └── targets.mind              # MindAR compiled feature descriptor binary (660 KB)
│
├── css/
│   └── styles.css                # Glassmorphic UI theme & transparent camera feed
│
├── js/
│   ├── app.js                    # WebAR controller, jsQR loop, & distance calculator
│   ├── jsQR.js                   # Real-time QR camera frame decoder engine
│   ├── aframe.min.js             # A-Frame 3D web framework library
│   └── mindar-image-aframe.prod.js # MindAR image tracking engine library
│
├── scripts/                      # Utility Build & Generator Scripts
│   ├── build_diamond.py          # Python script for 57-facet 3D diamond generation
│   ├── build_qr.py               # Python script for clean QR target generation
│   └── compile_mind.js           # Node script for MindAR binary compilation
│
├── index.html                    # HTML5 main entrypoint with <a-scene> container
├── server.js                     # Express static server for local testing
├── vercel.json                   # Vercel deployment configuration
├── package.json                  # NPM dependencies and script shortcuts
└── README.md                     # Technical documentation
```

---

## 🔄 How the Files Connect

1. **`index.html` → `js/app.js`**:
   - `index.html` includes `<script src="./js/app.js">`.
   - The button `<button onclick="handleStartARClick(event)">` directly invokes `window.handleStartARClick()` defined inside `js/app.js`.

2. **`js/app.js` → `js/jsQR.js` & `js/mindar-image-aframe.prod.js`**:
   - `js/app.js` captures raw video frames from `<video>` element created by MindAR and passes them to `jsQR` to decode the QR code string.
   - Upon matching `card.shivamai.studio`, `app.js` triggers `mindar-image-system.start()` to track target position in 6DoF space.

3. **`assets/targets.mind` → `<a-scene>`**:
   - `<a-scene mindar-image="imageTargetSrc: ./assets/targets.mind">` feeds feature descriptors into MindAR to track camera position relative to `target.png`.

4. **`assets/model.glb` & `assets/shivam_logo.png` → `<a-entity id="ar-target">`**:
   - `<a-gltf-model src="#glbModel">` renders the 57-facet brilliant 3D diamond from `./assets/model.glb`.
   - `<a-plane src="./assets/shivam_logo.png">` renders the official Shivam Jewels logo floating above the diamond.

---

## 🛠️ Build Commands

| Command | Action |
| :--- | :--- |
| `npm start` | Start local development server on `http://localhost:3000` |
| `npm run build-diamond` | Re-generate 57-facet 3D diamond GLTF/GLB models (`scripts/build_diamond.py`) |
| `npm run build-qr` | Re-generate clean target QR code image (`scripts/build_qr.py`) |

---

## 📐 Detailed Breakdown of WebAR Scene Markup

Below is a complete explanation of every line, attribute, spatial coordinate, material parameter, and animation setting in the WebAR scene entity code:

```html
<!-- 1. Shivam Jewels Poster Banner (Flat alignment over QR target) -->
<a-plane
  id="banner-plane"
  src="#shivamBanner"
  position="0 0 0.005"
  rotation="0 0 0"
  width="1.0"
  height="1.0"
  material="transparent: true; side: double; shader: flat; depthTest: true;">
</a-plane>

<!-- 2. Shivam Jewels Official Logo (Flat alignment positioned at top of banner) -->
<a-plane
  id="logo-plane"
  src="#shivamLogo"
  position="0 0.65 0.01"
  rotation="0 0 0"
  width="1.2"
  height="0.32"
  material="transparent: true; side: double; shader: flat; depthTest: true;">
</a-plane>

<!-- 3. Authentic 3D Diamond Model (Positioned between camera & banner, facing camera, with slow left-to-right rotation) -->
<a-entity
  id="3d-model-container"
  position="0 0.15 0.35"
  rotation="70 0 0"
  animation="property: rotation; to: 70 360 0; loop: true; dur: 9000; easing: linear"
  animation__float="property: position; from: 0 0.08 0.35; to: 0 0.22 0.35; dir: alternate; loop: true; dur: 3000; easing: easeInOutSine">
  
  <a-gltf-model
    id="3d-model-entity"
    src="./assets/model.glb"
    scale="0.65 0.65 0.65"
    position="0 0 0">
  </a-gltf-model>
</a-entity>
```

### 🔹 1. Poster Banner Plane (`#banner-plane`)
* **`<a-plane>`**: An A-Frame 3D primitive tag used to render 2D image textures in 3D WebAR space.
* **`id="banner-plane"`**: Unique DOM identifier accessed by `js/app.js` during target tracking.
* **`src="#shivamBanner"`**: Binds the preloaded Shivam Jewels poster image asset (`assets/shivam_banner.png`).
* **`position="0 0 0.005"`**: Placed at origin (`X=0, Y=0`), slightly elevated (`Z=0m`) above the target surface to lie flat over the scanned QR card without depth clipping.
* **`rotation="0 0 0"`**: Alignment fixed flat with zero angle tilt.
* **`width="1.0" height="1.0"`**: Matches the exact 1:1 square aspect ratio of the 1024x1024 QR target.
* **`material="..."`**:
  * **`transparent: true`**: Preserves alpha-channel PNG transparency for smooth edges.
  * **`side: double`**: Ensures the plane remains visible from both front and back angles.
  * **`shader: flat`**: Renders pure image colors without artificial 3D lighting shadows on the banner graphic.
  * **`depthTest: true`**: Prevents z-buffer depth artifacts so edges remain crisp and aligned.

---

### 🔹 2. Shivam Jewels Logo Plane (`#logo-plane`)
* **`src="#shivamLogo"`**: Binds the official Shivam Jewels logo image asset (`assets/shivam_logo.png`).
* **`position="0 0.65 0.01"`**: Positioned along center axis (`X=0`), shifted vertically to the top of the poster plane (`Y=0.65m`), and layered slightly in front (`Z=0.01m`).
* **`width="1.2" height="0.32"`**: Maintains the official brand logo aspect ratio ($3.75:1$).

---

### 🔹 3. Authentic 3D Diamond Model Container & Entity
* **`<a-entity id="3d-model-container">`**: A lightweight transform wrapper that isolates rotation and floating animations from the GLTF asset loading lifecycle.
* **`position="0 0.15 0.35"`**: Positions the 3D diamond floating in space **between the user's camera lens and the poster card** (`Z=0.35m` forward).
* **`rotation="70 0 0"`**: Tilts the diamond 70 degrees forward around the X-axis so its top table facet faces directly into the user's camera.
* **`animation="property: rotation; to: 70 360 0; loop: true; dur: 9000; easing: linear"`**: Continuously spins the 3D diamond from left to right (360° around Y-axis) over 9 seconds.
* **`animation__float="property: position; from: 0 0.08 0.35; to: 0 0.22 0.35; dir: alternate; loop: true; dur: 3000; easing: easeInOutSine"`**: Adds a smooth vertical floating motion.
* **`<a-gltf-model>`**: Renders the 57-Facet Pro-Grade Diamond model loaded directly from `./assets/model.glb` scaled at 65% size (`scale="0.65 0.65 0.65"`).

