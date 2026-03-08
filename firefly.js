// firefly.js — Aurora canvas background engine

(function () {
  const canvas = document.getElementById('fc');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function sizeCanvas() {
    canvas.width  = document.body.offsetWidth  || 330;
    canvas.height = document.body.scrollHeight || 620;
  }
  sizeCanvas();

  const PALETTE = [
    {r:16, g:185,b:129},
    {r:20, g:184,b:166},
    {r:6,  g:182,b:212},
    {r:245,g:158,b:11 },
    {r:180,g:83, b:9  },
    {r:5,  g:150,b:105},
    {r:56, g:189,b:248},
    {r:251,g:191,b:36 },
    {r:34, g:197,b:94 },
  ];

  class Firefly {
    constructor(init) { this.reset(init || false); }
    reset(init) {
      const W = canvas.width, H = canvas.height;
      this.x = init ? Math.random() * W : (Math.random() > 0.5 ? -60 : W + 60);
      this.y = Math.random() * H;
      const c = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      this.r = c.r; this.g = c.g; this.b = c.b;
      this.radius  = 55 + Math.random() * 75;
      this.opacity = 0.13 + Math.random() * 0.17;
      const speed  = 0.14 + Math.random() * 0.32;
      const angle  = Math.random() * Math.PI * 2;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.wx = (Math.random() - 0.5) * 0.014;
      this.wy = (Math.random() - 0.5) * 0.014;
      this.ps = 0.005 + Math.random() * 0.011;
      this.pp = Math.random() * Math.PI * 2;
      this.hs = (Math.random() - 0.5) * 0.35;
      this.life = 0; this.op = this.opacity;
    }
    update() {
      const W = canvas.width, H = canvas.height;
      this.life++;
      this.vx += this.wx; this.vy += this.wy;
      this.vx *= 0.999;   this.vy *= 0.999;
      this.x  += this.vx; this.y  += this.vy;
      this.op  = this.opacity * (0.6 + 0.4 * Math.sin(this.life * this.ps + this.pp));
      this.r   = Math.max(0, Math.min(255, this.r + this.hs * Math.sin(this.life * 0.008)));
      this.g   = Math.max(0, Math.min(255, this.g + this.hs * Math.cos(this.life * 0.006)));
      this.b   = Math.max(0, Math.min(255, this.b + this.hs * Math.sin(this.life * 0.01 + 1)));
      if (this.x < -200 || this.x > W+200 || this.y < -200 || this.y > H+200) this.reset(false);
    }
    draw() {
      const gr = ctx.createRadialGradient(this.x,this.y,0, this.x,this.y,this.radius);
      gr.addColorStop(0,   `rgba(${this.r|0},${this.g|0},${this.b|0},${this.op})`);
      gr.addColorStop(0.4, `rgba(${this.r|0},${this.g|0},${this.b|0},${this.op*0.4})`);
      gr.addColorStop(1,   `rgba(${this.r|0},${this.g|0},${this.b|0},0)`);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = gr;
      ctx.fill();
    }
  }

  const flies = Array.from({length: 13}, () => new Firefly(true));

  let mx = -999, my = -999;
  const spot = document.getElementById('spot');

  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    if (spot) { spot.style.left = mx + 'px'; spot.style.top = my + 'px'; spot.style.opacity = '1'; }
  });
  document.addEventListener('mouseleave', () => {
    mx = -999; my = -999;
    if (spot) spot.style.opacity = '0';
  });

  function loop() {
    ctx.fillStyle = 'rgba(6,8,15,0.88)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'screen';
    flies.forEach(f => {
      const dx = f.x - mx, dy = f.y - my;
      const d  = Math.sqrt(dx*dx + dy*dy);
      if (d < 120 && d > 0) {
        const force = (120 - d) / 120 * 0.4;
        f.vx += (dx / d) * force;
        f.vy += (dy / d) * force;
      }
      f.update();
      f.draw();
    });
    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(loop);
  }
  loop();
})();
