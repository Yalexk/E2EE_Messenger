import { useEffect, useRef } from 'react';
import * as x3dh from '@e2ee/x3dh';

/**
 * A padlock printed in glyphs: every lit cell is one character of a real
 * AES-GCM ciphertext made in this browser, brightness taken from the
 * theme's glyph ramp. It resolves row by row once; under the pointer its
 * cells flare to the accent, then settle.
 */
const COLS = 64;
const CELL_RATIO = 1.85; // cells are taller than wide

/** Brightness levels 0-8 for a padlock silhouette, drawn offscreen as a mask. */
function padlockLevels(maskColor) {
  const w = 320;
  const h = 360;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.lineWidth = 34;
  g.strokeStyle = maskColor;
  g.fillStyle = maskColor;
  // Shackle
  g.beginPath();
  g.arc(160, 140, 78, Math.PI, 0);
  g.lineTo(238, 175);
  g.moveTo(82, 140);
  g.lineTo(82, 175);
  g.stroke();
  // Body
  g.fillRect(40, 165, 240, 185);
  // Keyhole
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.arc(160, 238, 24, 0, Math.PI * 2);
  g.fill();
  g.fillRect(150, 245, 20, 60);

  const rows = Math.round((COLS * h) / w / CELL_RATIO);
  const data = g.getImageData(0, 0, w, h).data;
  const out = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let col = 0; col < COLS; col++) {
      const x = Math.floor(((col + 0.5) / COLS) * w);
      const y = Math.floor(((r + 0.5) / rows) * h);
      if (data[(y * w + x) * 4 + 3] > 128) {
        // Lighter towards the top-left, a little noise for texture.
        const shade = 1 - (0.55 * r) / rows - (0.25 * col) / COLS;
        row.push(Math.max(2, Math.min(8, Math.round(3 + shade * 5 + (Math.random() * 2 - 1)))));
      } else {
        row.push(Math.random() < 0.035 ? 1 : 0);
      }
    }
    out.push(row);
  }
  return out;
}

export function GlyphLock({ className }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return undefined;
    let cancelled = false;
    let frame = 0;
    const flares = new Map(); // cell index -> expiry time

    const css = getComputedStyle(document.documentElement);
    const ramp = Array.from({ length: 8 }, (_, i) => css.getPropertyValue(`--color-glyph-${i}`).trim());
    const accent = css.getPropertyValue('--color-accent').trim();
    const family = getComputedStyle(document.body).fontFamily;
    const levels = padlockLevels(accent);
    const rows = levels.length;
    let text = '';
    let shownRows = 0;
    let size = { w: 0, h: 0, cw: 0, ch: 0 };

    const resize = () => {
      const w = wrap.clientWidth;
      const cw = w / COLS;
      const ch = cw * CELL_RATIO;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(ch * rows * dpr);
      canvas.style.height = `${ch * rows}px`;
      canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
      size = { w, h: ch * rows, cw, ch };
    };

    const draw = (now) => {
      const g = canvas.getContext('2d');
      g.clearRect(0, 0, size.w, size.h);
      g.textBaseline = 'middle';
      g.textAlign = 'center';
      let i = 0;
      for (let r = 0; r < Math.min(shownRows, rows); r++) {
        for (let c = 0; c < COLS; c++) {
          const lv = levels[r][c];
          if (lv === 0) continue;
          const flare = (flares.get(r * COLS + c) ?? 0) > now;
          const full = lv >= 3 || flare;
          g.font = `${full ? 500 : 400} ${size.ch * (full ? 0.78 : 0.48)}px ${family}`;
          g.fillStyle = flare ? accent : ramp[lv - 1];
          g.fillText(text[i % text.length], c * size.cw + size.cw / 2, r * size.ch + size.ch / 2);
          i++;
        }
      }
    };

    const tick = (now) => {
      if (cancelled) return;
      draw(now);
      if ([...flares.values()].some((t) => t > now)) frame = requestAnimationFrame(tick);
    };

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const start = async () => {
      const key = crypto.getRandomValues(new Uint8Array(32));
      const ad = crypto.getRandomValues(new Uint8Array(64));
      const { ciphertext } = await x3dh.encrypt(key, 'are we still on for tonight? yes, 7pm at the usual place. '.repeat(30), ad);
      if (cancelled) return;
      text = ciphertext.replace(/=/g, '');
      resize();
      if (reduce) {
        shownRows = rows;
        draw(performance.now());
        return;
      }
      const t0 = performance.now();
      const reveal = (now) => {
        if (cancelled) return;
        shownRows = Math.min(rows, Math.ceil(((now - t0) / 1500) * rows));
        draw(now);
        if (shownRows < rows) frame = requestAnimationFrame(reveal);
      };
      frame = requestAnimationFrame(reveal);
    };

    const onMove = (e) => {
      if (reduce || shownRows < rows) return;
      const rect = canvas.getBoundingClientRect();
      const col = Math.floor((e.clientX - rect.left) / size.cw);
      const row = Math.floor((e.clientY - rect.top) / size.ch);
      const now = performance.now();
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -3; dc <= 3; dc++) {
          const r = row + dr;
          const c = col + dc;
          if (r >= 0 && r < rows && c >= 0 && c < COLS && levels[r][c] > 0) flares.set(r * COLS + c, now + 450);
        }
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    };

    const ro = new ResizeObserver(() => {
      if (!text) return;
      resize();
      draw(performance.now());
    });
    ro.observe(wrap);
    canvas.addEventListener('pointermove', onMove);
    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
    };
  }, []);

  return (
    <figure ref={wrapRef} className={className}>
      <canvas ref={canvasRef} className="block w-full" role="img" aria-label="A padlock drawn with the characters of a real encrypted message." />
    </figure>
  );
}
