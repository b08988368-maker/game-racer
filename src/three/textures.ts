import * as THREE from 'three';
import { LiveryStyle } from '../types/game';

export type AsphaltVariant = 'standard' | 'interstate' | 'canyon' | 'city_wet' | 'industrial';

export function createAsphaltTexture(
  maxAnisotropy: number,
  variant: AsphaltVariant = 'standard',
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const baseColor =
    variant === 'interstate'
      ? '#242933'
      : variant === 'canyon'
        ? '#26211D'
        : variant === 'city_wet'
          ? '#10141C'
          : variant === 'industrial'
            ? '#1B1A19'
            : '#151922';

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle longitudinal paving seam bands across 4 lanes
  for (let x = 0; x < 512; x += 128) {
    const grad = ctx.createLinearGradient(x, 0, x + 128, 0);
    grad.addColorStop(0, 'rgba(9,11,16,0.32)');
    grad.addColorStop(0.5, variant === 'interstate' ? 'rgba(60,68,82,0.16)' : 'rgba(34,40,52,0.12)');
    grad.addColorStop(1, 'rgba(9,11,16,0.32)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, 128, 512);
  }

  // Fine mineral aggregate grain
  for (let i = 0; i < 16000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const shade = (variant === 'interstate' ? 28 : 16) + Math.floor(Math.random() * 24);
    if (variant === 'canyon') {
      ctx.fillStyle = `rgb(${shade + 12},${shade + 5},${shade})`;
    } else if (variant === 'industrial') {
      ctx.fillStyle = `rgb(${shade + 6},${shade + 2},${shade})`;
    } else {
      ctx.fillStyle = `rgb(${shade},${shade + 3},${shade + 7})`;
    }
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
  ctx.fillStyle = variant === 'interstate' ? 'rgba(10, 12, 18, 0.78)' : 'rgba(7, 9, 13, 0.55)';
  ctx.fillRect(0, 128, 512, variant === 'interstate' ? 5 : 3);
  ctx.fillRect(0, 384, 512, variant === 'interstate' ? 5 : 3);
  if (variant === 'interstate') {
    ctx.fillRect(0, 256, 512, 4);
    ctx.fillRect(0, 0, 512, 4);
  }

  // Subtle worn dark tire grooves along all 4 lanes
  [66, 174, 338, 446].forEach((laneCenter) => {
    const groove = ctx.createLinearGradient(laneCenter - 36, 0, laneCenter + 36, 0);
    groove.addColorStop(0, 'rgba(5, 7, 11, 0)');
    groove.addColorStop(0.5, 'rgba(3, 4, 8, 0.72)');
    groove.addColorStop(1, 'rgba(5, 7, 11, 0)');
    ctx.fillStyle = groove;
    ctx.fillRect(laneCenter - 36, 0, 72, 512);
  });

  // High-contrast outer edge lines & shoulder rumble strips
  ctx.fillStyle = variant === 'canyon' ? '#FDE047' : '#FFFFFF';
  ctx.fillRect(14, 0, 8, 512);
  ctx.fillRect(490, 0, 8, 512);
  ctx.fillStyle = variant === 'canyon' ? 'rgba(234, 88, 12, 0.72)' : 'rgba(15, 23, 42, 0.85)';
  for (let y = 0; y < 512; y += 24) {
    ctx.fillRect(3, y, 9, 10);
    ctx.fillRect(500, y, 9, 10);
  }

  // Crisp dashed lane dividers
  ctx.fillStyle = variant === 'city_wet' ? 'rgba(56, 189, 248, 0.94)' : 'rgba(248, 250, 252, 0.96)';
  for (let y = 0; y < 512; y += 64) {
    ctx.fillRect(126, y + 10, 6, 36);
    ctx.fillRect(380, y + 10, 6, 36);
  }

  // Sharp double highway median lines
  ctx.fillStyle = variant === 'industrial' ? '#F97316' : '#FBBF24';
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

  // Outer paved runoff shoulder + bold FIA red/white apex rumble blocks
  ctx.fillStyle = '#1E232D';
  ctx.fillRect(0, 0, 128, 256);

  for (let y = 0; y < 256; y += 64) {
    ctx.fillStyle = y % 128 === 0 ? '#DC2626' : '#F8FAFC';
    ctx.fillRect(0, y, 52, 64);
    ctx.fillRect(76, y, 52, 64);
  }

  // Rumble groove ribs on curb edge
  ctx.fillStyle = 'rgba(9, 11, 16, 0.35)';
  for (let y = 0; y < 256; y += 16) {
    ctx.fillRect(0, y, 128, 4);
  }

  // Subtle amber safety pin-stripe along inner asphalt transition
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(52, 0, 4, 256);
  ctx.fillRect(72, 0, 4, 256);

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

  // Industrial concrete Jersey wall + top steel rail band + sharp chevron hazard strip
  ctx.fillStyle = '#566171';
  ctx.fillRect(0, 0, 256, 128);

  // Lower sloped base foot shadow
  ctx.fillStyle = '#293242';
  ctx.fillRect(0, 82, 256, 46);

  // Top crisp brushed steel guardrail cap band
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(0, 0, 256, 22);

  // Vivid amber/black hazard stripe under top rail for razor-sharp corner legibility
  ctx.fillStyle = '#FBBF24';
  ctx.fillRect(0, 22, 256, 11);
  ctx.fillStyle = '#0F172A';
  for (let x = 0; x < 256; x += 32) {
    ctx.fillRect(x, 22, 14, 11);
  }

  // Concrete segment expansion seams
  ctx.fillStyle = '#151C28';
  for (let x = 0; x < 256; x += 64) {
    ctx.fillRect(x, 0, 4, 128);
  }

  // Scuff & tire rub marks along mid wall
  ctx.fillStyle = 'rgba(15, 20, 28, 0.42)';
  ctx.fillRect(0, 56, 256, 12);

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
  variant: 'glass' | 'concrete' | 'industrial' | 'villa' | 'rock' = 'glass',
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  if (variant === 'rock') {
    const cliffGrad = ctx.createLinearGradient(0, 0, 0, 512);
    cliffGrad.addColorStop(0, '#5C4B3B');
    cliffGrad.addColorStop(0.5, '#463A2E');
    cliffGrad.addColorStop(1, '#312921');
    ctx.fillStyle = cliffGrad;
    ctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 18) {
      ctx.fillStyle = y % 36 === 0 ? 'rgba(255,235,205,0.08)' : 'rgba(15,10,5,0.22)';
      ctx.fillRect(0, y, 512, 7 + ((y * 7) % 9));
    }
    for (let x = 0; x < 512; x += 28) {
      ctx.fillStyle = 'rgba(20, 15, 10, 0.16)';
      ctx.fillRect(x, 0, 3, 512);
    }
  } else if (variant === 'villa') {
    // Vivid sunlit "3robyat" whitewashed limestone & warm terracotta stucco villa facade
    const stuccoGrad = ctx.createLinearGradient(0, 0, 0, 512);
    stuccoGrad.addColorStop(0, '#FFFDF9');
    stuccoGrad.addColorStop(0.55, '#F6EFE2');
    stuccoGrad.addColorStop(1, '#E7D8BE');
    ctx.fillStyle = stuccoGrad;
    ctx.fillRect(0, 0, 512, 512);

    // Subtle limestone block ashlar courses
    ctx.strokeStyle = 'rgba(162, 136, 104, 0.28)';
    ctx.lineWidth = 2;
    for (let y = 32; y < 512; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }

    // Carved cornice & floor balustrade trim
    ctx.fillStyle = '#C9B597';
    ctx.fillRect(0, 236, 512, 20);
    ctx.fillRect(0, 492, 512, 20);
    ctx.fillStyle = '#8C6239';
    ctx.fillRect(0, 232, 512, 5);

    for (let row = 0; row < 2; row++) {
      const yBase = row * 256 + 44;
      for (let x = 42; x < 476; x += 116) {
        // Arched stone lintel + carved mashrabiya shutters + warm golden interior glow
        ctx.fillStyle = '#B89F7D';
        ctx.beginPath();
        ctx.arc(x + 32, yBase + 30, 36, Math.PI, 0);
        ctx.lineTo(x + 68, yBase + 150);
        ctx.lineTo(x - 4, yBase + 150);
        ctx.closePath();
        ctx.fill();

        // Warm wood mashrabiya side shutters
        ctx.fillStyle = '#6E4726';
        ctx.fillRect(x - 14, yBase + 28, 14, 122);
        ctx.fillRect(x + 64, yBase + 28, 14, 122);
        ctx.fillStyle = '#9C6B3F';
        for (let sl = 0; sl < 6; sl++) {
          ctx.fillRect(x - 12, yBase + 36 + sl * 18, 10, 6);
          ctx.fillRect(x + 66, yBase + 36 + sl * 18, 10, 6);
        }

        // Glazed arch bay with warm interior glow
        const glGrad = ctx.createLinearGradient(0, yBase, 0, yBase + 146);
        glGrad.addColorStop(0, '#1B344D');
        glGrad.addColorStop(0.5, '#254C6E');
        glGrad.addColorStop(1, row === 1 ? 'rgba(251, 191, 36, 0.72)' : '#1D3B56');
        ctx.fillStyle = glGrad;
        ctx.beginPath();
        ctx.arc(x + 32, yBase + 30, 29, Math.PI, 0);
        ctx.lineTo(x + 61, yBase + 146);
        ctx.lineTo(x + 3, yBase + 146);
        ctx.closePath();
        ctx.fill();

        // Mullion cross & travertine sill
        ctx.fillStyle = '#E8DAC4';
        ctx.fillRect(x + 30, yBase + 4, 4, 142);
        ctx.fillRect(x + 3, yBase + 68, 58, 4);
        ctx.fillStyle = '#D7C3A5';
        ctx.fillRect(x - 8, yBase + 146, 80, 10);
      }
    }
  } else if (variant === 'industrial') {
    ctx.fillStyle = '#2B2F36';
    ctx.fillRect(0, 0, 512, 512);
    // Ribbed steel warehouse cladding + horizontal clerestory glazing
    for (let x = 0; x < 512; x += 16) {
      ctx.fillStyle = x % 32 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.16)';
      ctx.fillRect(x, 0, 8, 512);
    }
    for (let y = 0; y < 512; y += 128) {
      ctx.fillStyle = '#141820';
      ctx.fillRect(0, y, 512, 12);
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(24, y + 26, 464, 34);
      for (let x = 32; x < 472; x += 58) {
        const lit = ((x + y) / 14) % 5 === 0;
        ctx.fillStyle = lit ? 'rgba(251, 191, 36, 0.65)' : 'rgba(148, 163, 184, 0.25)';
        ctx.fillRect(x, y + 30, 46, 26);
      }
    }
  } else if (variant === 'concrete') {
    // Modern precast architectural concrete tower with recessed panoramic ribbon windows
    const baseGrad = ctx.createLinearGradient(0, 0, 0, 512);
    baseGrad.addColorStop(0, '#3D4452');
    baseGrad.addColorStop(1, '#2B313C');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, 512, 512);

    for (let y = 0; y < 512; y += 64) {
      // Floor spandrel ledge + shadow line
      ctx.fillStyle = '#222731';
      ctx.fillRect(0, y, 512, 16);
      ctx.fillStyle = '#4B5565';
      ctx.fillRect(0, y + 16, 512, 4);

      // Clean continuous glass strip with subtle mullions and varied office glow
      for (let x = 12; x < 500; x += 48) {
        const r = Math.sin(x * 0.13 + y * 0.07);
        ctx.fillStyle = r > 0.65 ? 'rgba(253, 224, 140, 0.72)' : r > 0.1 ? '#1C3654' : '#101E30';
        ctx.fillRect(x, y + 24, 40, 32);
        ctx.fillStyle = 'rgba(186, 230, 253, 0.18)';
        ctx.fillRect(x + 2, y + 26, 16, 28);
      }
    }
  } else {
    // Architectural curtain-wall skyscraper glass with sleek vertical mullions and sky reflection gradient
    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, '#162A45');
    grad.addColorStop(0.5, '#224268');
    grad.addColorStop(1, '#122238');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    for (let y = 0; y < 512; y += 64) {
      // Dark aluminum spandrel panel per floor
      ctx.fillStyle = '#0D1522';
      ctx.fillRect(0, y, 512, 14);
      ctx.fillStyle = '#334E6E';
      ctx.fillRect(0, y + 14, 512, 2);

      for (let x = 0; x < 512; x += 32) {
        const seed = Math.sin(x * 0.21 + y * 0.37);
        const paneColor =
          seed > 0.76
            ? 'rgba(254, 240, 185, 0.55)'
            : seed > 0.25
              ? 'rgba(125, 211, 252, 0.28)'
              : 'rgba(15, 30, 52, 0.55)';
        ctx.fillStyle = paneColor;
        ctx.fillRect(x + 3, y + 18, 26, 42);
        // Vertical brushed aluminum mullion
        ctx.fillStyle = '#0B111C';
        ctx.fillRect(x, y, 3, 64);
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
  secondaryHex = '#F8FAFC',
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = livery === 'most_wanted' ? '#DCE2EC' : paintHex;
  ctx.fillRect(0, 0, 512, 512);

  if (livery === 'stripes') {
    ctx.fillStyle = secondaryHex;
    ctx.fillRect(204, 0, 40, 512);
    ctx.fillRect(268, 0, 40, 512);
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(196, 0, 8, 512);
    ctx.fillRect(308, 0, 8, 512);
  } else if (livery === 'two_tone') {
    // Aggressive front-hood + roof + rear-deck two-tone split with razor pin-stripe
    ctx.fillStyle = secondaryHex;
    ctx.beginPath();
    ctx.moveTo(116, 0);
    ctx.lineTo(396, 0);
    ctx.lineTo(348, 512);
    ctx.lineTo(164, 512);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#090D16';
    ctx.fillRect(108, 0, 10, 512);
    ctx.fillRect(394, 0, 10, 512);

    // Side speed wedge
    ctx.fillStyle = secondaryHex;
    ctx.beginPath();
    ctx.moveTo(0, 210);
    ctx.lineTo(118, 290);
    ctx.lineTo(74, 512);
    ctx.lineTo(0, 512);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(512, 210);
    ctx.lineTo(394, 290);
    ctx.lineTo(438, 512);
    ctx.lineTo(512, 512);
    ctx.closePath();
    ctx.fill();
  } else if (livery === 'cyber_hex') {
    // High-contrast Nightdrive geometric hex mesh + neon diagonal slash stripes
    ctx.fillStyle = '#090D16';
    ctx.beginPath();
    ctx.moveTo(0, 118);
    ctx.lineTo(512, 240);
    ctx.lineTo(512, 512);
    ctx.lineTo(0, 512);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 3;
    const step = 42;
    for (let y = 120; y < 520; y += step) {
      for (let x = 0; x < 520; x += step) {
        const ox = ((y / step) % 2) * (step * 0.5);
        ctx.strokeRect(x + ox - 12, y - 12, 24, 24);
      }
    }

    // Dual razor neon stripes
    ctx.strokeStyle = secondaryHex;
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(0, 128);
    ctx.lineTo(512, 250);
    ctx.stroke();

    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 152);
    ctx.lineTo(512, 274);
    ctx.stroke();
  } else if (livery === 'drift_camo') {
    // Angular Urban Drift Camouflage shards
    const shards: [number, number, number, number, number, number, string][] = [
      [0, 30, 190, 95, 70, 210, '#0F172A'],
      [340, 20, 512, 110, 405, 240, '#0F172A'],
      [140, 145, 320, 185, 225, 310, secondaryHex],
      [0, 250, 165, 330, 60, 470, secondaryHex],
      [365, 255, 512, 345, 445, 485, secondaryHex],
      [180, 340, 355, 395, 265, 512, '#0F172A'],
      [60, 90, 180, 150, 115, 235, '#1E293B'],
      [330, 140, 475, 210, 390, 295, '#1E293B'],
    ];
    for (let i = 0; i < shards.length; i++) {
      const [x1, y1, x2, y2, x3, y3, col] = shards[i];
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.closePath();
      ctx.fill();
    }
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

    // Crisp accent metallic edge pinstripe
    ctx.fillStyle = secondaryHex === '#F8FAFC' ? '#F59E0B' : secondaryHex;
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

    ctx.fillStyle = secondaryHex === '#F8FAFC' ? '#F59E0B' : secondaryHex;
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

export function createCornerChevronTexture(
  maxAnisotropy: number,
  direction: 'left' | 'right',
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0B0D12';
  ctx.fillRect(0, 0, 256, 128);

  // High-visibility safety amber outer trim
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 248, 120);

  // Bold directional chevrons pointing left or right around the turn
  ctx.strokeStyle = '#FBBF24';
  ctx.lineWidth = 20;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';

  const offsets = [-68, 0, 68];
  offsets.forEach((ox) => {
    const cx = 128 + ox;
    ctx.beginPath();
    if (direction === 'right') {
      ctx.moveTo(cx - 22, 24);
      ctx.lineTo(cx + 16, 64);
      ctx.lineTo(cx - 22, 104);
    } else {
      ctx.moveTo(cx + 22, 24);
      ctx.lineTo(cx - 16, 64);
      ctx.lineTo(cx + 22, 104);
    }
    ctx.stroke();
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createShortcutSurfaceTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Distinct high-contrast concrete bypass deck so shortcuts pop unmistakably vs dark main highway
  ctx.fillStyle = '#202B33';
  ctx.fillRect(0, 0, 256, 512);

  // Brushed concrete service block texture
  for (let y = 0; y < 512; y += 32) {
    ctx.fillStyle = y % 64 === 0 ? 'rgba(255,255,255,0.055)' : 'rgba(6,12,18,0.14)';
    ctx.fillRect(20, y + 2, 216, 28);
  }

  // Twin bright emerald + hazard amber curb guide bands
  ctx.fillStyle = '#34D399';
  ctx.fillRect(4, 0, 12, 512);
  ctx.fillRect(240, 0, 12, 512);
  ctx.fillStyle = '#F59E0B';
  for (let y = 0; y < 512; y += 48) {
    ctx.fillRect(18, y, 6, 26);
    ctx.fillRect(232, y, 6, 26);
  }

  // Bold repeating illuminated forward chevrons down center of shortcut lane
  ctx.strokeStyle = '#34D399';
  ctx.lineWidth = 18;
  ctx.lineCap = 'square';
  for (let y = 36; y < 512; y += 128) {
    ctx.beginPath();
    ctx.moveTo(64, y + 54);
    ctx.lineTo(128, y);
    ctx.lineTo(192, y + 54);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(253, 224, 71, 0.72)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(86, y + 76);
    ctx.lineTo(128, y + 42);
    ctx.lineTo(170, y + 76);
    ctx.stroke();
    ctx.strokeStyle = '#34D399';
    ctx.lineWidth = 18;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createRoadShortcutArrowTexture(
  maxAnisotropy: number,
  side: -1 | 1,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 256, 256);

  // Subtle dark backing halo for crisp asphalt contrast
  ctx.fillStyle = 'rgba(4, 24, 18, 0.52)';
  ctx.beginPath();
  ctx.roundRect(24, 18, 208, 220, 24);
  ctx.fill();

  ctx.strokeStyle = '#34D399';
  ctx.lineWidth = 6;
  ctx.strokeRect(30, 24, 196, 208);

  // Drawn bold diagonal turn-off arrow pointing toward shortcut side
  const dir = side < 0 ? -1 : 1;
  ctx.save();
  ctx.translate(128, 128);
  ctx.rotate(dir * 0.42);

  // Double chevron shaft
  ctx.fillStyle = '#34D399';
  ctx.beginPath();
  ctx.moveTo(0, -86);
  ctx.lineTo(54, -22);
  ctx.lineTo(22, -22);
  ctx.lineTo(22, 68);
  ctx.lineTo(-22, 68);
  ctx.lineTo(-22, -22);
  ctx.lineTo(-54, -22);
  ctx.closePath();
  ctx.fill();

  // Inner bright highlight core
  ctx.fillStyle = '#FEF08A';
  ctx.beginPath();
  ctx.moveTo(0, -68);
  ctx.lineTo(28, -32);
  ctx.lineTo(10, -32);
  ctx.lineTo(10, 50);
  ctx.lineTo(-10, 50);
  ctx.lineTo(-10, -32);
  ctx.lineTo(-28, -32);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function drawBlockArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  dir: -1 | 1,
  size: number,
  fill: string,
) {
  ctx.save();
  ctx.translate(cx, cy);
  if (dir < 0) ctx.scale(-1, 1);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(-size * 0.55, -size * 0.24);
  ctx.lineTo(size * 0.05, -size * 0.24);
  ctx.lineTo(size * 0.05, -size * 0.54);
  ctx.lineTo(size * 0.58, 0);
  ctx.lineTo(size * 0.05, size * 0.54);
  ctx.lineTo(size * 0.05, size * 0.24);
  ctx.lineTo(-size * 0.55, size * 0.24);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function createShortcutSignTexture(
  maxAnisotropy: number,
  label: string,
  side: -1 | 1 = 1,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#041C15';
  ctx.fillRect(0, 0, 512, 192);

  // High-contrast emerald & amber framing bars
  ctx.fillStyle = '#10B981';
  ctx.fillRect(0, 0, 512, 16);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(0, 176, 512, 16);

  ctx.strokeStyle = '#6EE7B7';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 20, 496, 152);

  const arrowLeft = side < 0;
  ctx.fillStyle = '#10B981';
  ctx.fillRect(arrowLeft ? 20 : 388, 28, 104, 136);
  drawBlockArrow(ctx, arrowLeft ? 72 : 440, 96, side, 72, '#041C15');

  const textCenter = arrowLeft ? 314 : 198;
  ctx.fillStyle = '#6EE7B7';
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SHORTCUT IN', textCenter, 72);

  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 25px sans-serif';
  ctx.fillText(label.toUpperCase(), textCenter, 130);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createShortcutAdvanceSignTexture(
  maxAnisotropy: number,
  label: string,
  side: -1 | 1,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#051E17';
  ctx.fillRect(0, 0, 512, 192);

  // Crisp emerald & amber border bars
  ctx.fillStyle = '#10B981';
  ctx.fillRect(0, 0, 512, 14);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(0, 178, 512, 14);

  ctx.strokeStyle = '#6EE7B7';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 18, 492, 156);

  // Huge drawn vector arrow badge on the turn-off side
  const arrowLeft = side < 0;
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(arrowLeft ? 20 : 376, 26, 116, 140);
  drawBlockArrow(ctx, arrowLeft ? 78 : 434, 96, side, 78, '#051E17');

  const textCenter = arrowLeft ? 312 : 198;
  ctx.fillStyle = '#34D399';
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SHORTCUT 100M', textCenter, 66);

  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText(arrowLeft ? 'KEEP LEFT // TURN IN' : 'KEEP RIGHT // TURN IN', textCenter, 114);

  ctx.fillStyle = '#FDE68A';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(label.toUpperCase(), textCenter, 148);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createBrakingBoardTexture(
  maxAnisotropy: number,
  distanceLabel: string,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, 128, 128);

  ctx.strokeStyle = '#DC2626';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 118, 118);

  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 54px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(distanceLabel, 64, 58);

  ctx.fillStyle = '#DC2626';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('METERS', 64, 102);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createTunnelPortalTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#181C24';
  ctx.fillRect(0, 0, 512, 128);

  // Diagonal hazard chevrons on edges
  ctx.fillStyle = '#F59E0B';
  for (let x = -32; x < 544; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 22, 0);
    ctx.lineTo(x + 6, 26);
    ctx.lineTo(x - 16, 26);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = '#0B0E14';
  ctx.fillRect(90, 34, 332, 74);
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 4;
  ctx.strokeRect(90, 34, 332, 74);

  ctx.fillStyle = '#FBBF24';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TUNNEL // 5.2M CLEAR', 256, 72);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}


