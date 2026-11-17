/**
 * audio.js — High-Fidelity ASMR Procedural Audio Engine
 *
 * Implements physically-modeled acoustics:
 * - Soothing moist glass wiping (velvety pink-noise friction, zero harsh screech)
 * - Delicate stylus chalk/pen friction for pinch writing
 * - Authentic resonant bubble water droplet acoustics (Minnaert cavity physics)
 * - Multi-formant human warm breath steam ("haaaaa")
 * - Deep resonant squeegee whoosh for fist clear
 * - Soft steam condensation hiss
 */

export class FogMirrorAudio {
    constructor() {
        this.ctx = null;
        this.muted = false;

        // Continuous smooth wipe synth
        this._wipeGain = null;
        this._wipeFilter = null;
        this._wipeSource = null;
        this._isWiping = false;
        this._wipeFadeTimer = null;

        // Persistent breath synth
        this._breathSource = null;
        this._breathGain = null;
        this._breathF1 = null;
        this._breathF2 = null;
        this._isBreathing = false;

        // Droplet throttle
        this._lastDropTime = 0;
    }

    _init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    startAmbient() {
        // Soft ambient room tone (optional, keep ready)
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.muted && this.ctx) {
            this.stopWipe();
            this.stopBreath();
        }
        return this.muted;
    }

    // ─── Continuous Smooth ASMR Wipe Friction ────────────────────────────────
    playWipe(speed = 1.0) {
        if (this.muted) return;
        this._init();

        const now = this.ctx.currentTime;
        const normalizedSpeed = Math.max(0.2, Math.min(3.0, speed));

        if (!this._isWiping) {
            this._startWipeNodes();
        }

        // Target parameters scale gently with hand velocity
        // Low cutoff frequency (400 - 850 Hz) ensures warm, soothing rubber-on-glass friction
        const targetCutoff = 380 + normalizedSpeed * 340;
        const targetGain   = Math.min(0.18, 0.04 + normalizedSpeed * 0.06);

        if (this._wipeFilter) {
            this._wipeFilter.frequency.setTargetAtTime(targetCutoff, now, 0.04);
        }
        if (this._wipeGain) {
            this._wipeGain.gain.setTargetAtTime(targetGain, now, 0.04);
        }

        clearTimeout(this._wipeFadeTimer);
        this._wipeFadeTimer = setTimeout(() => {
            this.stopWipe();
        }, 110);
    }

    _startWipeNodes() {
        this._isWiping = true;
        const now = this.ctx.currentTime;

        // High quality pink noise buffer (2 seconds loop)
        const bufferSize = this.ctx.sampleRate * 2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
            b6 = white * 0.115926;
        }

        this._wipeSource = this.ctx.createBufferSource();
        this._wipeSource.buffer = buffer;
        this._wipeSource.loop = true;

        this._wipeFilter = this.ctx.createBiquadFilter();
        this._wipeFilter.type = 'lowpass';
        this._wipeFilter.frequency.setValueAtTime(450, now);
        this._wipeFilter.Q.value = 0.7; // Soft natural roll-off

        this._wipeGain = this.ctx.createGain();
        this._wipeGain.gain.setValueAtTime(0.001, now);
        this._wipeGain.gain.linearRampToValueAtTime(0.06, now + 0.03);

        this._wipeSource.connect(this._wipeFilter);
        this._wipeFilter.connect(this._wipeGain);
        this._wipeGain.connect(this.ctx.destination);

        this._wipeSource.start(now);
    }

    stopWipe() {
        if (!this._isWiping) return;
        this._isWiping = false;
        if (this._wipeGain && this.ctx) {
            const now = this.ctx.currentTime;
            this._wipeGain.gain.setTargetAtTime(0.0001, now, 0.05);
            setTimeout(() => {
                if (this._wipeSource) {
                    try { this._wipeSource.stop(); } catch (e) {}
                    this._wipeSource = null;
                }
            }, 80);
        }
    }

    // ─── Delicate Pinch Writing Pen Nib Friction ──────────────────────────────
    playWipeSoft() {
        if (this.muted) return;
        this._init();
        const now = this.ctx.currentTime;
        const duration = 0.06;

        // Very quiet micro-texture
        const bufferSize = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.2;

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 850;
        filter.Q.value = 1.2;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.03, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(now);
        noise.stop(now + duration);
    }

    // ─── Physical Acoustic Water Droplet (Minnaert Cavity Bubble) ─────────────
    playDrip() {
        if (this.muted) return;
        const nowMs = performance.now();
        if (nowMs - this._lastDropTime < 140) return; // prevent spam
        this._lastDropTime = nowMs;

        this._init();
        const now = this.ctx.currentTime;

        // Base bubble frequency (randomized 750 - 1100 Hz)
        const baseFreq = 720 + Math.random() * 320;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        // Minnaert acoustic bubble pitch rises slightly on detachment
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.35, now + 0.06);

        // Warm exponential decay
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.13);
    }

    // ─── Squeegee Fist Clear Whoosh ───────────────────────────────────────────
    playClearWhoosh() {
        if (this.muted) return;
        this._init();
        const now = this.ctx.currentTime;
        const duration = 0.50;

        // Deep warm whoosh (lowpass filter sweep)
        const sampleRate = this.ctx.sampleRate;
        const bufferSize = Math.floor(sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, now);
        filter.frequency.exponentialRampToValueAtTime(180, now + duration);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.24, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(now);
        noise.stop(now + duration);
    }

    // ─── Peace Sign Steam Wave ───────────────────────────────────────────────
    playCondense() {
        if (this.muted) return;
        this._init();
        const now = this.ctx.currentTime;
        const duration = 0.65;

        const sampleRate = this.ctx.sampleRate;
        const bufferSize = Math.floor(sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
        const data = buffer.getChannelData(0);
        let b0=0, b1=0, b2=0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99 * b0 + white * 0.08;
            b1 = 0.95 * b1 + white * 0.12;
            b2 = 0.85 * b2 + white * 0.25;
            data[i] = (b0 + b1 + b2) * 0.2;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(250, now);
        filter.frequency.exponentialRampToValueAtTime(950, now + duration * 0.35);
        filter.frequency.exponentialRampToValueAtTime(200, now + duration);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.18, now + 0.14);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(now);
        noise.stop(now + duration);
    }

    // ─── Multi-Formant Warm Breath Exhalation ("Haaaaa") ──────────────────────
    setBreathIntensity(intensity) {
        if (this.muted || intensity <= 0.04) {
            this.stopBreath();
            return;
        }
        this._init();

        if (!this._isBreathing) {
            this._startBreathNodes();
        }

        const now = this.ctx.currentTime;
        const targetGain = Math.min(0.20, intensity * 0.20);

        if (this._breathGain) {
            this._breathGain.gain.setTargetAtTime(targetGain, now, 0.08);
        }
    }

    _startBreathNodes() {
        this._isBreathing = true;
        const now = this.ctx.currentTime;

        // Pink noise generator for breath
        const bufferSize = this.ctx.sampleRate * 2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let b0=0, b1=0, b2=0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99 * b0 + white * 0.07;
            b1 = 0.95 * b1 + white * 0.11;
            b2 = 0.85 * b2 + white * 0.22;
            data[i] = (b0 + b1 + b2) * 0.15;
        }

        this._breathSource = this.ctx.createBufferSource();
        this._breathSource.buffer = buffer;
        this._breathSource.loop = true;

        // Formant 1: Oral cavity resonance ~550 Hz
        this._breathF1 = this.ctx.createBiquadFilter();
        this._breathF1.type = 'bandpass';
        this._breathF1.frequency.value = 520;
        this._breathF1.Q.value = 1.4;

        // Formant 2: Pharyngeal resonance ~1250 Hz
        this._breathF2 = this.ctx.createBiquadFilter();
        this._breathF2.type = 'bandpass';
        this._breathF2.frequency.value = 1200;
        this._breathF2.Q.value = 1.8;

        this._breathGain = this.ctx.createGain();
        this._breathGain.gain.setValueAtTime(0.001, now);

        this._breathSource.connect(this._breathF1);
        this._breathSource.connect(this._breathF2);
        this._breathF1.connect(this._breathGain);
        this._breathF2.connect(this._breathGain);
        this._breathGain.connect(this.ctx.destination);

        this._breathSource.start(now);
    }

    stopBreath() {
        if (!this._isBreathing) return;
        this._isBreathing = false;
        if (this._breathGain && this.ctx) {
            const now = this.ctx.currentTime;
            this._breathGain.gain.setTargetAtTime(0.0001, now, 0.08);
            setTimeout(() => {
                if (this._breathSource) {
                    try { this._breathSource.stop(); } catch (e) {}
                    this._breathSource = null;
                }
            }, 120);
        }
    }
}
