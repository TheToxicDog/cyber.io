import { Texture } from 'pixi.js';

/** Procedurally generated textures (no external assets). */

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): Texture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  draw(ctx);
  return Texture.from(cv);
}

export function makeGlowTexture(): Texture {
  return canvasTexture(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.2, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });
}

export function makeVignetteTexture(): Texture {
  return canvasTexture(512, 512, (c) => {
    const g = c.createRadialGradient(256, 256, 120, 256, 256, 362);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0.85)');
    c.fillStyle = g;
    c.fillRect(0, 0, 512, 512);
  });
}

/** Wet asphalt with grain, cracks and oil stains, tiled across the floor. */
export function makeAsphaltTexture(): Texture {
  return canvasTexture(512, 512, (c) => {
    c.fillStyle = '#0d0f15';
    c.fillRect(0, 0, 512, 512);
    const img = c.getImageData(0, 0, 512, 512);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() * 18) | 0;
      img.data[i] = 13 + n;
      img.data[i + 1] = 15 + n;
      img.data[i + 2] = 21 + n + ((Math.random() * 4) | 0);
    }
    c.putImageData(img, 0, 0);
    for (let i = 0; i < 14; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const g = c.createRadialGradient(x, y, 0, x, y, 20 + Math.random() * 50);
      g.addColorStop(0, 'rgba(0,0,0,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(x - 80, y - 80, 160, 160);
    }
    c.strokeStyle = 'rgba(0,0,0,0.55)';
    c.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) {
      let x = Math.random() * 512;
      let y = Math.random() * 512;
      c.beginPath();
      c.moveTo(x, y);
      for (let k = 0; k < 7; k++) {
        x += (Math.random() - 0.5) * 50;
        y += (Math.random() - 0.5) * 50;
        c.lineTo(x, y);
      }
      c.stroke();
    }
  });
}
