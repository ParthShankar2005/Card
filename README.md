# Shivam Jewels WebAR — Technical Documentation & Architecture

An app-less WebAR experience for **Shivam Jewels (JCK Las Vegas Collection)** built with MindAR.js, A-Frame, and Three.js.

Live WebAR Production App: [https://ar.testsjit.in](https://ar.testsjit.in)

---

## 🏗️ Architecture & Component Connections

Below is the connection flow showing how every component in the codebase interacts:

```
                  ┌──────────────────────────────────────────┐
                  │       User Mobile Browser (Camera)       │
                  └────────────────────┬─────────────────────┘
                                       │ Taps "Allow Camera & Start WebAR"
                                       ▼
                  ┌──────────────────────────────────────────┐
                  │               index.html                 │
                  └────────────────────┬─────────────────────┘
                                       │ Loads App Controller & Scene
                                       ▼
                  ┌──────────────────────────────────────────┐
                  │               js/app.js                  │
                  │  - Camera Stream Lifecycle & Reticle HUD │
                  │  - AudioContext Feedback Chimes          │
                  │  - play-all-animations GLTF Component    │
                  └────────────────────┬─────────────────────┘
                                       │ Initialized in <a-scene>
                                       ▼
                  ┌──────────────────────────────────────────┐
                  │     js/mindar-image-aframe.prod.js       │
                  │      (Feeds assets/targets.mind)         │
                  └────────────────────┬─────────────────────┘
                                       │ 6DoF Real-time Pose Estimation
                                       ▼
                  ┌──────────────────────────────────────────┐
                  │          <a-entity id="ar-target">       │
                  │          (targetIndex: 0)                │
                  └────────────────────┬─────────────────────┘
         ┌───────────────────┬─────────┴─────────┬───────────────────┐
         ▼                   ▼                   ▼                   ▼
  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
  │ Booth Panel  │    │ Banner Panel │    │  Logo Badge  │    │  3D Models   │
  │ (Left Side)  │    │ (Right Side) │    │ (Center Top) │    │  Shivam/Ring │
  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

---

## 📁 Repository Structure & File Descriptions

```
Card/
├── assets/                           # 3D Models, Cards, Textures & MindAR Target Files
│   ├── cards/                        # Invitation & Tracking Card Images
│   │   ├── Company_f_view.png        # Official Company front card with ar.testsjit.in QR
│   │   ├── Parth_f_view.png          # Development front card with card.shivamai.studio QR
│   │   └── targets.png               # High-res primary card tracking target (AR Vision)
│   │
│   ├── glb/                          # 3D Models
│   │   ├── Shivam.glb                # 3D Animated Shivam Showcase model
│   │   └── Ring.glb                  # 3D Gem Ring model
│   │
│   ├── qr/                           # QR Code Assets (with Quiet Zone White Border)
│   │   ├── company_qr_code.png       # High-density QR code pointing to ar.testsjit.in
│   │   ├── card_qr_code.png          # Production QR code pointing to ar.testsjit.in
│   │   └── parth_qr_code.png         # Development QR code pointing to card.shivamai.studio
│   │
│   ├── Booth.png                     # Left-side Shivam Jewels booth poster panel
│   ├── shivam_banner.png             # Right-side Shivam Jewels invitation banner
│   ├── shivam_logo.png               # Center-top transparent brand logo
│   └── targets.mind                  # MindAR compiled binary feature descriptors (532 KB)
│
├── css/
│   └── styles.css                    # Dark glassmorphic theme, scanning reticle HUD & animations
│
├── js/
│   ├── app.js                        # Controller: Camera permission, audio chimes, animation loop
│   ├── aframe.min.js                 # A-Frame 3D Web framework (v1.5.0)
│   ├── mindar-image-aframe.prod.js   # MindAR WebAR image tracking engine (v1.2.5)
│   └── jsQR.js                       # Real-time QR camera frame decoder fallback
│
├── scripts/                          # Utility & Backend Scripts
│   ├── app.py                        # Flask backend with OpenCV & MindAR descriptor verification
│   ├── generate_qr.py                # Python QR code generator utility
│   ├── server.js                     # Node.js / Express static fallback server
│   ├── package.json                  # Scripts package configuration
│   └── requirements.txt              # Python package dependencies (Flask, OpenCV, MindAR)
│
├── index.html                        # Main HTML5 entrypoint containing <a-scene> and UI modals
├── serve.ps1                         # PowerShell LAN Web server for local mobile browser testing
├── vercel.json                       # Vercel deployment & CORS headers configuration
├── package.json                      # Root npm configuration & script shortcuts
└── README.md                         # Technical documentation & architecture guide
```

---

## 🔄 Official Git Repository & Production Workflow

This project is maintained for **Shivam Jewels Pvt. Ltd.** with the official Azure DevOps production repository:

| Remote Name | Target Repository | Scope & Purpose |
| :--- | :--- | :--- |
| **`sjworld`** | `https://dev.azure.com/SJWorld/SJAR/_git/SJAR` | **Shivam Jewels Pvt. Ltd. / SJ Intelligence Team:** Official production repository. |

### Operational Protocol:
Production commits and releases are pushed directly to the official `sjworld` repository:
```powershell
git push sjworld main
```

---

## 📐 WebAR Scene Markup & 3D Layout

Below is the spatial layout configured inside `<a-scene>` in `index.html`:

```html
<!-- Target 0: Image Target tracking anchor -->
<a-entity id="ar-target" mindar-image-target="targetIndex: 0">

  <!-- Multi-Angle Studio Lighting -->
  <a-entity light="type: ambient; color: #ffffff; intensity: 3.0"></a-entity>
  <a-entity light="type: directional; color: #ffffff; intensity: 3.8" position="1 3 4"></a-entity>
  <a-entity light="type: directional; color: #38bdf8; intensity: 2.2" position="-2 1 3"></a-entity>
  <a-entity light="type: point; color: #ffffff; intensity: 3.5; distance: 6" position="0 0.5 1"></a-entity>

  <!-- Wrapped 3D Experience Content -->
  <a-entity id="ar-content-wrapper" visible="false" scale="0 0 0"
    animation="property: scale; from: 0 0 0; to: 1 1 1; dur: 800; easing: easeOutBack; startEvents: targetFound">

    <!-- 1. Left Side: Shivam Jewels Booth Graphic -->
    <a-plane id="booth-plane" src="#Booth" position="-1.3 0 -1" rotation="0 15 0" width="1.0" height="1.25"
      material="transparent: true; alphaTest: 0.2; side: double; shader: flat; depthTest: true;">
    </a-plane>

    <!-- 2. Right Side: Shivam Jewels Banner Graphic -->
    <a-plane id="banner-plane" src="#shivamBanner" position="1.3 0 -1" rotation="0 -15 0" width="1.0" height="1.25"
      material="transparent: true; alphaTest: 0.2; side: double; shader: flat; depthTest: true;">
    </a-plane>

    <!-- 3. Center Top: Shivam Jewels Official Logo -->
    <a-plane id="logo-plane" src="#shivamLogo" position="0 0.8 0" rotation="0 0 0" width="1.0" height="0.26"
      material="transparent: true; alphaTest: 0.2; side: double; shader: flat; depthTest: true;">
    </a-plane>

    <!-- 4. Center Bottom: 3D Gem Ring Model -->
    <a-entity id="ring-model-container" position="0 -0.5 0.2" rotation="0 0 0">
      <a-gltf-model id="ring-model-entity" src="#glbRing" scale="0.2 0.2 0.2" position="0 0 0" rotation="0 0 0"
        play-all-animations>
      </a-gltf-model>
    </a-entity>

    <!-- 5. Center: 3D Shivam Model Showcase -->
    <a-entity id="shivam-model-container" position="0 -0.4 0.2" rotation="0 -90 0">
      <a-gltf-model id="shivam-model-entity" src="#glbShivam" scale="3 3 3" position="0 0 0" rotation="0 0 0"
        play-all-animations>
      </a-gltf-model>
    </a-entity>

  </a-entity>
</a-entity>
```

---

## 📱 Mobile Testing & Local Development

Because WebAR relies on mobile camera hardware and WebGL rendering, mobile browser testing is primary.

### 1. Launching Local PowerShell Server (Supports GLB & Mind MIME types)
Run the built-in PowerShell dev server:
```powershell
.\serve.ps1 -Port 3000
```
This serves the application on `http://localhost:3000` and displays your local Wi-Fi IP (e.g. `http://192.168.x.x:3000`) for access from your mobile phone connected to the same network.

### 2. Vercel Cloud Deployment
The app is configured for instant zero-configuration deployment on Vercel via [vercel.json](file:///c:/Users/Admin/Downloads/Card/vercel.json).
All assets and routes have CORS and `no-cache` revalidation headers configured for immediate update delivery.
