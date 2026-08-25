# Shivam Jewels WebAR & AI Virtual Ring Try-On

An ultra-luxurious, app-less **WebAR Experience & AI Virtual Ring Try-On Portal** for **Shivam Jewels**, built using MindAR.js, A-Frame, Three.js, and Google MediaPipe Tasks Vision.

**Live WebAR Production App**: [https://ar.testsjit.in](https://ar.testsjit.in)

---

## 🌟 Current Project Status

- **Status**: **Production Ready**
- **Supported Platforms**: Mobile Browsers (iOS Safari, Android Chrome) & Desktop Web Browsers.
- **Port Mapping**: Production Docker maps `8789:8789` via `npm start` (`scripts/server.js`).

---

## 🚀 Key Features & Add-ons

### 1. 💎 Triple Experience Modes
- **AR Mode (Card Scan)**: Continuous live tracking of the physical Shivam Jewels AR Card. Renders 3D jewelry showcases, animation tracks, and branded display panels directly anchored to the card.
- **3D Mode (Interactive 3D)**: One-time card scan unlock mode with persistent 3D world anchoring. Features dual controls:
  - **Gyroscope 360° Mode**: Natural device orientation & compass tracking.
  - **Touch Mode**: Smooth 60fps gesture rotation, double-tap recentering, and spatial pinch-to-zoom dolly camera.
  - **30-Second Background Loop**: Silently verifies card presence in the background every 30 seconds without interrupting 3D navigation.
- **Virtual Try-On Mode (AI Hand Tracking)**: Direct camera Virtual Ring Try-On powered by Google MediaPipe Tasks Vision and Three.js orthographic rendering:
  - **Real-Time Hand Landmark Tracking**: Tracks 21 3D hand keypoints in real time.
  - **Dynamic Hand View Classifier**: Real-time detection of **`PALM VIEW`** vs **`BACK VIEW`** (Dorsal view) with visual UI indicators.
  - **Finger Selection Selector**: Interactive Roman-numeral finger selection bar (`I INDEX`, `II MIDDLE`, `III RING`, `IV PINKY`) with smooth 520ms spatial interpolation ring transfer animations.
  - **Distance & Occlusion Safety**: Enforces 20–40 cm optimal distance tracking and realistic finger occlusion rendering.
  - **Custom Diamond Ring Model**: Preloaded with `ringwithdaimond.glb`.

### 2. 🏛️ Shivam Jewels Luxury Design System
- **Sapphire Glassmorphism**: Deep midnight navy gradient background (`#0e172c`), glowing diamond ice borders (`rgba(130, 178, 223, 0.28)`), and floating drop shadows.
- **Diamond Jewelry Focus**: Tailored specifically for Shivam Jewels' diamond collection (Diamond Light `#cbe2f8` & Diamond Ice `#82b2df` accents).
- **Staged Diamond Preloader**: Diamond logo progress bar preloading UI assets efficiently.
- **Unified Header**: Glassmorphic status pill indicator (left), mode selection toggle (center), and white Shivam Jewels brand logo (right).

---

## 🏗️ Technical Architecture

```
                                ┌──────────────────────────────────────────┐
                                │       User Mobile Browser (Camera)       │
                                └────────────────────┬─────────────────────┘
                                                     │
                                                     ▼
                                ┌──────────────────────────────────────────┐
                                │               index.html                 │
                                └────────────────────┬─────────────────────┘
                                                     │
                                                     ▼
                                ┌──────────────────────────────────────────┐
                                │               js/app.js                  │
                                │  - Application Controller & Modes        │
                                │  - A-Frame 3D Anchor & Custom Shaders    │
                                │  - Three.js Orthographic Scene           │
                                │  - MediaPipe Vision Hand Landmarker      │
                                └────────────────────┬─────────────────────┘
                                                     │
               ┌─────────────────────────────────────┼─────────────────────────────────────┐
               ▼                                     ▼                                     ▼
   ┌───────────────────────┐             ┌───────────────────────┐             ┌───────────────────────┐
   │        AR Mode        │             │        3D Mode        │             │  Virtual Try-On Mode  │
   │ Continuous Tracking   │             │ Gyro/Touch Controls   │             │ MediaPipe AI Tracking │
   │ MindAR Image Engine   │             │ 30s Background Loop   │             │ Diamond Ring Model    │
   └───────────────────────┘             └───────────────────────┘             └───────────────────────┘
```

---

## 📁 Repository Directory Structure

```
SJAR/
├── assets/                           # 3D Models, Textures, Cards & Tracking Files
│   ├── AR/                           # Brand Logos, Banners & Display Panels
│   │   ├── Booth.png                 # Shivam Jewels booth poster panel
│   │   ├── shivam_banner.png         # Shivam Jewels invitation banner
│   │   └── shivam_logo.png           # Transparent pure white Shivam Jewels logo
│   ├── cards/                        # Invitation & Target Card Images
│   │   └── targets.png               # High-res primary card tracking target
│   ├── glb/                          # 3D GLTF/GLB Models
│   │   ├── ringwithdaimond.glb       # Active Diamond Ring model for Virtual Try-On
│   │   ├── Ring.glb                  # 3D Gem Ring model
│   │   └── Shivam.glb                # 3D Shivam Showcase model
│   ├── daimond.png                   # Preloader diamond icon asset
│   └── targets.mind                  # MindAR compiled binary target file
│
├── css/
│   └── styles.css                    # Sapphire glassmorphic theme, Try-On UI & media queries
│
├── js/
│   ├── app.js                        # Client controller, 3D Engine & MediaPipe Try-On pipeline
│   ├── aframe.min.js                 # A-Frame 3D framework (v1.5.0)
│   ├── mindar-image-aframe.prod.js   # MindAR WebAR tracking library (v1.2.5)
│   └── jsQR.js                       # Fallback QR code reader library
│
├── scripts/                          # Server & Backend Utilities
│   ├── server.js                     # Node.js Express server (Port 8789 / 3000)
│   ├── package.json                  # Server package configuration
│   └── requirements.txt              # Optional Python environment requirements
│
├── Dockerfile                        # Production Docker build specification
├── docker-compose.yml                # Docker Compose service definition (Port 8789)
├── index.html                        # Main WebAR HTML5 app entrypoint
├── server.bat                        # Batch script for local network server execution
└── README.md                         # Project documentation
```

---

## 🛠️ Local Development & Running the App

### Option 1: Standalone Node.js Development Server
1. Install dependencies and start the server:
   ```cmd
   npm start
   ```
2. Open [http://localhost:3000](http://localhost:3000) or [http://localhost:8789](http://localhost:8789) in your browser.

### Option 2: Local Network Testing (`server.bat`)
Run the Windows batch script:
```cmd
.\server.bat
```
Access the displayed local IP address (e.g. `http://192.168.x.x:3000`) on a mobile phone connected to the same Wi-Fi network.

---

## 🐳 Docker Deployment

Build and start the container in production mode:

```bash
docker-compose up -d --build
```

- **Exposed Port**: `8789`
- **Health check**: `http://localhost:8789`

---

## 🏛️ Official Repository & Production Deployment

Maintained for **Shivam Jewels Pvt. Ltd.**:

| Remote | Target Repository | Description |
| :--- | :--- | :--- |
| **`sjworld`** | `https://dev.azure.com/SJWorld/SJAR/_git/SJAR` | **Official Production Azure DevOps Repository** |

Push updates to production:
```powershell
git push sjworld main
```

