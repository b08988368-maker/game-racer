import * as THREE from 'three';
import { LiveryStyle } from '../types/game';

export function createAsphaltTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Rich dark Rockport expressway asphalt
  ctx.fillStyle = '#151922';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle longitudinal paving seam bands across 4 lanes
  for (let x = 0; x < 512; x += 128) {
    const grad = ctx.createLinearGradient(x, 0, x + 128, 0);
    grad.addColorStop(0, 'rgba(9,11,16,0.28)');
    grad.addColorStop(0.5, 'rgba(34,40,52,0.12)');
    grad.addColorStop(1, 'rgba(9,11,16,0.28)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, 128, 512);
  }

  // Fine mineral aggregate grain
  for (let i = 0; i < 16000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const shade = 16 + Math.floor(Math.random() * 24);
    ctx.fillStyle = `rgb(${shade},${shade + 3},${shade + 7})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Tar expansion cracks
  ctx.strokeStyle = 'rgba(6, 8, 12, 0.72)';
  ctx.lineWidth = 1.5;
  for (let c = 0; c < 5; c++) {
    ctx.beginPath();
    let cx = Math.random() * 512;
    let cy = Math.random() * 512;
    ctx.moveTo(cx, cy);
    for (let s = 0; s < 5; s++) {
      cx += (Math.random() - 0.5) * 48;
      cy += 24 + Math.random() * 44;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  // Cross-road concrete/tar expansion joints for speed rhythm
  ctx.fillStyle = 'rgba(7, 9, 13, 0.55)';
  ctx.fillRect(0, 128, 512, 3);
  ctx.fillRect(0, 384, 512, 3);

  // Subtle worn dark tire grooves along all 4 lanes
  [66, 174, 338, 446].forEach((laneCenter) => {
    const groove = ctx.createLinearGradient(laneCenter - 34, 0, laneCenter + 34, 0);
    groove.addColorStop(0, 'rgba(7, 9, 14, 0)');
    groove.addColorStop(0.5, 'rgba(5, 7, 11, 0.54)');
    groove.addColorStop(1, 'rgba(7, 9, 14, 0)');
    ctx.fillStyle = groove;
    ctx.fillRect(laneCenter - 34, 0, 68, 512);
  });

  // Outer edge white lines & milled shoulder rumble strips
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(14, 0, 6, 512);
  ctx.fillRect(492, 0, 6, 512);
  ctx.fillStyle = 'rgba(10, 14, 22, 0.72)';
  for (let y = 0; y < 512; y += 24) {
    ctx.fillRect(3, y, 9, 10);
    ctx.fillRect(500, y, 9, 10);
  }

  // Dashed lane dividers
  ctx.fillStyle = 'rgba(226, 232, 240, 0.86)';
  for (let y = 0; y < 512; y += 64) {
    ctx.fillRect(126, y + 10, 5, 34);
    ctx.fillRect(381, y + 10, 5, 34);
  }

  // Center double amber highway median lines
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(247, 0, 5, 512);
  ctx.fillRect(260, 0, 5, 512);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createAsphaltNormalTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgb(128,128,255)';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 7000; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const nx = 118 + Math.floor(Math.random() * 20);
    const ny = 118 + Math.floor(Math.random() * 20);
    ctx.fillStyle = `rgb(${nx},${ny},252)`;
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createAsphaltRoughnessTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Matte outer aggregate with polished damp golden-hour tire tracks
  ctx.fillStyle = 'rgb(228,228,228)';
  ctx.fillRect(0, 0, 256, 256);

  [33, 87, 169, 223].forEach((cx) => {
    const g = ctx.createLinearGradient(cx - 24, 0, cx + 24, 0);
    g.addColorStop(0, 'rgba(165,165,165,0)');
    g.addColorStop(0.5, 'rgba(96,96,96,0.92)');
    g.addColorStop(1, 'rgba(165,165,165,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 24, 0, 48, 256);
  });

  // Damp sunset reflection patches along highway deck
  for (let i = 0; i < 16; i++) {
    const px = Math.random() * 256;
    const py = Math.random() * 256;
    const pr = 16 + Math.random() * 26;
    const g = ctx.createRadialGradient(px, py, 2, px, py, pr);
    g.addColorStop(0, 'rgba(84,84,84,0.72)');
    g.addColorStop(1, 'rgba(84,84,84,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  }

  for (let i = 0; i < 2400; i++) {
    const shade = 148 + Math.floor(Math.random() * 92);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createWetAsphaltRoughnessTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Mirror-damp rain sheen with puddles reflecting streetlights and taillights
  ctx.fillStyle = 'rgb(88,88,88)';
  ctx.fillRect(0, 0, 256, 256);

  [34, 88, 168, 222].forEach((cx) => {
    const g = ctx.createLinearGradient(cx - 28, 0, cx + 28, 0);
    g.addColorStop(0, 'rgba(60,60,60,0)');
    g.addColorStop(0.5, 'rgba(20,20,20,0.95)');
    g.addColorStop(1, 'rgba(60,60,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 28, 0, 56, 256);
  });

  for (let i = 0; i < 24; i++) {
    const px = Math.random() * 256;
    const py = Math.random() * 256;
    const pr = 18 + Math.random() * 32;
    const g = ctx.createRadialGradient(px, py, 2, px, py, pr);
    g.addColorStop(0, 'rgba(14,14,14,0.88)');
    g.addColorStop(1, 'rgba(14,14,14,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createCurbTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#242933';
  ctx.fillRect(0, 0, 128, 256);

  ctx.fillStyle = '#171B22';
  for (let y = 0; y < 256; y += 16) {
    ctx.fillRect(14, y, 36, 7);
    ctx.fillRect(78, y, 36, 7);
  }

  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(0, 0, 10, 256);
  ctx.fillRect(118, 0, 10, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createBarrierTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#475569';
  ctx.fillRect(0, 0, 256, 128);

  ctx.fillStyle = '#334155';
  ctx.fillRect(0, 76, 256, 52);
  ctx.fillStyle = '#64748B';
  ctx.fillRect(0, 0, 256, 16);
  ctx.fillStyle = '#1E293B';
  for (let x = 0; x < 256; x += 64) {
    ctx.fillRect(x, 0, 4, 128);
  }
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(112, 22, 32, 10);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createGroundTerrainTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#736858';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 160; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 24 + Math.random() * 56;
    const g = ctx.createRadialGradient(x, y, 4, x, y, r);
    const v = 90 + Math.floor(Math.random() * 48);
    g.addColorStop(0, `rgba(${v},${Math.round(v * 0.93)},${Math.round(v * 0.82)},0.22)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  for (let i = 0; i < 2800; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = 86 + Math.floor(Math.random() * 58);
    ctx.fillStyle = `rgba(${v},${Math.round(v * 0.92)},${Math.round(v * 0.8)},0.24)`;
    ctx.fillRect(x, y, 3, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(36, 36);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createGarageFloorTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#11141C';
  ctx.fillRect(0, 0, 512, 512);

  for (let y = 0; y < 512; y += 128) {
    for (let x = 0; x < 512; x += 128) {
      const g = ctx.createLinearGradient(x, y, x + 128, y + 128);
      g.addColorStop(0, 'rgba(255,255,255,0.028)');
      g.addColorStop(1, 'rgba(0,0,0,0.09)');
      ctx.fillStyle = g;
      ctx.fillRect(x + 2, y + 2, 124, 124);
    }
  }

  ctx.strokeStyle = '#252B37';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 512; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createBuildingFacadeTexture(
  maxAnisotropy: number,
  variant: 'glass' | 'concrete' | 'industrial' = 'glass',
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  if (variant === 'industrial') {
    ctx.fillStyle = '#26221E';
    ctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 64) {
      ctx.fillStyle = '#161412';
      ctx.fillRect(0, y, 512, 6);
      for (let x = 18; x < 494; x += 48) {
        const lit = Math.random() > 0.56;
        ctx.fillStyle = lit ? '#F59E0B' : '#0F1521';
        ctx.fillRect(x, y + 18, 28, 18);
      }
    }
  } else if (variant === 'concrete') {
    ctx.fillStyle = '#232833';
    ctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 32) {
      ctx.fillStyle = '#171B24';
      ctx.fillRect(0, y, 512, 5);
      for (let x = 14; x < 498; x += 32) {
        const r = Math.random();
        ctx.fillStyle = r > 0.72 ? '#FCD34D' : r > 0.45 ? '#2B3648' : '#0D131F';
        ctx.fillRect(x, y + 8, 19, 16);
      }
    }
  } else {
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#0D1627');
    grad.addColorStop(0.55, '#172740');
    grad.addColorStop(1, '#262127');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    for (let y = 0; y < 512; y += 32) {
      ctx.fillStyle = '#090E18';
      ctx.fillRect(0, y, 512, 5);
      for (let x = 10; x < 502; x += 28) {
        const r = Math.random();
        ctx.fillStyle =
          r > 0.74 ? (r > 0.88 ? '#FBBF24' : '#7DD3FC') : r > 0.36 ? '#1B3455' : '#080C15';
        ctx.fillRect(x, y + 7, 20, 19);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 3);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createRampChevronTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#181B22';
  ctx.fillRect(0, 0, 256, 512);

  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(0, 0, 14, 512);
  ctx.fillRect(242, 0, 14, 512);

  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 22;
  for (let y = 64; y < 512; y += 110) {
    ctx.beginPath();
    ctx.moveTo(46, y + 48);
    ctx.lineTo(128, y);
    ctx.lineTo(210, y + 48);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createStartBannerTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0D0E12';
  ctx.fillRect(0, 0, 1024, 192);

  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(0, 0, 1024, 16);
  ctx.fillRect(0, 176, 1024, 16);

  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 72px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ROCKPORT // MOST WANTED', 512, 98);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createHighwaySignTexture(
  title: string,
  subtitle: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#064E3B';
  ctx.fillRect(0, 0, 512, 192);

  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, 492, 172);

  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 42px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, 256, 84);

  ctx.fillStyle = '#FBBF24';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText(subtitle, 256, 142);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createBillboardTexture(maxAnisotropy: number, subtitle = 'ROCKPORT SPEEDWAY'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 512, 256);
  grad.addColorStop(0, '#11131A');
  grad.addColorStop(1, '#78350F');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, 492, 236);

  ctx.fillStyle = '#F59E0B';
  ctx.font = 'bold 54px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MOST WANTED', 256, 110);

  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(subtitle, 256, 168);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(128, 128, 22, 128, 128, 124);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.92)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.56)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  return new THREE.CanvasTexture(canvas);
}

export function createHeadlightPoolTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(128, 236, 8, 128, 120, 134);
  grad.addColorStop(0, 'rgba(255, 250, 226, 0.65)');
  grad.addColorStop(0.45, 'rgba(254, 240, 180, 0.28)');
  grad.addColorStop(1, 'rgba(254, 240, 180, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createLightGlowTexture(colorRgba = 'rgba(245, 158, 11, 0.85)'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255, 250, 235, 0.96)');
  grad.addColorStop(0.28, colorRgba);
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createRoadLightPoolTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
  grad.addColorStop(0, 'rgba(255, 224, 150, 0.42)');
  grad.addColorStop(0.45, 'rgba(245, 158, 11, 0.16)');
  grad.addColorStop(1, 'rgba(245, 158, 11, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCarPaintLiveryTexture(
  paintHex: string,
  livery: LiveryStyle,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = livery === 'most_wanted' ? '#DCE2EC' : paintHex;
  ctx.fillRect(0, 0, 512, 512);

  if (livery === 'stripes') {
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(208, 0, 36, 512);
    ctx.fillRect(268, 0, 36, 512);
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(200, 0, 8, 512);
    ctx.fillRect(304, 0, 8, 512);
  } else if (livery === 'most_wanted') {
    // Iconic metallic silver + dual-tone royal/navy razor flanks + crisp silver pinstripes
    ctx.fillStyle = '#1E3A8A';
    ctx.beginPath();
    ctx.moveTo(0, 64);
    ctx.lineTo(198, 204);
    ctx.lineTo(122, 512);
    ctx.lineTo(0, 512);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(512, 64);
    ctx.lineTo(314, 204);
    ctx.lineTo(390, 512);
    ctx.lineTo(512, 512);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#1D4ED8';
    ctx.beginPath();
    ctx.moveTo(0, 96);
    ctx.lineTo(176, 214);
    ctx.lineTo(106, 512);
    ctx.lineTo(0, 512);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(512, 96);
    ctx.lineTo(336, 214);
    ctx.lineTo(406, 512);
    ctx.lineTo(512, 512);
    ctx.closePath();
    ctx.fill();

    // Crisp cyan-white border pinstripes framing hood & flanks
    ctx.fillStyle = '#E0F2FE';
    ctx.fillRect(194, 0, 6, 512);
    ctx.fillRect(312, 0, 6, 512);

    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(184, 0, 8, 512);
    ctx.fillRect(320, 0, 8, 512);

    // Recessed carbon hood extractor graphic
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(216, 48, 80, 108);
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(224, 58, 64, 86);
  } else if (livery === 'boss_carbon') {
    // Exclusive Blacklist Boss carbon-weave hood, aggressive swept side tribal blades & metallic accent pin-striping
    ctx.fillStyle = paintHex;
    ctx.fillRect(0, 0, 512, 512);

    // Carbon-fiber central hood & roof panel
    ctx.fillStyle = '#111827';
    ctx.fillRect(156, 0, 200, 512);
    ctx.fillStyle = '#1F2937';
    for (let y = 0; y < 512; y += 8) {
      for (let x = 156; x < 356; x += 8) {
        if (((x + y) / 8) % 2 === 0) {
          ctx.fillRect(x, y, 4, 4);
        }
      }
    }

    // Crisp gold/amber metallic edge pinstripe
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(148, 0, 8, 512);
    ctx.fillRect(356, 0, 8, 512);

    // Aggressive diagonal Blacklist flank blades
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.moveTo(0, 130);
    ctx.lineTo(148, 250);
    ctx.lineTo(90, 512);
    ctx.lineTo(0, 512);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(512, 130);
    ctx.lineTo(364, 250);
    ctx.lineTo(422, 512);
    ctx.lineTo(512, 512);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.moveTo(0, 148);
    ctx.lineTo(132, 256);
    ctx.lineTo(124, 268);
    ctx.lineTo(0, 166);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(512, 148);
    ctx.lineTo(380, 256);
    ctx.lineTo(388, 268);
    ctx.lineTo(512, 166);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createPoliceLiveryTexture(maxAnisotropy: number, isRhino = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  if (isRhino) {
    ctx.fillStyle = '#0B0F19';
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(0, 190, 512, 130);
    ctx.fillStyle = '#EF4444';
    ctx.fillRect(0, 182, 512, 10);
    ctx.fillRect(0, 320, 512, 10);
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RHINO ENFORCER', 256, 268);
  } else {
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 155, 512, 195);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(0, 150, 512, 8);
    ctx.fillRect(0, 348, 512, 8);
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RPD INTERCEPTOR', 256, 264);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}
