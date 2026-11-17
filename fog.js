/**
 * fog.js — Clean Optical Steam & Condensation Engine
 *
 * Implements:
 * - Pure optical steam condensation (zero residual outline trails)
 * - Feathered transparent cutout revealing razor-sharp mirror reflection
 * - Fine-nib stylus writing mode (radius 7.5px) for smooth handwriting
 * - Heart shape stamp for Love You (🤟) gesture
 * - Pinpoint rising breath plumes ("haaaaa")
 * - Instant full clear (Closed Fist) and full fog-up (Peace sign)
 */

export class FogEngine {
    constructor(width, height) {
        this.W = width;
        this.H = height;

        // Main fog surface canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext('2d');

        // Stroke interpolation history
        this.prevX = null;
        this.prevY = null;
        this.prevPenX = null;
        this.prevPenY = null;

        this.condensationRate = 0.0014;

        this.init();
    }

    /** Generate rich, luxurious, organic steam condensation */
    init() {
        const { ctx, W, H } = this;
        ctx.globalCompositeOperation = 'source-over';

        // 1. Soft, warm frosted condensation veil
        ctx.fillStyle = 'rgba(215, 230, 245, 0.88)';
        ctx.fillRect(0, 0, W, H);

        // 2. Multi-octave organic vapor clouds (soft steam gradients)
        const clouds = 16;
        for (let i = 0; i < clouds; i++) {
            const rx = Math.random() * W;
            const ry = Math.random() * H;
            const rad = Math.min(W, H) * (0.22 + Math.random() * 0.38);
            const grad = ctx.createRadialGradient(rx, ry, rad * 0.05, rx, ry, rad);
            const a = 0.04 + Math.random() * 0.05;
            grad.addColorStop(0,   `rgba(245, 250, 255, ${a * 1.5})`);
            grad.addColorStop(0.5, `rgba(220, 235, 248, ${a})`);
            grad.addColorStop(1,   'rgba(210, 228, 244, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(rx, ry, rad, 0, Math.PI * 2);
            ctx.fill();
        }

        // 3. Dense perimeter bevel vignette (condensation pools along mirror edges)
        const cx = W / 2, cy = H / 2;
        const outerR = Math.hypot(cx, cy) * 0.98;
        const vig = ctx.createRadialGradient(cx, cy, outerR * 0.25, cx, cy, outerR);
        vig.addColorStop(0,   'rgba(0,0,0,0)');
        vig.addColorStop(0.7, 'rgba(215, 230, 245, 0.08)');
        vig.addColorStop(1,   'rgba(200, 222, 242, 0.30)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, W, H);
    }

    /**
     * Standard finger / palm wipe.
     * Normalized coordinate nx is mirrored: (1 - nx) * W.
     * ZERO residual outline trails!
     */
    wipeAt(nx, ny, radius) {
        const x = (1 - nx) * this.W;
        const y = ny * this.H;

        this._renderWipeCutout(x, y, radius);

        // Continuous stroke interpolation
        if (this.prevX !== null) {
            const dist = Math.hypot(x - this.prevX, y - this.prevY);
            const steps = Math.ceil(dist / (radius * 0.30));
            for (let i = 1; i < steps; i++) {
                const t = i / steps;
                this._renderWipeCutout(
                    this.prevX + (x - this.prevX) * t,
                    this.prevY + (y - this.prevY) * t,
                    radius
                );
            }
        }
        this.prevX = x;
        this.prevY = y;
    }

    _renderWipeCutout(x, y, radius) {
        const { ctx } = this;
        ctx.globalCompositeOperation = 'destination-out';
        const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        grad.addColorStop(0,    'rgba(0,0,0,1.0)');
        grad.addColorStop(0.72, 'rgba(0,0,0,0.92)');
        grad.addColorStop(0.92, 'rgba(0,0,0,0.45)');
        grad.addColorStop(1,    'rgba(0,0,0,0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
    }

    /**
     * Precision Pinch Writing / Drawing Mode (Fine Stylus Nib)
     * Smooth quadratic curves without any residual outline boxes or trailing junk.
     */
    writeAt(nx, ny, radius = 7.5) {
        const x = (1 - nx) * this.W;
        const y = ny * this.H;
        const { ctx } = this;

        ctx.globalCompositeOperation = 'destination-out';

        if (this.prevPenX !== null) {
            const midX = (this.prevPenX + x) * 0.5;
            const midY = (this.prevPenY + y) * 0.5;

            ctx.lineWidth = radius * 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = 'rgba(0, 0, 0, 1.0)';

            ctx.beginPath();
            ctx.moveTo(this.prevPenX, this.prevPenY);
            ctx.quadraticCurveTo(this.prevPenX, this.prevPenY, midX, midY);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(midX, midY);
            ctx.quadraticCurveTo(x, y, x, y);
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 0, 0, 1.0)';
            ctx.fill();
        }

        ctx.globalCompositeOperation = 'source-over';

        this.prevPenX = x;
        this.prevPenY = y;
    }

    /**
     * 🤟 Stamp a clean, clear Heart into the fog
     */
    stampHeart(nx, ny, size = 110) {
        const x = (1 - nx) * this.W;
        const y = ny * this.H;
        const { ctx } = this;

        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.translate(x, y - size * 0.2);

        ctx.beginPath();
        const topCurveHeight = size * 0.3;
        ctx.moveTo(0, topCurveHeight);
        // top left curve
        ctx.bezierCurveTo(0, 0, -size / 2, 0, -size / 2, topCurveHeight);
        // bottom left curve
        ctx.bezierCurveTo(-size / 2, (size + topCurveHeight) / 2, 0, (size + topCurveHeight) / 1.4, 0, size);
        // bottom right curve
        ctx.bezierCurveTo(0, (size + topCurveHeight) / 1.4, size / 2, (size + topCurveHeight) / 2, size / 2, topCurveHeight);
        // top right curve
        ctx.bezierCurveTo(size / 2, 0, 0, 0, 0, topCurveHeight);
        ctx.closePath();

        ctx.fillStyle = 'rgba(0, 0, 0, 1.0)';
        ctx.fill();
        ctx.restore();
    }

    resetPointer() {
        this.prevX = null;
        this.prevY = null;
        this.prevPenX = null;
        this.prevPenY = null;
    }

    /**
     * 🗣️ Warm Breath Steam ("Haaaaa")
     */
    addBreathFog(mouthNx, mouthNy, intensity = 1.0) {
        const { ctx, W, H } = this;
        ctx.globalCompositeOperation = 'source-over';

        const mx = (1 - mouthNx) * W;
        const my = mouthNy * H;
        const radius = Math.min(135, 65 + intensity * 65);

        for (let i = 0; i < 2; i++) {
            const ox = (Math.random() - 0.5) * radius * 0.45;
            const oy = -8 - Math.random() * 22;
            const puffR = radius * (0.65 + Math.random() * 0.45);

            const grad = ctx.createRadialGradient(mx + ox, my + oy, 0, mx + ox, my + oy, puffR);
            const alpha = 0.075 * intensity;
            grad.addColorStop(0,   `rgba(245, 250, 255, ${alpha * 1.8})`);
            grad.addColorStop(0.4, `rgba(225, 238, 248, ${alpha * 1.2})`);
            grad.addColorStop(0.8, `rgba(215, 230, 244, ${alpha * 0.35})`);
            grad.addColorStop(1,   'rgba(215, 230, 244, 0)');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(mx + ox, my + oy, puffR, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /** ✊ Fist Gesture: Clears ALL fog instantly */
    clearAll() {
        const { ctx, W, H } = this;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0, 0, 0, 1.0)';
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
        this.resetPointer();
    }

    /** ✌️ Peace Sign: Fogs up the entire mirror */
    fogUpAll() {
        this.init();
        this.resetPointer();
    }

    /** Natural atmospheric re-condensation over time */
    applyCondensation() {
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = `rgba(215, 230, 245, ${this.condensationRate})`;
        this.ctx.fillRect(0, 0, this.W, this.H);
    }

    get texture() {
        return this.canvas;
    }
}
