/**
 * gestures.js — High-Performance, Rock-Solid Gesture Engine
 *
 * Implements:
 * 1. 480x270 downscaled inference canvas (blazingly fast 45+ FPS vision AI)
 * 2. 1€ (One Euro) adaptive jitter filter for buttery-smooth joint tracking
 * 3. 4-frame tracking memory / hysteresis (no flickering on motion blur)
 * 4. Pinch hysteresis: never drops out while writing, never misclassifies as fist
 * 5. Robust geometric classification (Index, Palm, Fist, Peace, Love, Rock, Thumb)
 * 6. Facial Mouth-Aspect-Ratio (MAR) breath tracking
 */

class OneEuroFilter1D {
    constructor(minCutoff = 1.2, beta = 0.008, dCutoff = 1.0) {
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;
        this.xPrev = null;
        this.dxPrev = 0;
        this.tPrev = null;
    }

    filter(x, t) {
        if (this.tPrev === null) {
            this.xPrev = x;
            this.dxPrev = 0;
            this.tPrev = t;
            return x;
        }

        const dt = Math.max(0.001, (t - this.tPrev) / 1000);
        this.tPrev = t;

        const dx = (x - this.xPrev) / dt;
        const edx = this._lowpass(dx, this.dxPrev, this._alpha(this.dCutoff, dt));
        this.dxPrev = edx;

        const cutoff = this.minCutoff + this.beta * Math.abs(edx);
        const filtered = this._lowpass(x, this.xPrev, this._alpha(cutoff, dt));
        this.xPrev = filtered;
        return filtered;
    }

    _alpha(cutoff, dt) {
        const tau = 1.0 / (2 * Math.PI * cutoff);
        return 1.0 / (1.0 + tau / dt);
    }

    _lowpass(curr, prev, alpha) {
        return alpha * curr + (1 - alpha) * prev;
    }

    reset() {
        this.xPrev = null;
        this.dxPrev = 0;
        this.tPrev = null;
    }
}

class LandmarkFilter3D {
    constructor() {
        this.fx = new OneEuroFilter1D(1.2, 0.008, 1.0);
        this.fy = new OneEuroFilter1D(1.2, 0.008, 1.0);
        this.fz = new OneEuroFilter1D(1.2, 0.008, 1.0);
    }
    filter(pt, t) {
        return {
            x: this.fx.filter(pt.x, t),
            y: this.fy.filter(pt.y, t),
            z: this.fz.filter(pt.z ?? 0, t)
        };
    }
    reset() {
        this.fx.reset();
        this.fy.reset();
        this.fz.reset();
    }
}

export class GestureEngine {
    constructor({ onGesture, onNoHand, onBreath, onBreathStop, onReady, onError }) {
        this.onGesture = onGesture;
        this.onNoHand = onNoHand;
        this.onBreath = onBreath;
        this.onBreathStop = onBreathStop;
        this.onReady = onReady;
        this.onError = onError;

        this.handLandmarker = null;
        this.faceLandmarker = null;
        this.video = null;
        this.lastTimestamp = 0;
        this.lastVideoTime = -1;
        this._running = false;
        this._inferencePending = false;

        // Dedicated 480x270 downscaled inference canvas (avoids raw 1080p WebGL stalls)
        this.inferCanvas = document.createElement('canvas');
        this.inferCanvas.width = 480;
        this.inferCanvas.height = 270;
        this.inferCtx = this.inferCanvas.getContext('2d', { willReadFrequently: true });

        // 21 One-Euro filters for smooth joints
        this._filters = Array.from({ length: 21 }, () => new LandmarkFilter3D());

        // Velocity tracking
        this._lastPos = null;
        this._lastPosTime = performance.now();
        this._currentVelocity = 1.0;

        // Tracking persistence memory
        this._missedFrames = 0;
        this._lastValidLandmarks = null;

        // Pinch state hysteresis
        this._isCurrentlyPinching = false;

        // Timers for hold-to-activate gestures
        this._fistHoldStart = null;
        this._peaceHoldStart = null;
        this._rockHoldStart = null;
        this._loveHoldStart = null;
        this._history = [];

        // Face & Breath state
        this._frameSkip = 0;
        this._isMouthOpen = false;
        this._mouthOpenFrames = 0;
    }

    async init(video) {
        this.video = video;
        try {
            // 1. Ensure MediaPipe vision bundle is loaded
            let visionBundle = window.mediapipeVision;
            if (!visionBundle) {
                try {
                    visionBundle = await import('./vendor/vision_bundle.mjs');
                    window.mediapipeVision = visionBundle;
                } catch (e1) {
                    console.warn('[GestureEngine] Local vision bundle load failed, trying CDN...', e1);
                    try {
                        visionBundle = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/+esm');
                        window.mediapipeVision = visionBundle;
                    } catch (e2) {
                        throw new Error('Failed to load MediaPipe vision bundle: ' + (e1.message || e1));
                    }
                }
            }

            const { FilesetResolver, HandLandmarker, FaceLandmarker, GestureRecognizer } = visionBundle;

            // 2. Resolve WASM assets
            let vision;
            try {
                vision = await FilesetResolver.forVisionTasks('./vendor/wasm');
            } catch (wasmErr) {
                console.warn('[GestureEngine] Local WASM failed, falling back to CDN...', wasmErr);
                vision = await FilesetResolver.forVisionTasks(
                    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
                );
            }

            // 3. Initialize Hand Landmarker with multi-tier fallback:
            // Tier A: HandLandmarker GPU
            // Tier B: HandLandmarker CPU
            // Tier C: GestureRecognizer CPU
            let handLoaded = false;

            try {
                this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: './vendor/models/hand_landmarker.task',
                        delegate: 'GPU'
                    },
                    runningMode: 'VIDEO',
                    numHands: 1,
                    minHandDetectionConfidence: 0.50,
                    minHandPresenceConfidence: 0.50,
                    minTrackingConfidence: 0.50
                });
                handLoaded = true;
                console.log('[GestureEngine] HandLandmarker (GPU) initialized successfully');
            } catch (gpuErr) {
                console.warn('[GestureEngine] HandLandmarker GPU failed, falling back to CPU...', gpuErr);
            }

            if (!handLoaded) {
                try {
                    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
                        baseOptions: {
                            modelAssetPath: './vendor/models/hand_landmarker.task',
                            delegate: 'CPU'
                        },
                        runningMode: 'VIDEO',
                        numHands: 1,
                        minHandDetectionConfidence: 0.50,
                        minHandPresenceConfidence: 0.50,
                        minTrackingConfidence: 0.50
                    });
                    handLoaded = true;
                    console.log('[GestureEngine] HandLandmarker (CPU) initialized successfully');
                } catch (cpuErr) {
                    console.warn('[GestureEngine] HandLandmarker CPU failed, trying GestureRecognizer...', cpuErr);
                }
            }

            if (!handLoaded && GestureRecognizer) {
                try {
                    this.handLandmarker = await GestureRecognizer.createFromOptions(vision, {
                        baseOptions: {
                            modelAssetPath: './vendor/models/gesture_recognizer.task',
                            delegate: 'CPU'
                        },
                        runningMode: 'VIDEO',
                        numHands: 1
                    });
                    handLoaded = true;
                    console.log('[GestureEngine] GestureRecognizer fallback initialized successfully');
                } catch (recogErr) {
                    console.error('[GestureEngine] GestureRecognizer fallback also failed:', recogErr);
                }
            }

            if (!handLoaded) {
                throw new Error('Could not load Hand Vision model on GPU or CPU.');
            }

            // 4. Initialize Face Landmarker (non-blocking: never crashes app if face model fails)
            try {
                this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: './vendor/models/face_landmarker.task',
                        delegate: 'GPU'
                    },
                    runningMode: 'VIDEO',
                    numFaces: 1,
                    minFaceDetectionConfidence: 0.45,
                    minFacePresenceConfidence: 0.45,
                    minTrackingConfidence: 0.45
                });
                console.log('[GestureEngine] FaceLandmarker (GPU) initialized successfully');
            } catch (faceGpuErr) {
                try {
                    this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
                        baseOptions: {
                            modelAssetPath: './vendor/models/face_landmarker.task',
                            delegate: 'CPU'
                        },
                        runningMode: 'VIDEO',
                        numFaces: 1
                    });
                    console.log('[GestureEngine] FaceLandmarker (CPU) initialized successfully');
                } catch (faceErr) {
                    console.warn('[GestureEngine] FaceLandmarker unavailable, mouth breath disabled:', faceErr);
                    this.faceLandmarker = null;
                }
            }

            this.onReady?.();
            this._running = true;
            this._scheduleInference();
        } catch (err) {
            console.error('[GestureEngine] Initialization error:', err);
            this.onError?.(err);
        }
    }

    _scheduleInference() {
        if (!this._running) return;

        const loop = async () => {
            if (!this._running) return;
            if (this.video && this.video.readyState >= 2 && !this._inferencePending) {
                // Only process when video has produced a new frame
                if (this.video.currentTime !== this.lastVideoTime) {
                    this.lastVideoTime = this.video.currentTime;
                    this._inferencePending = true;

                    try {
                        const now = Math.max(performance.now(), this.lastTimestamp + 1);
                        this.lastTimestamp = now;

                        // Maintain aspect ratio in 480px width
                        const vw = this.video.videoWidth || 1280;
                        const vh = this.video.videoHeight || 720;
                        const targetW = 480;
                        const targetH = Math.round(targetW * (vh / vw));
                        if (this.inferCanvas.width !== targetW || this.inferCanvas.height !== targetH) {
                            this.inferCanvas.width = targetW;
                            this.inferCanvas.height = targetH;
                        }

                        this.inferCtx.drawImage(this.video, 0, 0, targetW, targetH);

                        // Hand tracking every frame
                        if (this.handLandmarker) {
                            const handResult = this.handLandmarker.detectForVideo(this.inferCanvas, now);
                            this._processHandResult(handResult, now);
                        }

                        // Face tracking every 2nd frame
                        this._frameSkip++;
                        if (this.faceLandmarker && (this._frameSkip % 2 === 0)) {
                            const faceResult = this.faceLandmarker.detectForVideo(this.inferCanvas, now);
                            this._processFaceResult(faceResult);
                        }
                    } catch (e) {
                        console.warn('[GestureEngine loop]', e);
                    } finally {
                        this._inferencePending = false;
                    }
                }
            }
            setTimeout(loop, 22); // ~45 FPS inference ticker
        };

        loop();
    }

    _processHandResult(result, now) {
        let raw = null;

        if (result.landmarks?.length) {
            raw = result.landmarks[0];
            this._missedFrames = 0;
            this._lastValidLandmarks = raw;
        } else if (this._missedFrames < 4 && this._lastValidLandmarks) {
            // Persist hand across momentary camera drops
            this._missedFrames++;
            raw = this._lastValidLandmarks;
        } else {
            this.onNoHand?.();
            this._filters.forEach(f => f.reset());
            this._lastPos = null;
            this._history = [];
            this._fistHoldStart = null;
            this._peaceHoldStart = null;
            this._rockHoldStart = null;
            this._loveHoldStart = null;
            this._isCurrentlyPinching = false;
            return;
        }

        // Apply 1€ filter for jitter-free tracking
        const lm = raw.map((pt, i) => this._filters[i].filter(pt, now));

        // Velocity tracking based on index tip
        const curTip = lm[8];
        if (this._lastPos) {
            const dt = Math.max(16, now - this._lastPosTime);
            const dist = Math.hypot(curTip.x - this._lastPos.x, curTip.y - this._lastPos.y);
            const rawSpeed = (dist / (dt / 1000)) * 3.0;
            this._currentVelocity = this._currentVelocity * 0.7 + rawSpeed * 0.3;
        }
        this._lastPos = { x: curTip.x, y: curTip.y };
        this._lastPosTime = now;

        // ── ROBUST FINGER EXTENSION GEOMETRY ─────────────────────────────────
        // Wrist is landmark 0
        const wrist = lm[0];
        const distW = (idx) => Math.hypot(lm[idx].x - wrist.x, lm[idx].y - wrist.y);

        // A finger is extended when its tip is farther from the wrist than its PIP knuckle
        const isIndexExt  = distW(8)  > distW(6)  * 1.12;
        const isMiddleExt = distW(12) > distW(10) * 1.12;
        const isRingExt   = distW(16) > distW(14) * 1.12;
        const isPinkyExt  = distW(20) > distW(18) * 1.12;

        // Thumb extension: distance from Thumb tip (4) to Pinky MCP (17)
        const thumbSpan = Math.hypot(lm[4].x - lm[17].x, lm[4].y - lm[17].y);
        const isThumbExt = thumbSpan > 0.16;

        // Distance from thumb tip (4) to index tip (8)
        const pinchDist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);

        // Pinch hysteresis (enter at 0.052, exit at 0.082)
        if (!this._isCurrentlyPinching && pinchDist < 0.052) {
            this._isCurrentlyPinching = true;
        } else if (this._isCurrentlyPinching && pinchDist > 0.082) {
            this._isCurrentlyPinching = false;
        }

        const numFingersUp = (isIndexExt ? 1 : 0) +
                             (isMiddleExt ? 1 : 0) +
                             (isRingExt ? 1 : 0) +
                             (isPinkyExt ? 1 : 0);

        let gestureType = 'idle';
        let isPinching = false;
        let pinchMidpoint = null;
        let fistChargeProgress = 0;
        let peaceChargeProgress = 0;
        let rockChargeProgress = 0;
        let loveChargeProgress = 0;

        // ── 1. PINCH WRITING (PRIORITY #1): Never triggers fist! ────────────
        if (this._isCurrentlyPinching) {
            isPinching = true;
            gestureType = 'pinch';
            pinchMidpoint = {
                x: (lm[4].x + lm[8].x) * 0.5,
                y: (lm[4].y + lm[8].y) * 0.5
            };
            this._resetChargeTimers();
        }
        // ── 2. CLOSED FIST: 0 fingers extended, not pinching ────────────────
        else if (numFingersUp === 0 && !this._isCurrentlyPinching) {
            if (!this._fistHoldStart) this._fistHoldStart = now;
            fistChargeProgress = Math.min(1.0, (now - this._fistHoldStart) / 220);
            gestureType = fistChargeProgress >= 1.0 ? 'Closed_Fist' : 'charging_fist';
            this._peaceHoldStart = null;
            this._rockHoldStart = null;
            this._loveHoldStart = null;
        }
        // ── 3. LOVE YOU (🤟): Thumb + Index + Pinky extended, Middle & Ring curled
        else if (isThumbExt && isIndexExt && !isMiddleExt && !isRingExt && isPinkyExt) {
            if (!this._loveHoldStart) this._loveHoldStart = now;
            loveChargeProgress = Math.min(1.0, (now - this._loveHoldStart) / 220);
            gestureType = loveChargeProgress >= 1.0 ? 'Love_You' : 'charging_love';
            this._fistHoldStart = null;
            this._peaceHoldStart = null;
            this._rockHoldStart = null;
        }
        // ── 4. ROCK ON (🤘): Index + Pinky extended, Middle & Ring curled ────
        else if (!isThumbExt && isIndexExt && !isMiddleExt && !isRingExt && isPinkyExt) {
            if (!this._rockHoldStart) this._rockHoldStart = now;
            rockChargeProgress = Math.min(1.0, (now - this._rockHoldStart) / 220);
            gestureType = rockChargeProgress >= 1.0 ? 'Rock_On' : 'charging_rock';
            this._fistHoldStart = null;
            this._peaceHoldStart = null;
            this._loveHoldStart = null;
        }
        // ── 5. PEACE SIGN (✌️): Index + Middle extended, Ring & Pinky curled ──
        else if (isIndexExt && isMiddleExt && !isRingExt && !isPinkyExt) {
            if (!this._peaceHoldStart) this._peaceHoldStart = now;
            peaceChargeProgress = Math.min(1.0, (now - this._peaceHoldStart) / 220);
            gestureType = peaceChargeProgress >= 1.0 ? 'Victory' : 'charging_peace';
            this._fistHoldStart = null;
            this._rockHoldStart = null;
            this._loveHoldStart = null;
        }
        // ── 6. POINTING (☝️): Only Index extended ───────────────────────────
        else if (isIndexExt && !isMiddleExt && !isRingExt && !isPinkyExt) {
            gestureType = 'Pointing_Up';
            this._resetChargeTimers();
        }
        // ── 7. THUMBS UP (👍): Thumb extended up, other 4 fingers curled ────
        else if (isThumbExt && numFingersUp === 0 && lm[4].y < lm[2].y) {
            gestureType = 'Thumb_Up';
            this._resetChargeTimers();
        }
        // ── 8. OPEN PALM (🖐️): 3 or more fingers wide open ─────────────────
        else if (numFingersUp >= 3) {
            gestureType = 'Open_Palm';
            this._resetChargeTimers();
        } else {
            this._resetChargeTimers();
        }

        // Temporal filter (stabilization)
        this._history.push(gestureType);
        if (this._history.length > 3) this._history.shift();

        const counts = {};
        for (const g of this._history) counts[g] = (counts[g] || 0) + 1;

        let stable = gestureType;
        for (const [g, count] of Object.entries(counts)) {
            if (count >= 2) {
                stable = g;
                break;
            }
        }

        this.onGesture?.({
            name: stable,
            landmarks: lm,
            pinching: isPinching,
            pinchMidpoint: pinchMidpoint,
            fistChargeProgress: fistChargeProgress,
            peaceChargeProgress: peaceChargeProgress,
            rockChargeProgress: rockChargeProgress,
            loveChargeProgress: loveChargeProgress,
            velocity: Math.max(0.6, Math.min(3.5, this._currentVelocity))
        });
    }

    _resetChargeTimers() {
        this._fistHoldStart = null;
        this._peaceHoldStart = null;
        this._rockHoldStart = null;
        this._loveHoldStart = null;
    }

    _processFaceResult(faceResult) {
        if (!faceResult.faceLandmarks?.length) {
            if (this._isMouthOpen) {
                this._isMouthOpen = false;
                this._mouthOpenFrames = 0;
                this.onBreathStop?.();
            }
            return;
        }

        const lm = faceResult.faceLandmarks[0];
        const upperLip   = lm[13];
        const lowerLip   = lm[14];
        const mouthLeft  = lm[61];
        const mouthRight = lm[291];

        const mouthHeight = Math.hypot(upperLip.x - lowerLip.x, upperLip.y - lowerLip.y);
        const mouthWidth  = Math.hypot(mouthLeft.x - mouthRight.x, mouthLeft.y - mouthRight.y);

        const mar = mouthHeight / Math.max(0.001, mouthWidth);

        if (mar > 0.32) {
            this._mouthOpenFrames++;
            if (this._mouthOpenFrames >= 2) {
                this._isMouthOpen = true;
                const intensity = Math.min(1.0, (mar - 0.32) / 0.35);
                const mouthX = (upperLip.x + lowerLip.x) * 0.5;
                const mouthY = (upperLip.y + lowerLip.y) * 0.5;
                this.onBreath?.({ mouthX, mouthY, intensity });
            }
        } else {
            this._mouthOpenFrames = 0;
            if (this._isMouthOpen) {
                this._isMouthOpen = false;
                this.onBreathStop?.();
            }
        }
    }

    stop() {
        this._running = false;
    }
}
