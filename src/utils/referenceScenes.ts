import { LUT3D, clamp, hslToRgb, sampleLUTTrilinear } from './lutEngine';

export interface ReferenceScene {
  id: string;
  name: string;
  subtitle: string;
  exifSummary: string;
}

export const REFERENCE_SCENES: ReferenceScene[] = [
  {
    id: 'alpine-sunrise',
    name: 'Misty Mountain Sunrise Valley',
    subtitle: 'Layered mountain ridges, valley fog, golden sun, and foreground hilltop tree',
    exifSummary: '35mm Cinema Prime · f/5.6 · ISO 100 · 5400K',
  },
  {
    id: 'golden-portrait',
    name: 'Golden Hour Portrait & Skin Chart',
    subtitle: 'Natural skin tones, warm tungsten key light, deep shadow falloff',
    exifSummary: '50mm Prime · f/1.8 · ISO 400 · 5200K',
  },
  {
    id: 'neon-twilight-street',
    name: 'Blue Hour Rain & Amber Storefront',
    subtitle: 'Complementary warm-cool dynamic range for split-toning verification',
    exifSummary: '24mm Anamorphic · f/2.0 · ISO 800 · 3800K',
  },
  {
    id: 'colorchecker-chart',
    name: '24-Patch ColorChecker & 16-Stop Ramp',
    subtitle: 'Calibrated Macbeth color patches, skin references, and linear luma wedge',
    exifSummary: 'Calibrated D65 Reference Target · Rec.709 Linear',
  },
];

// Standard 24-Patch ColorChecker sRGB reference values
const COLORCHECKER_24: { name: string; rgb: [number, number, number] }[] = [
  { name: 'Dark Skin', rgb: [115, 82, 68] },
  { name: 'Light Skin', rgb: [194, 150, 130] },
  { name: 'Blue Sky', rgb: [98, 122, 157] },
  { name: 'Foliage', rgb: [87, 108, 67] },
  { name: 'Blue Flower', rgb: [133, 128, 177] },
  { name: 'Bluish Green', rgb: [103, 189, 170] },
  { name: 'Orange', rgb: [214, 126, 44] },
  { name: 'Purplish Blue', rgb: [80, 91, 166] },
  { name: 'Moderate Red', rgb: [193, 90, 99] },
  { name: 'Purple', rgb: [94, 60, 108] },
  { name: 'Yellow Green', rgb: [157, 188, 64] },
  { name: 'Orange Yellow', rgb: [224, 163, 46] },
  { name: 'Blue', rgb: [56, 61, 150] },
  { name: 'Green', rgb: [70, 148, 73] },
  { name: 'Red', rgb: [175, 54, 60] },
  { name: 'Yellow', rgb: [231, 199, 31] },
  { name: 'Magenta', rgb: [187, 86, 149] },
  { name: 'Cyan', rgb: [8, 133, 161] },
  { name: 'White 95', rgb: [243, 243, 242] },
  { name: 'Neutral 8', rgb: [200, 200, 200] },
  { name: 'Neutral 6.5', rgb: [160, 160, 160] },
  { name: 'Neutral 5', rgb: [122, 122, 121] },
  { name: 'Neutral 3.5', rgb: [85, 85, 85] },
  { name: 'Black 2', rgb: [52, 52, 52] },
];

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
}

function pseudoNoise(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const a = pseudoNoise(ix, iy);
  const b = pseudoNoise(ix + 1, iy);
  const c = pseudoNoise(ix, iy + 1);
  const d = pseudoNoise(ix + 1, iy + 1);

  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm2D(nx: number, ny: number): number {
  let val = 0;
  let amp = 0.5;
  let freq = 6.0;
  for (let i = 0; i < 4; i++) {
    val += amp * valueNoise(nx * freq, ny * freq);
    freq *= 2.15;
    amp *= 0.48;
  }
  return val;
}

/**
 * Computes normalized RGB [0..1] for the Misty Mountain Sunrise Valley scene at (nx, ny).
 * Faithfully matches the CineLUT Studio reference composition:
 * - Upper sunrise sky with streaky clouds and glowing golden sun at (0.81, 0.31)
 * - 3 layered distant mountain ridges with atmospheric blue-slate & warm sun haze
 * - Rolling white/slate valley fog banks between the ridges
 * - Foreground grassy hillside with a signature branching tree on the left knoll
 */
function sampleMistyMountainSunriseRGB(nx: number, ny: number): [number, number, number] {
  const sunX = 0.81;
  const sunY = 0.31;
  const dxSun = (nx - sunX) * 1.35;
  const dySun = (ny - sunY) * 1.95;
  const sunDist = Math.hypot(dxSun, dySun);

  const sunCore = Math.exp(-sunDist * 13.0);
  const sunHalo = Math.exp(-sunDist * 2.8);
  const sunAmbient = clamp(1 - Math.hypot((nx - sunX) * 0.82, (ny - sunY) * 1.05), 0, 1);

  // Base sky gradient: cool slate-blue on left/zenith, warm golden-amber toward right horizon
  const skyT = clamp(ny / 0.52, 0, 1);
  let r = 0.38 + skyT * 0.34 + sunAmbient * 0.28 + sunHalo * 0.42 + sunCore * 0.48;
  let g = 0.46 + skyT * 0.25 + sunAmbient * 0.14 + sunHalo * 0.22 + sunCore * 0.42;
  let b = 0.65 + skyT * 0.08 - sunAmbient * 0.18 - sunHalo * 0.24 + sunCore * 0.24;

  // Organic layered cirrus/stratus sunrise clouds in upper sky (ny < 0.46)
  if (ny < 0.46) {
    const cNoise = fbm2D(nx * 1.8 + 0.3, ny * 6.5);
    const cloudDensity = smoothstep(0.38, 0.74, cNoise) * (1 - smoothstep(0.33, 0.46, ny));
    const rimLight = sunAmbient ** 1.3;
    const cr = 0.38 + rimLight * 0.52;
    const cg = 0.43 + rimLight * 0.28;
    const cb = 0.56 - rimLight * 0.16;
    r = r * (1 - cloudDensity * 0.62) + cr * (cloudDensity * 0.62);
    g = g * (1 - cloudDensity * 0.62) + cg * (cloudDensity * 0.62);
    b = b * (1 - cloudDensity * 0.62) + cb * (cloudDensity * 0.62);
  }

  // Far mountain ridge 1 (horizon ~ 0.43)
  const ridge1 =
    0.42 +
    0.032 * Math.sin(nx * 7.5 + 0.4) -
    0.024 * Math.cos(nx * 13.0) +
    0.008 * valueNoise(nx * 18, 1.2);
  if (ny > ridge1) {
    const depthT = clamp((ny - ridge1) / 0.25, 0, 1);
    const warmHaze = sunAmbient * 0.78;
    r = 0.40 + warmHaze * 0.30 - depthT * 0.08;
    g = 0.44 + warmHaze * 0.15 - depthT * 0.07;
    b = 0.56 - warmHaze * 0.12 - depthT * 0.06;
  }

  // Mid mountain ridge 2 (horizon ~ 0.50)
  const ridge2 =
    0.51 -
    0.045 * Math.sin(nx * 5.2 - 0.8) +
    0.022 * Math.cos(nx * 15.5) +
    0.008 * valueNoise(nx * 24, 3.4);
  if (ny > ridge2) {
    const warmMid = sunAmbient * 0.68;
    const treeTex = (fbm2D(nx * 4.5, ny * 4.5) - 0.5) * 0.07;
    r = 0.29 + warmMid * 0.26 + treeTex;
    g = 0.34 + warmMid * 0.14 + treeTex * 0.9;
    b = 0.45 - warmMid * 0.10 + treeTex * 0.5;
  }

  // Closer dark forested ridge 3 on right and center (horizon ~ 0.60)
  const ridge3 =
    0.61 +
    0.05 * Math.cos(nx * 4.8 + 1.1) -
    0.025 * Math.sin(nx * 11.2) +
    0.009 * valueNoise(nx * 30, 5.1);
  if (ny > ridge3) {
    const canopy = fbm2D(nx * 9.0, ny * 9.0) - 0.5;
    const sunRim = clamp((nx - 0.35) * 1.1, 0, 1);
    r = 0.18 + sunRim * 0.16 + canopy * 0.07;
    g = 0.23 + sunRim * 0.12 + canopy * 0.08;
    b = 0.30 + sunRim * 0.02 + canopy * 0.05;
  }

  // Rolling sea of valley mist/fog ribbons between y = 0.52 and 0.86
  if (ny > 0.48 && ny < 0.88) {
    const mistFbm = fbm2D(nx * 2.4, ny * 4.2);
    const band1 = Math.exp(-(((ny - (0.61 + 0.02 * Math.sin(nx * 7))) / 0.048) ** 2));
    const band2 = Math.exp(-(((ny - (0.73 + 0.03 * Math.cos(nx * 5.5))) / 0.068) ** 2));
    const mistAmount = clamp((band1 * 0.55 + band2 * 0.78) * (0.55 + 0.55 * mistFbm), 0, 0.88);

    const mistR = 0.65 + sunAmbient * 0.24;
    const mistG = 0.68 + sunAmbient * 0.16;
    const mistB = 0.75 - sunAmbient * 0.08;

    r = r * (1 - mistAmount) + mistR * mistAmount;
    g = g * (1 - mistAmount) + mistG * mistAmount;
    b = b * (1 - mistAmount) + mistB * mistAmount;
  }

  // Foreground grassy sunlit hillside sloping from bottom-left (ny ~ 0.74) to bottom-right (ny ~ 0.83)
  const hillLine =
    0.75 +
    (nx - 0.28) * 0.15 -
    0.035 * Math.sin(nx * 5.5) +
    0.012 * (valueNoise(nx * 35, 2.0) - 0.5);

  if (ny > hillLine) {
    const macroPatch = fbm2D(nx * 5.0, ny * 7.0);
    const microTuft = valueNoise(nx * 95.0, ny * 120.0) - 0.5;
    const hillSun = clamp(0.62 + (1 - (ny - hillLine) * 2.1) * 0.42 + nx * 0.22, 0.28, 1.18);

    // Organic meadow grass & golden wildflowers without periodic stripes
    r = (0.28 + macroPatch * 0.22 + microTuft * 0.07) * hillSun;
    g = (0.34 + macroPatch * 0.19 + microTuft * 0.06) * hillSun;
    b = (0.12 + macroPatch * 0.07 + microTuft * 0.02) * hillSun;
  }

  // Signature branching tree on the left foreground knoll (around nx = 0.26, ny = 0.62..0.76)
  const treeBaseX = 0.26;
  const treeBaseY = 0.755;
  if (nx > 0.15 && nx < 0.38 && ny > 0.54 && ny < 0.77) {
    const dy = treeBaseY - ny;
    const trunkX = treeBaseX + Math.sin(dy * 22) * 0.005;
    const distTrunk = Math.abs(nx - trunkX);
    const isTrunk = dy > 0 && dy < 0.13 && distTrunk < 0.0032 * (1.2 - dy * 5);

    const c1 = Math.hypot((nx - 0.245) * 1.5, (ny - 0.635) * 2.3);
    const c2 = Math.hypot((nx - 0.282) * 1.6, (ny - 0.648) * 2.4);
    const c3 = Math.hypot((nx - 0.215) * 1.8, (ny - 0.665) * 2.5);
    const c4 = Math.hypot((nx - 0.342) * 2.1, (ny - 0.695) * 2.5);
    const leafNoise = valueNoise(nx * 240, ny * 190);
    const isCanopy =
      (c1 < 0.056 || c2 < 0.050 || c3 < 0.042 || c4 < 0.036) &&
      leafNoise > 0.32;

    const smallTrunk =
      ny < 0.765 &&
      ny > 0.695 &&
      Math.abs(nx - 0.342) < 0.002;

    if (isTrunk || smallTrunk || isCanopy) {
      r = 0.14 + leafNoise * 0.08;
      g = 0.19 + leafNoise * 0.09;
      b = 0.13 + leafNoise * 0.05;
    }
  }

  return [clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1)];
}

/**
 * Generates an ImageData buffer (width x height) for the selected reference scene.
 */
export function renderReferenceSceneToImageData(
  sceneId: string,
  width: number,
  height: number
): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);

  if (sceneId === 'colorchecker-chart') {
    const cols = 6;
    const rows = 4;
    const padX = Math.floor(width * 0.06);
    const padY = Math.floor(height * 0.08);
    const chartW = width - padX * 2;
    const chartH = Math.floor(height * 0.64);
    const cellW = chartW / cols;
    const cellH = chartH / rows;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        let r = 24;
        let g = 25;
        let b = 28;

        if (x >= padX && x < padX + chartW && y >= padY && y < padY + chartH) {
          const cx = Math.floor((x - padX) / cellW);
          const cy = Math.floor((y - padY) / cellH);
          const localX = ((x - padX) % cellW) / cellW;
          const localY = ((y - padY) % cellH) / cellH;

          if (localX > 0.06 && localX < 0.94 && localY > 0.08 && localY < 0.92) {
            const patchIdx = clamp(cy * cols + cx, 0, 23);
            const [pr, pg, pb] = COLORCHECKER_24[patchIdx].rgb;
            const shade = 0.96 + 0.06 * (1 - localY);
            r = clamp(Math.round(pr * shade), 0, 255);
            g = clamp(Math.round(pg * shade), 0, 255);
            b = clamp(Math.round(pb * shade), 0, 255);
          }
        } else if (y >= padY + chartH + 14 && y < height - 18 && x >= padX && x < padX + chartW) {
          const normX = (x - padX) / chartW;
          const stripY = (y - (padY + chartH + 14)) / (height - 18 - (padY + chartH + 14));
          if (stripY < 0.52) {
            const v = Math.round(normX * 255);
            r = v; g = v; b = v;
          } else {
            const [hr, hg, hb] = hslToRgb(normX * 360, 0.78, 0.52);
            r = Math.round(hr * 255);
            g = Math.round(hg * 255);
            b = Math.round(hb * 255);
          }
        }

        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
    return new ImageData(data, width, height);
  }

  for (let y = 0; y < height; y++) {
    const ny = y / height;
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const idx = (y * width + x) * 4;
      const grain = (pseudoNoise(x, y) - 0.5) * 0.012;

      let r = 0.5;
      let g = 0.5;
      let b = 0.5;

      if (sceneId === 'golden-portrait') {
        if (nx < 0.42) {
          const isMullion =
            Math.abs(nx - 0.21) < 0.012 ||
            Math.abs(nx - 0.415) < 0.014 ||
            Math.abs(ny - 0.48) < 0.016;
          if (isMullion) {
            r = 0.14; g = 0.12; b = 0.11;
          } else {
            const skyGrad = smoothstep(0.0, 0.65, ny);
            r = 0.95 - skyGrad * 0.22;
            g = 0.82 - skyGrad * 0.28;
            b = 0.64 - skyGrad * 0.34;
            if (ny > 0.58) {
              r = 0.48 + 0.12 * Math.sin(nx * 45);
              g = 0.32 + 0.06 * Math.cos(nx * 45);
              b = 0.26;
            }
          }
        } else {
          const bgWarmth = Math.exp(-((nx - 0.42) * 3.2));
          r = 0.09 + bgWarmth * 0.24;
          g = 0.08 + bgWarmth * 0.17;
          b = 0.10 + bgWarmth * 0.11;

          const headDx = (nx - 0.64) / 0.13;
          const headDy = (ny - 0.37) / 0.19;
          const headDist = headDx * headDx + headDy * headDy;

          const shoulderDx = (nx - 0.65) / 0.25;
          const shoulderDy = (ny - 0.78) / 0.28;
          const shoulderDist = shoulderDx * shoulderDx + shoulderDy * shoulderDy;

          if (headDist <= 1.0) {
            const nz = Math.sqrt(Math.max(0, 1 - headDist));
            const keyDot = clamp(-headDx * 0.68 - headDy * 0.25 + nz * 0.68, 0.08, 1);
            const subSurface = Math.pow(clamp(1 - nz, 0, 1), 2) * 0.14;
            r = 0.24 + keyDot * 0.64 + subSurface;
            g = 0.16 + keyDot * 0.47 + subSurface * 0.4;
            b = 0.13 + keyDot * 0.37;
          } else if (shoulderDist <= 1.0 && ny > 0.52) {
            const fold = 0.88 + 0.12 * Math.sin(nx * 38 + ny * 12);
            const keyLight = clamp(1.2 - (nx - 0.42) * 1.6, 0.25, 1);
            r = 0.25 * keyLight * fold;
            g = 0.27 * keyLight * fold;
            b = 0.19 * keyLight * fold;
          }
        }

        if (ny > 0.89 && nx > 0.46 && nx < 0.96) {
          const pIdx = Math.floor(((nx - 0.46) / 0.5) * 8);
          const patches: [number, number, number][] = [
            [0.76, 0.58, 0.50],
            [0.58, 0.41, 0.33],
            [0.42, 0.28, 0.22],
            [0.78, 0.24, 0.24],
            [0.86, 0.64, 0.18],
            [0.27, 0.58, 0.32],
            [0.12, 0.54, 0.64],
            [0.22, 0.32, 0.68],
          ];
          const pt = patches[clamp(pIdx, 0, 7)];
          r = pt[0]; g = pt[1]; b = pt[2];
        }
      } else if (sceneId === 'neon-twilight-street') {
        const horizon = 0.54;
        if (ny < horizon) {
          const skyT = ny / horizon;
          r = 0.11 + skyT * 0.14;
          g = 0.19 + skyT * 0.21;
          b = 0.34 + skyT * 0.28;

          if (nx < 0.48 && ny > nx * 0.55) {
            r = 0.16; g = 0.17; b = 0.21;
            const winX = (nx * 14) % 1;
            const winY = (ny * 10) % 1;
            if (ny > 0.32 && winX > 0.18 && winX < 0.82 && winY > 0.18 && winY < 0.85) {
              r = 0.96;
              g = 0.62 - (1 - winY) * 0.15;
              b = 0.22;
            }
          }
          if (nx > 0.68 && ny > (1 - nx) * 0.7) {
            r = 0.10; g = 0.13; b = 0.19;
            if (nx > 0.74 && nx < 0.84 && ny > 0.34 && ny < 0.44) {
              r = 0.18; g = 0.82; b = 0.92;
            }
          }
        } else {
          const groundT = (ny - horizon) / (1 - horizon);
          const ripple = Math.sin(ny * 110 + nx * 35) * 0.04;
          const amberGlow = Math.exp(-(((nx - 0.28 + ripple) / 0.22) ** 2)) * (1 - groundT * 0.35);
          const cyanGlow = Math.exp(-(((nx - 0.77 - ripple) / 0.14) ** 2)) * (1 - groundT * 0.4);

          r = 0.10 + groundT * 0.06 + amberGlow * 0.82 + cyanGlow * 0.12;
          g = 0.14 + groundT * 0.08 + amberGlow * 0.48 + cyanGlow * 0.58;
          b = 0.22 + groundT * 0.12 + amberGlow * 0.12 + cyanGlow * 0.72;
        }
      } else {
        [r, g, b] = sampleMistyMountainSunriseRGB(nx, ny);
      }

      data[idx] = clamp(Math.round((r + grain) * 255), 0, 255);
      data[idx + 1] = clamp(Math.round((g + grain) * 255), 0, 255);
      data[idx + 2] = clamp(Math.round((b + grain) * 255), 0, 255);
      data[idx + 3] = 255;
    }
  }

  return new ImageData(data, width, height);
}

const thumbnailCache = new Map<string, string>();

/**
 * Generates and caches a graded landscape thumbnail DataURL for a 3D LUT
 * so every card in the Left Sidebar and Bottom Filmstrip displays a live preview.
 */
export function generateLUTThumbnailDataURL(
  lut: LUT3D,
  width = 112,
  height = 68
): string {
  const cacheKey = `${lut.id}-${lut.title}-${width}x${height}`;
  const cached = thumbnailCache.get(cacheKey);
  if (cached) return cached;

  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const img = ctx.createImageData(width, height);
  const dst = img.data;

  for (let y = 0; y < height; y++) {
    const ny = y / height;
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const [r0, g0, b0] = sampleMistyMountainSunriseRGB(nx, ny);
      const [r1, g1, b1] = sampleLUTTrilinear(lut, r0, g0, b0);
      const i = (y * width + x) * 4;
      dst[i] = clamp(Math.round(r1 * 255), 0, 255);
      dst[i + 1] = clamp(Math.round(g1 * 255), 0, 255);
      dst[i + 2] = clamp(Math.round(b1 * 255), 0, 255);
      dst[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const url = canvas.toDataURL('image/jpeg', 0.88);
  thumbnailCache.set(cacheKey, url);
  return url;
}
