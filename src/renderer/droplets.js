/**
 * droplets.js — Pure Luminous Condensation Droplets ("Snow" / Beads)
 *
 * "First circle only":
 * - Pure bright translucent circular condensation beads with specular highlights
 * - Zero dark shadows, zero black streaks/trails
 * - Smooth vertical drip & gentle drift
 * - Immediate wipe clearing with hands & breath condensation
 */

export class DropletSystem {
    constructor(width, height) {
        this.W = width;
        this.H = height;
        this.visible = true;
        this.droplets = [];

        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext('2d');

        this._spawn();
    }

    _spawn() {
        this.droplets = [];
        const count = Math.min(220, Math.floor((this.W * this.H) / 3600));
        for (let i = 0; i < count; i++) {
            this.droplets.push(this._newDroplet());
        }
    }

    _newDroplet(x, y, r) {
        const radius = r ?? (1.2 + Math.random() * 3.2);
        return {
            x: x ?? Math.random() * this.W,
            y: y ?? Math.random() * this.H,
            r: radius,
            alpha: 0.40 + Math.random() * 0.50,
            vy: radius > 2.8 ? (0.02 + Math.random() * 0.05) * (radius / 2.5) : 0,
            driftPhase: Math.random() * Math.PI * 2,
        };
    }

    wipeAt(mirroredX, y, radius) {
        const rSq = radius * radius;
        this.droplets = this.droplets.filter(d => {
            const dx = d.x - mirroredX;
            const dy = d.y - y;
            return (dx * dx + dy * dy) > rSq;
        });
    }

    addBreathMoisture(mirroredMouthX, mouthY, intensity) {
        const count = Math.floor(6 * intensity);
        const spread = 80 + intensity * 50;
        for (let i = 0; i < count; i++) {
            if (this.droplets.length > 300) break;
            const ang = Math.random() * Math.PI * 2;
            const dist = Math.random() * spread;
            const bx = mirroredMouthX + Math.cos(ang) * dist;
            const by = mouthY + Math.sin(ang) * dist;
            if (bx >= 0 && bx <= this.W && by >= 0 && by <= this.H) {
                this.droplets.push(this._newDroplet(bx, by, 1.0 + Math.random() * 1.8));
            }
        }
    }

    clearAll() {
        this.droplets = [];
        this.ctx.clearRect(0, 0, this.W, this.H);
    }

    reset() {
        this._spawn();
    }

    update() {
        const len = this.droplets.length;
        for (let i = 0; i < len; i++) {
            const d = this.droplets[i];
            if (!d) continue;

            if (d.vy > 0) {
                d.y += d.vy;
                d.driftPhase += 0.02;
                d.x += Math.sin(d.driftPhase) * 0.06;

                // Recycle at top when off screen bottom
                if (d.y - d.r > this.H) {
                    Object.assign(d, this._newDroplet(d.x, -d.r, 1.2));
                }
            }
        }

        // Ambient condensation spawn
        if (Math.random() < 0.015 && this.droplets.length < 240) {
            this.droplets.push(this._newDroplet());
        }
    }

    draw() {
        const { ctx, W, H } = this;
        ctx.clearRect(0, 0, W, H);
        if (!this.visible || this.droplets.length === 0) return;

        for (const d of this.droplets) {
            ctx.save();
            ctx.globalAlpha = d.alpha;

            // Pure bright circular droplet body (zero dark shadow, zero black trail)
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
            const grad = ctx.createRadialGradient(
                d.x - d.r * 0.25, d.y - d.r * 0.25, d.r * 0.05,
                d.x, d.y, d.r
            );
            grad.addColorStop(0,   'rgba(255, 255, 255, 0.95)');
            grad.addColorStop(0.5, 'rgba(215, 240, 255, 0.65)');
            grad.addColorStop(1,   'rgba(180, 220, 250, 0.35)');
            ctx.fillStyle = grad;
            ctx.fill();

            // Crisp specular highlight glint
            ctx.beginPath();
            ctx.arc(d.x - d.r * 0.32, d.y - d.r * 0.32, d.r * 0.35, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.fill();

            ctx.restore();
        }
    }

    toggleVisibility() {
        this.visible = !this.visible;
        return this.visible;
    }

    get texture() {
        return this.canvas;
    }
}
