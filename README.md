<div align="center">

# 🪞 FogMirror

**Turn your webcam into an interactive steamed-up bathroom mirror.**  
Wipe the glass with your hands, sketch in the condensation, or breathe onto the screen to fog it up.

[![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?logo=windows&logoColor=white)](#)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)](#)
[![Vision](https://img.shields.io/badge/AI-MediaPipe-FF6F00?logo=google&logoColor=white)](#)
[![Audio](https://img.shields.io/badge/Audio-Pure%20Web%20Audio-10B981)](#)

</div>

---

## ✨ Features

- **🪞 Living Fog & Moisture Physics**  
  Multi-layered organic condensation with feathered wiping, atmospheric re-condensation, and pure glistening water beads that drip naturally.

- **✍️ Precision Finger Pen**  
  Pinch your thumb and index finger together to write, doodle, or leave notes on the foggy glass with fine pen control.

- **😮‍💨 Breath Reactive ("Haaaa")**  
  Breathe warmly toward your webcam — facial tracking detects open mouth exhalation and billows warm steam directly where your mouth is located.

- **🖐️ Intuitive Hand Gestures**  
  No mouse or keyboard needed. Sweep with an open palm to clear a wide patch, point to squeegee small details, hold a fist to clear the glass, or flash a peace sign to frost it over.

- **🔊 100% Procedural ASMR Audio**  
  Zero audio files. Every sound — moist glass squeegees, breath resonance, air whooshes, and water droplet plops — is synthesized in real-time with the Web Audio API.

- **⚡ Butter-Smooth 60–144 FPS**  
  Built with lightweight hardware-accelerated canvas compositing and jitter-free adaptive filtering.

---

## 🎮 Gestures & Controls

| Gesture | How to Do It | Action | Audio Feedback |
| :--- | :--- | :--- | :--- |
| **✍️ Pinch** | Touch Thumb & Index tips together | Precision stylus writing & sketching | Gentle glass pen friction |
| **☝️ Point** | Extend only Index finger | Precision fingertip squeegee | Moist glass wipe |
| **🖐️ Open Palm** | Spread 3+ fingers wide | Broad sweep wipe | Wide surface sweep |
| **✊ Closed Fist** | Hold a fist for ~0.2s | Clears all fog from the mirror | Clean squeegee whoosh |
| **✌️ Peace Sign** | Hold a 'V' sign for ~0.2s | Fogs up the entire mirror | Atmospheric steam swell |
| **🤟 Love You** | Thumb + Index + Pinky extended | Stamps a clear heart into the fog | Squeegee snap |
| **🤘 Rock On** | Index + Pinky extended | Triggers a frost storm burst | Cold condensation rush |
| **👍 Thumbs Up** | Thumb up, other fingers curled | Toggles water droplet beads | Water drop plop |
| **😮‍💨 Mouth Breath** | Open mouth facing the mirror | Billows warm condensation steam | Warm breath exhalation |

### ⌨️ Keyboard Shortcuts
- `C` — Instantly clear all fog
- `F` — Instantly fog up the mirror
- `D` — Toggle Live Debug HUD (FPS, 21-joint skeleton, tracking meters)
- `M` — Mute / Unmute audio
- `ESC` — Quit

---

## 🚀 Getting Started

### Option 1: Standalone Windows App (.exe)
Download or run the packaged executable:
```powershell
.\dist\FogMirror\FogMirror.exe
```

### Option 2: Run from Source

**Requirements**: Python 3.10+ on Windows.

1. Clone the repository:
   ```bash
   git clone https://github.com/EshanSahir/FogMirror.git
   cd FogMirror
   ```

2. Install dependencies:
   ```bash
   pip install pywebview
   ```

3. Launch:
   ```bash
   python main.py
   ```

---

## 🛠️ Architecture

- **Runtime**: Python 3 + `pywebview` utilizing Microsoft Edge WebView2 (Chromium).
- **Vision Pipeline**: MediaPipe Tasks Vision running WebAssembly & GPU acceleration for real-time 21-joint hand landmarker and 468-point facial mesh.
- **Filtering**: 1€ (One-Euro) adaptive low-pass filter eliminates camera sensor jitter while preserving high-speed responsiveness.
- **Audio Synthesis**: Pure procedural Web Audio DSP (pink noise filters, resonant bandpass formants, Minnaert bubble oscillators).

---

## 📄 License
MIT License. Open source and free to explore!
