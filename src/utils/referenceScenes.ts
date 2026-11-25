import { clamp, hslToRgb } from './lutEngine';

export interface ReferenceScene {
  id: string;
  name: string;
  subtitle: string;
  exifSummary: string;
}

export const REFERENCE_SCENES: ReferenceScene[] = [
  {
    id: 'golden-portrait',
    name: 'Golden Hour Portrait & Skin Chart',
    subtitle: 'Natural skin tones, warm tungsten key light, deep shadow falloff',
    exifSummary: '35mm Prime · f/1.8 · ISO 400 · 5200K',
  },
  {
    id: 'neon-twilight-street',
    name: 'Blue Hour Rain & Amber Storefront',
    subtitle: 'Complementary warm-cool dynamic range for split-toning verification',
    exifSummary: '24mm Anamorphic · f/2.0 · ISO 800 · 3800K',
  },
  {
    id: 'alpine-sunrise',
    name: 'Alpine Emerald Valley & Sunrise Peaks',
    subtitle: 'Foliage greens, cobalt sky gradient, snow highlights, mist reflection',
    exifSummary: '50mm Cinema · f/5.6 · ISO 100 · 5600K',
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

/**
 * Generates an ImageData buffer (width x height) for the selected reference scene
 * with rich continuous gradients, skin tones, highlights, and shadows for accurate LUT grading.
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
            // Subtle lighting vignette inside each patch for 3D depth
            const shade = 0.96 + 0.06 * (1 - localY);
            r = clamp(Math.round(pr * shade), 0, 255);
            g = clamp(Math.round(pg * shade), 0, 255);
            b = clamp(Math.round(pb * shade), 0, 255);
          }
        } else if (y >= padY + chartH + 14 && y < height - 18 && x >= padX && x < padX + chartW) {
          // Bottom 16-stop continuous + stepped grayscale & hue spectrum strip
          const normX = (x - padX) / chartW;
          const stripY = (y - (padY + chartH + 14)) / (height - 18 - (padY + chartH + 14));
          if (stripY < 0.52) {
            // Continuous + 16-zone luma ramp
            const v = Math.round(normX * 255);
            r = v; g = v; b = v;
          } else {
            // 360-degree full hue spectrum bar
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
      const grain = (pseudoNoise(x, y) - 0.5) * 0.015;

      let r = 0.5;
      let g = 0.5;
      let b = 0.5;

      if (sceneId === 'golden-portrait') {
        // Warehouse window golden light on left, subject portrait silhouette & natural skin tone sphere in center-right, colour reference strip at bottom
        if (nx < 0.42) {
          // Industrial window panes with warm golden city horizon
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
              // Distant warm brick rooftops
              r = 0.48 + 0.12 * Math.sin(nx * 45);
              g = 0.32 + 0.06 * Math.cos(nx * 45);
              b = 0.26;
            }
          }
        } else {
          // Dark studio interior background with warm rim falloff
          const bgWarmth = Math.exp(-((nx - 0.42) * 3.2));
          r = 0.09 + bgWarmth * 0.24;
          g = 0.08 + bgWarmth * 0.17;
          b = 0.10 + bgWarmth * 0.11;

          // Subject portrait head & shoulders with realistic skin-tone shading
          const headDx = (nx - 0.64) / 0.13;
          const headDy = (ny - 0.37) / 0.19;
          const headDist = headDx * headDx + headDy * headDy;

          const shoulderDx = (nx - 0.65) / 0.25;
          const shoulderDy = (ny - 0.78) / 0.28;
          const shoulderDist = shoulderDx * shoulderDx + shoulderDy * shoulderDy;

          if (headDist <= 1.0) {
            // 3D sphere shading simulating human skin tones from key light on left (-x)
            const nz = Math.sqrt(Math.max(0, 1 - headDist));
            const keyDot = clamp(-headDx * 0.68 - headDy * 0.25 + nz * 0.68, 0.08, 1);
            const subSurface = Math.pow(clamp(1 - nz, 0, 1), 2) * 0.14;
            r = 0.24 + keyDot * 0.64 + subSurface;
            g = 0.16 + keyDot * 0.47 + subSurface * 0.4;
            b = 0.13 + keyDot * 0.37;
          } else if (shoulderDist <= 1.0 && ny > 0.52) {
            // Olive canvas field jacket with folds
            const fold = 0.88 + 0.12 * Math.sin(nx * 38 + ny * 12);
            const keyLight = clamp(1.2 - (nx - 0.42) * 1.6, 0.25, 1);
            r = 0.25 * keyLight * fold;
            g = 0.27 * keyLight * fold;
            b = 0.19 * keyLight * fold;
          }
        }

        // Mini 8-patch cinema skin & primary reference bar along bottom right
        if (ny > 0.89 && nx > 0.46 && nx < 0.96) {
          const pIdx = Math.floor(((nx - 0.46) / 0.5) * 8);
          const patches: [number, number, number][] = [
            [0.76, 0.58, 0.50], // Light Skin
            [0.58, 0.41, 0.33], // Medium Skin
            [0.42, 0.28, 0.22], // Deep Skin
            [0.78, 0.24, 0.24], // Cinema Red
            [0.86, 0.64, 0.18], // Amber Gold
            [0.27, 0.58, 0.32], // Foliage Green
            [0.12, 0.54, 0.64], // Teal Cyan
            [0.22, 0.32, 0.68], // Slate Blue
          ];
          const pt = patches[clamp(pIdx, 0, 7)];
          r = pt[0]; g = pt[1]; b = pt[2];
        }
      } else if (sceneId === 'neon-twilight-street') {
        // Blue hour twilight sky + warm amber cafe storefront on left + wet asphalt reflections
        const horizon = 0.54;
        if (ny < horizon) {
          // Deep blue hour sky gradient with urban building silhouettes
          const skyT = ny / horizon;
          r = 0.11 + skyT * 0.14;
          g = 0.19 + skyT * 0.21;
          b = 0.34 + skyT * 0.28;

          // Left building facade with glowing warm tungsten storefront windows
          if (nx < 0.48 && ny > nx * 0.55) {
            r = 0.16; g = 0.17; b = 0.21;
            const winX = (nx * 14) % 1;
            const winY = (ny * 10) % 1;
            if (ny > 0.32 && winX > 0.18 && winX < 0.82 && winY > 0.18 && winY < 0.85) {
              // Glowing amber cafe interior
              r = 0.96;
              g = 0.62 - (1 - winY) * 0.15;
              b = 0.22;
            }
          }
          // Right perspective buildings with cyan neon sign accent
          if (nx > 0.68 && ny > (1 - nx) * 0.7) {
            r = 0.10; g = 0.13; b = 0.19;
            if (nx > 0.74 && nx < 0.84 && ny > 0.34 && ny < 0.44) {
              r = 0.18; g = 0.82; b = 0.92;
            }
          }
        } else {
          // Rain-slicked street reflecting warm storefront on left and cool twilight sky in center/right
          const groundT = (ny - horizon) / (1 - horizon);
          const ripple = Math.sin(ny * 110 + nx * 35) * 0.04;
          const amberGlow = Math.exp(-(((nx - 0.28 + ripple) / 0.22) ** 2)) * (1 - groundT * 0.35);
          const cyanGlow = Math.exp(-(((nx - 0.77 - ripple) / 0.14) ** 2)) * (1 - groundT * 0.4);

          r = 0.10 + groundT * 0.06 + amberGlow * 0.82 + cyanGlow * 0.12;
          g = 0.14 + groundT * 0.08 + amberGlow * 0.48 + cyanGlow * 0.58;
          b = 0.22 + groundT * 0.12 + amberGlow * 0.12 + cyanGlow * 0.72;
        }
      } else {
        // Alpine sunrise: golden sunrise sky, snow peaks, emerald pine forest, misty lake reflection
        const lakeY = 0.62;
        const mNy = ny < lakeY ? ny : lakeY - (ny - lakeY) * 0.85;
        const isReflection = ny >= lakeY;

        // Sunrise sky gradient from cobalt zenith to warm golden-rose horizon
        const skyT = clamp(mNy / lakeY, 0, 1);
        const sunDist = Math.hypot(nx - 0.38, mNy - 0.38);
        const sunGlow = Math.exp(-sunDist * 4.2);

        r = 0.20 + skyT * 0.64 + sunGlow * 0.35;
        g = 0.34 + skyT * 0.42 + sunGlow * 0.24;
        b = 0.62 - skyT * 0.18 + sunGlow * 0.08;

        // Mountain ridge profile
        const peakH =
          0.32 +
          0.12 * Math.sin(nx * 6.5 - 0.6) +
          0.06 * Math.cos(nx * 17) +
          (nx > 0.6 ? -(nx - 0.6) * 0.45 : 0);

        if (mNy > peakH) {
          // Slate mountain rock with sunlit snow ridges
          const snowMask = smoothstep(0.02, 0.09, Math.sin(nx * 28 + mNy * 18) * 0.5 + (0.48 - mNy));
          const sunAngle = clamp(1.1 - Math.abs(nx - 0.38) * 1.4, 0.35, 1.0);
          r = (0.28 * (1 - snowMask) + 0.88 * snowMask) * sunAngle;
          g = (0.31 * (1 - snowMask) + 0.84 * snowMask) * sunAngle;
          b = (0.37 * (1 - snowMask) + 0.86 * snowMask);
        }

        // Foreground pine forest slopes on left and right
        const forestLine = 0.58 - Math.abs(nx - 0.52) * 0.48 + 0.02 * Math.sin(nx * 95);
        if (mNy > forestLine) {
          const treeTex = 0.82 + 0.18 * Math.sin(nx * 140) * Math.cos(mNy * 90);
          r = 0.11 * treeTex;
          g = 0.26 * treeTex;
          b = 0.16 * treeTex;
        }

        if (isReflection) {
          const waterRipple = 0.92 + 0.08 * Math.sin(ny * 130 + nx * 20);
          r = r * 0.78 * waterRipple;
          g = (g * 0.84 + 0.04) * waterRipple;
          b = (b * 0.88 + 0.06) * waterRipple;
        }
      }

      data[idx] = clamp(Math.round((r + grain) * 255), 0, 255);
      data[idx + 1] = clamp(Math.round((g + grain) * 255), 0, 255);
      data[idx + 2] = clamp(Math.round((b + grain) * 255), 0, 255);
      data[idx + 3] = 255;
    }
  }

  return new ImageData(data, width, height);
}
