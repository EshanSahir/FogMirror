/**
 * app.js — Master FogMirror Application (Ultra-Fast 60–144 FPS)
 *
 * Implements:
 * - High-speed hardware composite (runs at native monitor refresh rate)
 * - Pure luminous condensation droplets ("first circle only", zero dark shadows, zero black trails)
 * - Anti-Hallucination Hand Tracking with 1€ Filter & 4-frame persistence
 * - Precision Pinch Writing with fine stylus nib (zero lingering outline trails)
 * - Rich Gesture Library & UI:
 *    - ✍️ Pinch: Fine stylus writing & drawing
 *    - ☝️ Pointing: Precision fingertip wipe
 *    - 🖐️ Open Palm: Broad area sweep wipe
 *    - ✊ Closed Fist: Charge ring -> Clears all fog
 *    - ✌️ Peace Sign: Frost beam -> Fogs up entire mirror
 *    - 🤟 Love You: Stamps a clear heart in the fog
 *    - 🤘 Rock On: Frost storm burst
 *    - 👍 Thumbs Up: Toggles snow droplets
 *    - 😮‍💨 Open Mouth: Pinpoint warm breath steam
 * - Fully Functional Interactive Debug Mode (skeleton, FPS, joints, mouth tracker)
 */

import { FogEngine }      from './fog.js';
import { DropletSystem }  from './droplets.js';
import { FogMirrorAudio } from './audio.js';
import { GestureEngine }  from './gestures.js';

// ─── DOM Elements ────────────────────────────────────────────────────────────
const video          = document.getElementById('webcam');
const mainCanvas     = document.getElementById('mainCanvas');
const glowCanvas     = document.getElementById('glowCanvas');
const loader         = document.getElementById('loader');
const loaderStatus   = document.getElementById('loaderStatus');
const errorOverlay   = document.getElementById('errorOverlay');
const errorTitle     = document.getElementById('errorTitle');
const errorMsg       = document.getElementById('errorMsg');
const gestureIcon    = document.getElementById('gestureIcon');
const gestureLabel   = document.getElementById('gestureLabel');
const statusDot      = document.getElementById('statusDot');
const statusText     = document.getElementById('statusText');
const fpsCounter     = document.getElementById('fpsCounter');
const hud            = document.getElementById('hud');
const btnReset       = document.getElementById('btnReset');
const btnMute        = document.getElementById('btnMute');
const btnDebug       = document.getElementById('btnDebug');

const mainCtx = mainCanvas.getContext('2d', { alpha: false });
const uiCtx   = glowCanvas.getContext('2d');

// ─── State ───────────────────────────────────────────────────────────────────
let CAM_W = 1280, CAM_H = 720;
let fog, droplets, sfx, gestures;
let debugMode        = false;
let currentLandmarks = null;
let currentMouth     = null;
let activeGesture    = { name: 'none', pinching: false, pinchMidpoint: null, velocity: 1.0 };
let hudHideTimer     = null;
let lastFrameTime    = performance.now();
let frameCount       = 0;
let fps              = 0;
let handPresent      = false;
let isBreathing      = false;
let gestureDebounce  = false;

// Stylus sparkle trail for pinch writing
let penSparkles = [];

// ─── Gesture Dictionary ──────────────────────────────────────────────────────
const GESTURE_INFO = {
    'Pointing_Up':    { icon: '☝️',  label: 'Precision Wipe' },
    'Open_Palm':      { icon: '🖐️',  label: 'Broad Sweep Wipe' },
    'Closed_Fist':    { icon: '✊',  label: 'Mirror Cleared!' },
    'charging_fist':  { icon: '✊',  label: 'Hold Fist to Clear…' },
    'Victory':        { icon: '✌️',  label: 'Mirror Fogged Up!' },
    'charging_peace': { icon: '✌️',  label: 'Hold Peace to Fog…' },
    'Love_You':       { icon: '🤟',  label: 'Heart Stamped!' },
    'charging_love':  { icon: '🤟',  label: 'Hold to Stamp Heart…' },
    'Rock_On':        { icon: '🤘',  label: 'Frost Storm Burst!' },
    'charging_rock':  { icon: '🤘',  label: 'Hold for Frost Storm…' },
    'Thumb_Up':       { icon: '👍',  label: 'Snow Droplets Toggled' },
    'pinch':          { icon: '✍️',  label: 'Pinch — Write / Draw' },
    'breath':         { icon: '😮‍💨', label: 'Warm Breath Steam' },
    'idle':           { icon: '🪞',  label: 'Mirror Ready' },
    'none':           { icon: '🪞',  label: 'Show Hand or Breathe' },
};

// ─── Camera Acquisition (Multi-Tier Resilient Fallback) ─────────────────────
async function initCamera(screenSize) {
    // Tier 1: Soft ideal constraints (no facingMode, no min frameRate constraint)
    try {
        console.log('[Camera] Tier 1: Requesting ideal 1280x720 60fps...');
        return await navigator.mediaDevices.getUserMedia({
            video: {
                width:     { ideal: 1280 },
                height:    { ideal: 720 },
                frameRate: { ideal: 60 }
            },
            audio: false
        });
    } catch (e1) {
        console.warn('[Camera] Tier 1 failed:', e1);
    }

    // Tier 2: Generic video (browser selects best default format)
    try {
        console.log('[Camera] Tier 2: Requesting generic video: true...');
        return await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
        });
    } catch (e2) {
        console.warn('[Camera] Tier 2 failed:', e2);
    }

    // Tier 3: Explicit deviceId from enumerateDevices()
    try {
        console.log('[Camera] Tier 3: Enumerating video devices...');
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevs = devices.filter(d => d.kind === 'videoinput');
        console.log('[Camera] Found video devices:', videoDevs.length);
        if (videoDevs.length > 0) {
            return await navigator.mediaDevices.getUserMedia({
                video: { deviceId: { exact: videoDevs[0].deviceId } },
                audio: false
            });
        }
    } catch (e3) {
        console.warn('[Camera] Tier 3 failed:', e3);
    }

    throw new Error('Requested camera device not found or access is blocked. Please ensure your webcam is connected and enabled.');
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
async function boot() {
    try {
        const screenSize = await window.fogMirror.getScreenSize().catch(() => ({
            width: window.screen.width, height: window.screen.height
        }));

        loaderStatus.textContent = 'Starting camera…';

        const stream = await initCamera(screenSize);

        video.srcObject = stream;
        await new Promise(r => { video.onloadedmetadata = r; });
        await video.play();

        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings ? track.getSettings() : {};
        CAM_W = settings.width  || video.videoWidth  || 1280;
        CAM_H = settings.height || video.videoHeight || 720;

        mainCanvas.width  = CAM_W;
        mainCanvas.height = CAM_H;
        glowCanvas.width  = CAM_W;
        glowCanvas.height = CAM_H;

        // Subsystems
        fog      = new FogEngine(CAM_W, CAM_H);
        droplets = new DropletSystem(CAM_W, CAM_H);
        sfx      = new FogMirrorAudio();
        sfx.startAmbient();

        loaderStatus.textContent = 'Starting Vision AI…';
        gestures = new GestureEngine({
            onReady:        handleModelReady,
            onGesture:      handleGesture,
            onNoHand:       handleNoHand,
            onBreath:       handleBreath,
            onBreathStop:   handleBreathStop,
            onError:        handleError
        });
        await gestures.init(video);

    } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            showError('Camera Access Denied',
                'Please grant camera permissions in Windows Settings → Privacy, then restart.');
        } else {
            showError('Startup Error', err.message || 'Unknown error.');
        }
        console.error('[Boot]', err);
    }
}

// ─── 60–144 FPS Render Loop (Hardware Accelerated) ───────────────────────────
function renderFrame() {
    requestAnimationFrame(renderFrame);

    frameCount++;
    const now = performance.now();
    if (now - lastFrameTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastFrameTime = now;
        fpsCounter.textContent = `FPS: ${fps}`;
    }

    // 1. Natural slow condensation
    fog.applyCondensation();

    // 2. Snow / droplet particle physics ("first circle only")
    droplets.update();
    droplets.draw();

    // 3. Crisp Mirrored Webcam Feed
    mainCtx.save();
    mainCtx.scale(-1, 1);
    mainCtx.drawImage(video, -CAM_W, 0, CAM_W, CAM_H);
    mainCtx.restore();

    // 4. Frosted Steam Condensation Overlay
    mainCtx.drawImage(fog.texture, 0, 0);

    // 5. Snow Droplets Overlay
    mainCtx.drawImage(droplets.texture, 0, 0);

    // 6. Interactive Hand Gesture UI Overlay
    renderHandUI(now);

    // 7. Fully functional interactive debug overlay
    if (debugMode) {
        drawDebugOverlay(uiCtx);
    }
}

// ─── Rich Interactive Hand Gesture UI ────────────────────────────────────────
function renderHandUI(now) {
    uiCtx.clearRect(0, 0, CAM_W, CAM_H);

    // 1. Stylus sparkles for pinch writing (smooth, fade quickly, no lingering trail)
    for (let i = penSparkles.length - 1; i >= 0; i--) {
        const sp = penSparkles[i];
        sp.alpha -= 0.08;
        sp.r     *= 0.92;
        if (sp.alpha <= 0) {
            penSparkles.splice(i, 1);
            continue;
        }
        uiCtx.beginPath();
        uiCtx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
        uiCtx.fillStyle = `rgba(56, 189, 248, ${sp.alpha * 0.9})`;
        uiCtx.fill();
    }

    if (!handPresent || !currentLandmarks) return;

    const lm = currentLandmarks;
    const g = activeGesture;

    // A. PINCH WRITING (✍️ Fine Stylus Cursor)
    if (g.pinching && g.pinchMidpoint) {
        const px = (1 - g.pinchMidpoint.x) * CAM_W;
        const py = g.pinchMidpoint.y * CAM_H;

        uiCtx.save();
        uiCtx.beginPath();
        uiCtx.arc(px, py, 6, 0, Math.PI * 2);
        uiCtx.fillStyle = '#38bdf8';
        uiCtx.shadowColor = '#0ea5e9';
        uiCtx.shadowBlur = 10;
        uiCtx.fill();

        // Stylus crosshairs
        uiCtx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        uiCtx.lineWidth = 1.5;
        uiCtx.beginPath();
        uiCtx.moveTo(px - 10, py); uiCtx.lineTo(px + 10, py);
        uiCtx.moveTo(px, py - 10); uiCtx.lineTo(px, py + 10);
        uiCtx.stroke();

        drawHandBadge(px + 20, py - 18, '✍️ Pen', '#0284c7');
        uiCtx.restore();

        if (Math.random() < 0.4) {
            penSparkles.push({
                x: px + (Math.random() - 0.5) * 4,
                y: py + (Math.random() - 0.5) * 4,
                r: 2.2 + Math.random() * 1.5,
                alpha: 1.0
            });
        }
        return;
    }

    // B. POINTING (☝️ Precision Wipe Aiming Reticle)
    if (g.name === 'Pointing_Up') {
        const tipX = (1 - lm[8].x) * CAM_W;
        const tipY = lm[8].y * CAM_H;
        const pulse = 1.0 + Math.sin(now * 0.01) * 0.10;

        uiCtx.save();
        uiCtx.beginPath();
        uiCtx.arc(tipX, tipY, 44 * pulse, 0, Math.PI * 2);
        uiCtx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
        uiCtx.lineWidth = 2.0;
        uiCtx.setLineDash([5, 4]);
        uiCtx.stroke();
        uiCtx.setLineDash([]);

        uiCtx.beginPath();
        uiCtx.arc(tipX, tipY, 5, 0, Math.PI * 2);
        uiCtx.fillStyle = '#38bdf8';
        uiCtx.shadowColor = '#38bdf8';
        uiCtx.shadowBlur = 8;
        uiCtx.fill();

        drawHandBadge(tipX + 22, tipY - 20, '☝️ Wipe', '#0284c7');
        uiCtx.restore();
        return;
    }

    // C. OPEN PALM (🖐️ Broad Sweep Wipe Ring)
    if (g.name === 'Open_Palm') {
        const palmX = (1 - lm[9].x) * CAM_W;
        const palmY = lm[9].y * CAM_H;

        uiCtx.save();
        uiCtx.beginPath();
        uiCtx.arc(palmX, palmY, 115, 0, Math.PI * 2);
        uiCtx.fillStyle = 'rgba(56, 189, 248, 0.08)';
        uiCtx.fill();
        uiCtx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
        uiCtx.lineWidth = 2.0;
        uiCtx.stroke();

        drawHandBadge(palmX, palmY - 125, '🖐️ Sweep', '#0284c7');
        uiCtx.restore();
        return;
    }

    // D. CLOSED FIST CHARGING (✊ Circular Charge Meter)
    if (g.name === 'charging_fist' || g.name === 'Closed_Fist') {
        const wristX = (1 - lm[0].x) * CAM_W;
        const wristY = lm[0].y * CAM_H;
        const progress = g.fistChargeProgress || 0;

        uiCtx.save();
        uiCtx.beginPath();
        uiCtx.arc(wristX, wristY - 30, 48, 0, Math.PI * 2);
        uiCtx.strokeStyle = 'rgba(239, 68, 68, 0.25)';
        uiCtx.lineWidth = 6;
        uiCtx.stroke();

        uiCtx.beginPath();
        uiCtx.arc(wristX, wristY - 30, 48, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        uiCtx.strokeStyle = '#ef4444';
        uiCtx.lineWidth = 6;
        uiCtx.shadowColor = '#ef4444';
        uiCtx.shadowBlur = 12;
        uiCtx.stroke();

        drawHandBadge(wristX, wristY - 95, `✊ Clear All (${Math.round(progress * 100)}%)`, '#dc2626');
        uiCtx.restore();
        return;
    }

    // E. PEACE SIGN CHARGING (✌️ Frost Crystal Beam)
    if (g.name === 'charging_peace' || g.name === 'Victory') {
        const t1X = (1 - lm[8].x) * CAM_W,  t1Y = lm[8].y * CAM_H;
        const t2X = (1 - lm[12].x) * CAM_W, t2Y = lm[12].y * CAM_H;
        const midX = (t1X + t2X) * 0.5, midY = (t1Y + t2Y) * 0.5;
        const progress = g.peaceChargeProgress || 0;

        uiCtx.save();
        uiCtx.beginPath();
        uiCtx.moveTo(t1X, t1Y);
        uiCtx.lineTo(t2X, t2Y);
        uiCtx.strokeStyle = 'rgba(186, 230, 253, 0.85)';
        uiCtx.lineWidth = 3;
        uiCtx.shadowColor = '#38bdf8';
        uiCtx.shadowBlur = 10;
        uiCtx.stroke();

        uiCtx.beginPath();
        uiCtx.arc(midX, midY, 44, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        uiCtx.strokeStyle = '#38bdf8';
        uiCtx.lineWidth = 5;
        uiCtx.stroke();

        drawHandBadge(midX, midY - 60, `✌️ Fog All (${Math.round(progress * 100)}%)`, '#0284c7');
        uiCtx.restore();
        return;
    }

    // F. LOVE YOU GESTURE (🤟 Heart Stamp)
    if (g.name === 'charging_love' || g.name === 'Love_You') {
        const palmX = (1 - lm[9].x) * CAM_W;
        const palmY = lm[9].y * CAM_H;
        const progress = g.loveChargeProgress || 0;

        uiCtx.save();
        uiCtx.beginPath();
        uiCtx.arc(palmX, palmY - 20, 46, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        uiCtx.strokeStyle = '#f43f5e';
        uiCtx.lineWidth = 5;
        uiCtx.shadowColor = '#f43f5e';
        uiCtx.shadowBlur = 10;
        uiCtx.stroke();

        drawHandBadge(palmX, palmY - 80, `🤟 Stamp Heart (${Math.round(progress * 100)}%)`, '#e11d48');
        uiCtx.restore();
        return;
    }

    // G. ROCK ON GESTURE (🤘 Frost Storm)
    if (g.name === 'charging_rock' || g.name === 'Rock_On') {
        const palmX = (1 - lm[9].x) * CAM_W;
        const palmY = lm[9].y * CAM_H;
        const progress = g.rockChargeProgress || 0;

        uiCtx.save();
        uiCtx.beginPath();
        uiCtx.arc(palmX, palmY - 20, 46, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        uiCtx.strokeStyle = '#a855f7';
        uiCtx.lineWidth = 5;
        uiCtx.shadowColor = '#a855f7';
        uiCtx.shadowBlur = 10;
        uiCtx.stroke();

        drawHandBadge(palmX, palmY - 80, `🤘 Frost Storm (${Math.round(progress * 100)}%)`, '#9333ea');
        uiCtx.restore();
        return;
    }

    // H. THUMBS UP (👍)
    if (g.name === 'Thumb_Up') {
        const thumbX = (1 - lm[4].x) * CAM_W;
        const thumbY = lm[4].y * CAM_H;
        drawHandBadge(thumbX + 30, thumbY - 10, '👍 Snow Toggled', '#10b981');
        return;
    }

    // I. IDLE HAND INDICATOR
    const palmX = (1 - lm[9].x) * CAM_W;
    const palmY = lm[9].y * CAM_H;
    uiCtx.save();
    uiCtx.beginPath();
    uiCtx.arc(palmX, palmY, 4, 0, Math.PI * 2);
    uiCtx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    uiCtx.fill();
    uiCtx.restore();
}

function drawHandBadge(x, y, text, bg = '#1e293b') {
    uiCtx.save();
    uiCtx.font = '600 13px system-ui, sans-serif';
    const metrics = uiCtx.measureText(text);
    const padX = 10, padY = 5;
    const w = metrics.width + padX * 2;
    const h = 24;

    uiCtx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    uiCtx.beginPath();
    uiCtx.roundRect(x - w / 2, y - h / 2, w, h, 12);
    uiCtx.fill();

    uiCtx.strokeStyle = bg;
    uiCtx.lineWidth = 1.5;
    uiCtx.stroke();

    uiCtx.fillStyle = '#f8fafc';
    uiCtx.textAlign = 'center';
    uiCtx.textBaseline = 'middle';
    uiCtx.fillText(text, x, y);
    uiCtx.restore();
}

// ─── Fully Functional Debug Visualizer ───────────────────────────────────────
const SKELETON_CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [5,9],[9,10],[10,11],[11,12],
    [9,13],[13,14],[14,15],[15,16],
    [13,17],[17,18],[18,19],[19,20],
    [0,17]
];

function drawDebugOverlay(ctx) {
    ctx.save();

    // 1. Hand skeleton & joints (when hand is in view)
    if (currentLandmarks) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
        ctx.lineWidth = 2;
        for (const [a, b] of SKELETON_CONNECTIONS) {
            const ax = (1 - currentLandmarks[a].x) * CAM_W, ay = currentLandmarks[a].y * CAM_H;
            const bx = (1 - currentLandmarks[b].x) * CAM_W, by = currentLandmarks[b].y * CAM_H;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
        }

        // Draw joint dots
        for (let i = 0; i < currentLandmarks.length; i++) {
            const pt = currentLandmarks[i];
            const px = (1 - pt.x) * CAM_W, py = pt.y * CAM_H;
            ctx.beginPath();
            ctx.arc(px, py, 4, 0, Math.PI * 2);
            ctx.fillStyle = (i === 8 || i === 4) ? '#f43f5e' : '#38bdf8';
            ctx.fill();
        }
    }

    // 2. Mouth tracker circle
    if (currentMouth) {
        const mx = (1 - currentMouth.mouthX) * CAM_W;
        const my = currentMouth.mouthY * CAM_H;
        ctx.beginPath();
        ctx.arc(mx, my, 22, 0, Math.PI * 2);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
        ctx.fill();

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 11px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('😮‍💨 Steam', mx, my - 28);
    }

    // 3. Always-Visible Debug Telemetry Dashboard
    ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
    ctx.roundRect(24, 24, 260, 132, 8);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`DEBUG VISION (1€ Filter)`, 36, 44);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '11px monospace';
    ctx.fillText(`FPS: ${fps} | Cam: ${CAM_W}x${CAM_H}`, 36, 64);
    ctx.fillText(`Hand: ${handPresent ? activeGesture.name : 'None (out of frame)'}`, 36, 84);
    ctx.fillText(`Pinch: ${activeGesture.pinching ? 'Active (Writing)' : 'Inactive'}`, 36, 102);
    ctx.fillText(`Breath: ${isBreathing ? 'Open (Haaaaa Steam)' : 'Idle'}`, 36, 120);
    ctx.fillText(`Speed: ${activeGesture.velocity.toFixed(2)}`, 36, 138);

    ctx.restore();
}

// ─── Gesture Handlers ────────────────────────────────────────────────────────
function handleGesture(g) {
    currentLandmarks = g.landmarks;
    activeGesture = g;
    handPresent = true;
    setStatus('active', 'Tracking hand');

    // 1. PINCH WRITING (Priority #1 — fine stylus nib, zero lingering outline)
    if (g.pinching && g.pinchMidpoint) {
        updateGestureHUD('pinch');
        fog.writeAt(g.pinchMidpoint.x, g.pinchMidpoint.y, 7.5);
        droplets.wipeAt((1 - g.pinchMidpoint.x) * CAM_W, g.pinchMidpoint.y * CAM_H, 12);
        sfx.playWipeSoft();
        return;
    }

    // 2. CLOSED FIST: Clears ALL fog instantly once confirmed
    if (g.name === 'Closed_Fist') {
        updateGestureHUD('Closed_Fist');
        fog.resetPointer();
        if (!gestureDebounce) {
            gestureDebounce = true;
            fog.clearAll();
            droplets.clearAll();
            sfx.playClearWhoosh();
            setTimeout(() => { gestureDebounce = false; }, 800);
        }
        return;
    }

    if (g.name === 'charging_fist') {
        updateGestureHUD('charging_fist');
        fog.resetPointer();
        return;
    }

    // 3. PEACE SIGN: Fogs up everything once confirmed
    if (g.name === 'Victory') {
        updateGestureHUD('Victory');
        fog.resetPointer();
        if (!gestureDebounce) {
            gestureDebounce = true;
            fog.fogUpAll();
            droplets.reset();
            sfx.playCondense();
            setTimeout(() => { gestureDebounce = false; }, 800);
        }
        return;
    }

    if (g.name === 'charging_peace') {
        updateGestureHUD('charging_peace');
        fog.resetPointer();
        return;
    }

    // 4. LOVE YOU (🤟): Stamps a clean heart shape into the fog!
    if (g.name === 'Love_You') {
        updateGestureHUD('Love_You');
        fog.resetPointer();
        if (!gestureDebounce) {
            gestureDebounce = true;
            const palm = g.landmarks[9];
            fog.stampHeart(palm.x, palm.y, 140);
            droplets.wipeAt((1 - palm.x) * CAM_W, palm.y * CAM_H, 70);
            sfx.playClearWhoosh();
            setTimeout(() => { gestureDebounce = false; }, 900);
        }
        return;
    }

    if (g.name === 'charging_love') {
        updateGestureHUD('charging_love');
        fog.resetPointer();
        return;
    }

    // 5. ROCK ON (🤘): Frost storm burst!
    if (g.name === 'Rock_On') {
        updateGestureHUD('Rock_On');
        fog.resetPointer();
        if (!gestureDebounce) {
            gestureDebounce = true;
            const palm = g.landmarks[9];
            droplets.addBreathMoisture((1 - palm.x) * CAM_W, palm.y * CAM_H, 2.0);
            fog.addBreathFog(palm.x, palm.y, 1.5);
            sfx.playCondense();
            setTimeout(() => { gestureDebounce = false; }, 800);
        }
        return;
    }

    if (g.name === 'charging_rock') {
        updateGestureHUD('charging_rock');
        fog.resetPointer();
        return;
    }

    // 6. POINTING: Precision finger wipe
    if (g.name === 'Pointing_Up') {
        updateGestureHUD('Pointing_Up');
        const tip = g.landmarks[8];
        fog.wipeAt(tip.x, tip.y, 45);
        droplets.wipeAt((1 - tip.x) * CAM_W, tip.y * CAM_H, 45);
        sfx.playWipe(g.velocity);
        return;
    }

    // 7. OPEN PALM: Broad sweep wipe
    if (g.name === 'Open_Palm') {
        updateGestureHUD('Open_Palm');
        const palm = g.landmarks[9];
        fog.wipeAt(palm.x, palm.y, 115);
        droplets.wipeAt((1 - palm.x) * CAM_W, palm.y * CAM_H, 115);
        sfx.playWipe(g.velocity * 1.3);
        return;
    }

    // 8. THUMBS UP: Toggle droplets
    if (g.name === 'Thumb_Up') {
        updateGestureHUD('Thumb_Up');
        fog.resetPointer();
        if (!gestureDebounce) {
            gestureDebounce = true;
            droplets.toggleVisibility();
            sfx.playDrip();
            setTimeout(() => { gestureDebounce = false; }, 1200);
        }
        return;
    }

    // Idle hand — do NOT wipe
    fog.resetPointer();
    if (!isBreathing) updateGestureHUD('idle');
}

function handleNoHand() {
    if (handPresent) {
        handPresent = false;
        activeGesture = { name: 'none', pinching: false, pinchMidpoint: null, velocity: 1.0 };
        fog.resetPointer();
        setStatus('ready', 'Mirror ready');
        if (!isBreathing) updateGestureHUD('none');
    }
}

// ─── Mouth Breath Steam ("Haaaaa") Handlers ──────────────────────────────────
function handleBreath({ mouthX, mouthY, intensity }) {
    isBreathing = true;
    currentMouth = { mouthX, mouthY };
    updateGestureHUD('breath');

    fog.addBreathFog(mouthX, mouthY, intensity);
    droplets.addBreathMoisture((1 - mouthX) * CAM_W, mouthY * CAM_H, intensity);
    sfx.setBreathIntensity(intensity);
}

function handleBreathStop() {
    if (isBreathing) {
        isBreathing = false;
        currentMouth = null;
        sfx.stopBreath();
        if (!handPresent) updateGestureHUD('none');
    }
}

// ─── Lifecycle Callbacks ─────────────────────────────────────────────────────
function handleModelReady() {
    loader.classList.add('fade-out');
    setTimeout(() => { loader.style.display = 'none'; }, 650);
    setStatus('ready', 'Mirror Ready');
    updateGestureHUD('none');
    renderFrame();
}

function handleError(err) {
    console.error('[VisionError]', err);
    showError('Model Error', err?.message || 'Could not start AI vision models. Please restart the app.');
}

function showError(title, msg) {
    loader.style.display = 'none';
    errorTitle.textContent = title;
    errorMsg.textContent   = msg;
    errorOverlay.classList.remove('hidden');
}

// ─── HUD UI ──────────────────────────────────────────────────────────────────
function setStatus(state, text) {
    statusDot.className = `status-dot ${state}`;
    statusText.textContent = text;
}

function updateGestureHUD(name) {
    const info = GESTURE_INFO[name] || { icon: '✨', label: name };
    gestureIcon.textContent  = info.icon;
    gestureLabel.textContent = info.label;
}

function resetHudTimer() {
    hud.classList.remove('hud-hidden');
    clearTimeout(hudHideTimer);
    hudHideTimer = setTimeout(() => {
        hud.classList.add('hud-hidden');
    }, 3500);
}

document.addEventListener('mousemove', resetHudTimer);
document.addEventListener('keydown',   resetHudTimer);

// ─── Controls ────────────────────────────────────────────────────────────────
btnReset.addEventListener('click', () => {
    fog.fogUpAll();
    sfx.playCondense();
});

btnMute.addEventListener('click', () => {
    const muted = sfx.toggleMute();
    if (muted) {
        btnMute.innerHTML = '🔇 <span>Muted</span>';
        btnMute.classList.add('active');
    } else {
        btnMute.innerHTML = '🔊 <span>Sound On</span>';
        btnMute.classList.remove('active');
    }
});

btnDebug.addEventListener('click', () => {
    debugMode = !debugMode;
    btnDebug.classList.toggle('active', debugMode);
    fpsCounter.classList.toggle('hidden', !debugMode);
});

// Keyboard shortcuts: C = clear all, F = fog all, D = toggle debug, ESC = quit
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') window.fogMirror.quit();
    if (e.key === 'c' || e.key === 'C') {
        fog.clearAll();
        droplets.clearAll();
        sfx.playClearWhoosh();
    }
    if (e.key === 'f' || e.key === 'F') {
        fog.fogUpAll();
        droplets.reset();
        sfx.playCondense();
    }
    if (e.key === 'd' || e.key === 'D') {
        debugMode = !debugMode;
        btnDebug.classList.toggle('active', debugMode);
        fpsCounter.classList.toggle('hidden', !debugMode);
    }
});

// ─── Start Application ───────────────────────────────────────────────────────
boot();
