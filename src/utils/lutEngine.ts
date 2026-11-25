export interface LUT3D {
  id: string;
  title: string;
  format: 'cube' | '3dl';
  size: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  /** Flattened array of length size^3 * 3 where index = ((b * size + g) * size + r) * 3 */
  data: Float32Array;
  category?: string;
  description?: string;
  rawText?: string;
}

export type HSLChannelName =
  | 'Red'
  | 'Orange'
  | 'Yellow'
  | 'Green'
  | 'Aqua'
  | 'Blue'
  | 'Purple'
  | 'Magenta';

export const HSL_CHANNELS: HSLChannelName[] = [
  'Red',
  'Orange',
  'Yellow',
  'Green',
  'Aqua',
  'Blue',
  'Purple',
  'Magenta',
];

export interface HSLChannelAdjustments {
  hue: number;        // -100 to +100
  saturation: number; // -100 to +100
  luminance: number;  // -100 to +100
}

export interface CurvePoint {
  x: number; // 0 to 255
  y: number; // 0 to 255
}

export interface LightroomXMPParams {
  presetName: string;
  presetGroup: string;
  uuid: string;
  supportsAmount: boolean;
  lutIntensity: number;       // 0 to 150 (%)
  skinToneProtection: number; // 0 to 100 (%)
  curvePointCount: 5 | 9 | 17;

  // Basic Tone
  temperature: number;  // -100 to +100 (crs:IncrementalTemperature)
  tint: number;         // -100 to +100 (crs:IncrementalTint)
  exposure: number;     // -5.00 to +5.00 (crs:Exposure2012)
  contrast: number;     // -100 to +100 (crs:Contrast2012)
  highlights: number;   // -100 to +100 (crs:Highlights2012)
  shadows: number;      // -100 to +100 (crs:Shadows2012)
  whites: number;       // -100 to +100 (crs:Whites2012)
  blacks: number;       // -100 to +100 (crs:Blacks2012)
  clarity: number;      // -100 to +100 (crs:Clarity2012)
  dehaze: number;       // -100 to +100 (crs:Dehaze)
  vibrance: number;     // -100 to +100 (crs:Vibrance)
  saturation: number;   // -100 to +100 (crs:Saturation)

  // Parametric Tone Curve
  parametricShadows: number;    // -100 to +100
  parametricDarks: number;      // -100 to +100
  parametricLights: number;     // -100 to +100
  parametricHighlights: number; // -100 to +100

  // Point Tone Curves (0..255 coordinates)
  toneCurveRGB: CurvePoint[];
  toneCurveRed: CurvePoint[];
  toneCurveGreen: CurvePoint[];
  toneCurveBlue: CurvePoint[];

  // 8-Channel HSL
  hsl: Record<HSLChannelName, HSLChannelAdjustments>;

  // 3-Way Color Grading (Split Toning)
  shadowHue: number;        // 0 to 360
  shadowSat: number;        // 0 to 100
  shadowLum: number;        // -100 to +100
  midtoneHue: number;       // 0 to 360
  midtoneSat: number;       // 0 to 100
  midtoneLum: number;       // -100 to +100
  highlightHue: number;     // 0 to 360
  highlightSat: number;     // 0 to 100
  highlightLum: number;     // -100 to +100
  colorGradeBlending: number; // 0 to 100
  splitToningBalance: number; // -100 to +100

  // Camera Calibration
  shadowTint: number;       // -100 to +100
  redPrimaryHue: number;    // -100 to +100
  redPrimarySat: number;    // -100 to +100
  greenPrimaryHue: number;  // -100 to +100
  greenPrimarySat: number;  // -100 to +100
  bluePrimaryHue: number;   // -100 to +100
  bluePrimarySat: number;   // -100 to +100

  // Effects
  grainAmount: number;      // 0 to 100
  postCropVignette: number; // -100 to +100
}

export interface LUTAnalysisMetrics {
  meanDeltaE: number;
  maxDeltaE: number;
  dynamicRangeCompression: number; // % difference in black-to-white span
  warmthShiftKelvinApprox: number;
  saturationBiasPercent: number;
  blackFloorLift: number; // 0..255
  whiteCeilingClip: number; // 0..255
  dominantShadowCast: string;
  dominantHighlightCast: string;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function deterministicUUID(seed: string): string {
  let h1 = 0xdeadbeef ^ seed.length;
  let h2 = 0x41c6ce57 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0').toUpperCase();
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0').toUpperCase();
  return `${hex1}${hex2}${hex1.slice(0, 8)}${hex2.slice(0, 8)}`;
}

/**
 * Computes an 8-character hex fingerprint from the actual Float32Array RGB values of a 3D LUT
 * so two different LUTs never collide even if their internal TITLE header is identical.
 */
export function computeLUTDataHash(data: Float32Array, salt = ''): string {
  let h = 0x811c9dc5;
  const step = Math.max(1, Math.floor(data.length / 512));
  for (let i = 0; i < data.length; i += step) {
    const quantized = Math.round((data[i] || 0) * 10000);
    h ^= quantized & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (quantized >> 8) & 0xff;
    h = Math.imul(h, 0x01000193);
  }
  for (let i = 0; i < salt.length; i++) {
    h ^= salt.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

const GENERIC_LUT_TITLES = new Set([
  '',
  '"',
  "''",
  'untitled',
  'lut',
  '3d lut',
  'cube',
  'custom',
  'default',
  'none',
  'null',
  'generated by resolve',
  'davinci resolve',
  'adobe photoshop',
  'iwltbap',
  '3d lut creator',
]);

function resolveBestLUTTitle(internalTitle: string | null, fallbackTitle: string): string {
  const cleanInternal = (internalTitle ?? '').replace(/^["']+|["']+$/g, '').trim();
  const cleanFallback = fallbackTitle.replace(/^["']+|["']+$/g, '').trim();

  // If the caller provided a real filename (not the default placeholder), prefer the filename
  // so uploading multiple LUTs from a pack with identical internal TITLE headers never collides!
  const isDefaultPlaceholder =
    !cleanFallback ||
    cleanFallback === 'Custom Cinema LUT' ||
    cleanFallback === 'Custom 3DL Grade';

  if (!isDefaultPlaceholder) {
    return cleanFallback;
  }

  if (cleanInternal && !GENERIC_LUT_TITLES.has(cleanInternal.toLowerCase())) {
    return cleanInternal;
  }

  return cleanFallback || 'Custom Cinema LUT';
}

/**
 * Parses an Adobe / IRIDAS .cube 1D or 3D LUT file into a LUT3D structure.
 * Supports 1D LUTs, 3D LUTs, combined 1D shaper + 3D LUTs, scientific notation,
 * LUT_3D_INPUT_RANGE, DOMAIN_MIN/MAX, comments, and out-of-range float clamping.
 */
export function parseCubeLUT(text: string, fallbackTitle = 'Custom Cinema LUT'): LUT3D {
  const cleanText = text.replace(/^\uFEFF/, ''); // Strip UTF-8 BOM if present
  const lines = cleanText.split(/\r?\n/);
  let internalTitle: string | null = null;
  let size3D = 0;
  let size1D = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const values: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    // Strip inline comments starting with # or //
    const raw = lines[i].replace(/(#.*|\/\/.*)$/, '').trim();
    if (!raw || raw.startsWith(';')) continue;

    const upper = raw.toUpperCase();
    if (upper.startsWith('TITLE')) {
      const quotedMatch = raw.match(/^TITLE\s+"([^"]*)"/i);
      if (quotedMatch) {
        internalTitle = quotedMatch[1].trim();
      } else {
        const unquotedMatch = raw.match(/^TITLE\s+(.+)$/i);
        if (unquotedMatch) {
          internalTitle = unquotedMatch[1].replace(/^["']+|["']+$/g, '').trim();
        }
      }
      continue;
    }
    if (upper.startsWith('LUT_3D_SIZE')) {
      const parts = raw.split(/\s+/);
      const parsed = parseInt(parts[1], 10);
      if (!Number.isNaN(parsed) && parsed >= 2) {
        size3D = parsed;
      }
      continue;
    }
    if (upper.startsWith('LUT_1D_SIZE')) {
      const parts = raw.split(/\s+/);
      const parsed = parseInt(parts[1], 10);
      if (!Number.isNaN(parsed) && parsed >= 2) {
        size1D = parsed;
      }
      continue;
    }
    if (upper.startsWith('LUT_3D_INPUT_RANGE') || upper.startsWith('LUT_1D_INPUT_RANGE')) {
      const parts = raw.split(/\s+/).slice(1).map(Number);
      if (parts.length >= 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
        domainMin = [parts[0], parts[0], parts[0]];
        domainMax = [parts[1], parts[1], parts[1]];
      }
      continue;
    }
    if (upper.startsWith('DOMAIN_MIN')) {
      const parts = raw.split(/\s+/).slice(1).map(Number);
      if (parts.length >= 3 && parts.every((n) => !Number.isNaN(n))) {
        domainMin = [parts[0], parts[1], parts[2]];
      }
      continue;
    }
    if (upper.startsWith('DOMAIN_MAX')) {
      const parts = raw.split(/\s+/).slice(1).map(Number);
      if (parts.length >= 3 && parts.every((n) => !Number.isNaN(n))) {
        domainMax = [parts[0], parts[1], parts[2]];
      }
      continue;
    }
    if (/^[A-Z_]/i.test(raw)) {
      continue;
    }

    // Numeric triplet line (supports spaces, tabs, commas, scientific notation)
    const tokens = raw.split(/[\s,]+/);
    if (tokens.length >= 3) {
      const n0 = Number(tokens[0]);
      const n1 = Number(tokens[1]);
      const n2 = Number(tokens[2]);
      if (Number.isFinite(n0) && Number.isFinite(n1) && Number.isFinite(n2)) {
        values.push(n0, n1, n2);
      }
    }
  }

  const title = resolveBestLUTTitle(internalTitle, fallbackTitle);

  // Pure 1D LUT (no 3D size specified)
  if (size3D === 0 && size1D >= 2 && values.length >= size1D * 3) {
    const grid = 17;
    const data = new Float32Array(grid * grid * grid * 3);
    const sample1D = (t: number, channel: 0 | 1 | 2) => {
      const pos = clamp(t, 0, 1) * (size1D - 1);
      const idx0 = Math.floor(pos);
      const idx1 = Math.min(size1D - 1, idx0 + 1);
      const frac = pos - idx0;
      return clamp(
        values[idx0 * 3 + channel] * (1 - frac) + values[idx1 * 3 + channel] * frac,
        0,
        1
      );
    };
    let ptr = 0;
    for (let b = 0; b < grid; b++) {
      for (let g = 0; g < grid; g++) {
        for (let r = 0; r < grid; r++) {
          data[ptr++] = sample1D(r / (grid - 1), 0);
          data[ptr++] = sample1D(g / (grid - 1), 1);
          data[ptr++] = sample1D(b / (grid - 1), 2);
        }
      }
    }
    const hash = computeLUTDataHash(data, title);
    return {
      id: `lut-${hash}`,
      title,
      format: 'cube',
      size: grid,
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
      data,
    };
  }

  let size = size3D;
  if (!size) {
    const triplets = Math.floor(values.length / 3);
    const inferred = Math.round(Math.cbrt(triplets));
    if (inferred >= 2 && inferred * inferred * inferred === triplets) {
      size = inferred;
    }
  }

  const expectedFloats = size * size * size * 3;
  if (size < 2 || size > 128 || values.length < expectedFloats) {
    throw new Error(
      `Invalid .cube LUT: expected ${size > 0 ? `${size}^3 (${size * size * size})` : 'valid LUT_3D_SIZE'} RGB triplets, found ${Math.floor(values.length / 3)}.`
    );
  }

  // If file contained a 1D shaper table followed by the 3D LUT table, slice the trailing 3D table
  const startOffset =
    size1D > 0 && values.length >= (size1D + size * size * size) * 3
      ? size1D * 3
      : 0;
  const raw3D = new Float32Array(values.slice(startOffset, startOffset + expectedFloats));

  // Normalize if integer code values (e.g. 0..1023 or 0..4095) were stored inside a .cube file
  let maxVal = 0;
  for (let i = 0; i < raw3D.length; i++) {
    if (raw3D[i] > maxVal) maxVal = raw3D[i];
  }
  if (maxVal > 2.0) {
    const div = maxVal <= 256 ? 255 : maxVal <= 1024 ? 1023 : maxVal <= 4096 ? 4095 : 65535;
    for (let i = 0; i < raw3D.length; i++) {
      raw3D[i] = clamp(raw3D[i] / div, 0, 1);
    }
  }

  const hash = computeLUTDataHash(raw3D, title);
  return {
    id: `lut-${hash}`,
    title,
    format: 'cube',
    size,
    domainMin,
    domainMax,
    data: raw3D,
  };
}

/**
 * Parses an Autodesk / Assimilate .3dl 3D LUT file into a standard LUT3D structure
 * (note: .3dl normally orders Blue fastest, then Green, then Red, and uses integer code values).
 */
export function parse3dlLUT(text: string, fallbackTitle = 'Custom 3DL Grade'): LUT3D {
  const cleanText = text.replace(/^\uFEFF/, '');
  const lines = cleanText.split(/\r?\n/);
  const triplets: [number, number, number][] = [];
  let meshSize = 0;

  for (const rawLine of lines) {
    const line = rawLine.replace(/(#.*|\/\/.*)$/, '').trim();
    if (!line || line.startsWith(';')) continue;
    if (/^3DMESH/i.test(line) || /^Mesh/i.test(line)) {
      const m = line.match(/(\d+)\s+(\d+)/);
      if (m) {
        const candidate = parseInt(m[1], 10);
        if (candidate >= 2 && candidate <= 128) {
          meshSize = candidate;
        }
      }
      continue;
    }
    if (/^[A-Za-z]/.test(line)) continue;

    const nums = line
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n));
    if (nums.length > 3 && meshSize === 0) {
      meshSize = nums.length;
      continue;
    }
    if (nums.length === 3) {
      triplets.push([nums[0], nums[1], nums[2]]);
    }
  }

  // Some .3dl files have an initial 3-element shaper header line before N^3 triplets
  const cubeRootExact = Math.round(Math.cbrt(triplets.length));
  const cubeRootMinusOne = Math.round(Math.cbrt(Math.max(0, triplets.length - 1)));
  if (
    cubeRootExact * cubeRootExact * cubeRootExact !== triplets.length &&
    cubeRootMinusOne >= 2 &&
    cubeRootMinusOne * cubeRootMinusOne * cubeRootMinusOne === triplets.length - 1
  ) {
    triplets.shift();
    if (!meshSize) meshSize = cubeRootMinusOne;
  }

  if (!meshSize) {
    const inferred = Math.round(Math.cbrt(triplets.length));
    if (inferred >= 2 && inferred * inferred * inferred === triplets.length) {
      meshSize = inferred;
    }
  }

  if (meshSize < 2 || triplets.length < meshSize * meshSize * meshSize) {
    throw new Error(`Invalid .3dl LUT file: found ${triplets.length} RGB triplets.`);
  }

  let maxVal = 0;
  for (let i = 0; i < triplets.length; i++) {
    maxVal = Math.max(maxVal, triplets[i][0], triplets[i][1], triplets[i][2]);
  }
  const divisor =
    maxVal <= 1.5 ? 1 : maxVal <= 256 ? 255 : maxVal <= 1024 ? 1023 : maxVal <= 4096 ? 4095 : 65535;

  const data = new Float32Array(meshSize * meshSize * meshSize * 3);
  let srcIdx = 0;
  for (let r = 0; r < meshSize; r++) {
    for (let g = 0; g < meshSize; g++) {
      for (let b = 0; b < meshSize; b++) {
        const dstIdx = ((b * meshSize + g) * meshSize + r) * 3;
        const [tr, tg, tb] = triplets[srcIdx++];
        data[dstIdx] = clamp(tr / divisor, 0, 1);
        data[dstIdx + 1] = clamp(tg / divisor, 0, 1);
        data[dstIdx + 2] = clamp(tb / divisor, 0, 1);
      }
    }
  }

  const hash = computeLUTDataHash(data, fallbackTitle);
  return {
    id: `lut-3dl-${hash}`,
    title: fallbackTitle,
    format: '3dl',
    size: meshSize,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data,
  };
}

/**
 * Universal LUT file parser supporting .cube, .3dl, .look, and .lut files.
 * Automatically tries the format matching the extension and falls back to the alternate parser.
 */
export function parseAnyLUTFile(text: string, filename: string): LUT3D {
  const cleanName = filename.replace(/\.(cube|3dl|look|lut|txt)$/i, '').trim() || 'Imported Cinema LUT';
  const is3dlExt = /\.3dl$/i.test(filename);
  const hasCubeHeader = /LUT_3D_SIZE|LUT_1D_SIZE|DOMAIN_MIN|DOMAIN_MAX/i.test(text);

  if (is3dlExt && !hasCubeHeader) {
    try {
      return parse3dlLUT(text, cleanName);
    } catch {
      return parseCubeLUT(text, cleanName);
    }
  }

  try {
    return parseCubeLUT(text, cleanName);
  } catch (cubeErr) {
    try {
      return parse3dlLUT(text, cleanName);
    } catch {
      throw cubeErr;
    }
  }
}

/**
 * Serializes any LUT3D structure into a valid Adobe .cube string.
 */
export function serializeCubeLUT(lut: LUT3D): string {
  const lines: string[] = [
    `TITLE "${lut.title}"`,
    `# Generated by ChromaXMP Color Science Engine`,
    `LUT_3D_SIZE ${lut.size}`,
    `DOMAIN_MIN ${lut.domainMin.map((n) => n.toFixed(6)).join(' ')}`,
    `DOMAIN_MAX ${lut.domainMax.map((n) => n.toFixed(6)).join(' ')}`,
    '',
  ];
  const total = lut.size * lut.size * lut.size;
  for (let i = 0; i < total; i++) {
    const r = lut.data[i * 3].toFixed(6);
    const g = lut.data[i * 3 + 1].toFixed(6);
    const b = lut.data[i * 3 + 2].toFixed(6);
    lines.push(`${r} ${g} ${b}`);
  }
  return lines.join('\n');
}

/**
 * Performs trilinear interpolation on a 3D LUT for input RGB in [0..1].
 */
export function sampleLUTTrilinear(
  lut: LUT3D,
  rIn: number,
  gIn: number,
  bIn: number
): [number, number, number] {
  const { size, domainMin, domainMax, data } = lut;
  const rNorm = clamp((rIn - domainMin[0]) / (domainMax[0] - domainMin[0] || 1), 0, 1);
  const gNorm = clamp((gIn - domainMin[1]) / (domainMax[1] - domainMin[1] || 1), 0, 1);
  const bNorm = clamp((bIn - domainMin[2]) / (domainMax[2] - domainMin[2] || 1), 0, 1);

  const maxIdx = size - 1;
  const rPos = rNorm * maxIdx;
  const gPos = gNorm * maxIdx;
  const bPos = bNorm * maxIdx;

  const r0 = Math.floor(rPos);
  const g0 = Math.floor(gPos);
  const b0 = Math.floor(bPos);

  const r1 = Math.min(maxIdx, r0 + 1);
  const g1 = Math.min(maxIdx, g0 + 1);
  const b1 = Math.min(maxIdx, b0 + 1);

  const dr = rPos - r0;
  const dg = gPos - g0;
  const db = bPos - b0;

  const getIndex = (r: number, g: number, b: number) => ((b * size + g) * size + r) * 3;

  const i000 = getIndex(r0, g0, b0);
  const i100 = getIndex(r1, g0, b0);
  const i010 = getIndex(r0, g1, b0);
  const i110 = getIndex(r1, g1, b0);
  const i001 = getIndex(r0, g0, b1);
  const i101 = getIndex(r1, g0, b1);
  const i011 = getIndex(r0, g1, b1);
  const i111 = getIndex(r1, g1, b1);

  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const c00 = data[i000 + c] * (1 - dr) + data[i100 + c] * dr;
    const c01 = data[i001 + c] * (1 - dr) + data[i101 + c] * dr;
    const c10 = data[i010 + c] * (1 - dr) + data[i110 + c] * dr;
    const c11 = data[i011 + c] * (1 - dr) + data[i111 + c] * dr;

    const c0 = c00 * (1 - dg) + c10 * dg;
    const c1 = c01 * (1 - dg) + c11 * dg;

    out[c] = clamp(c0 * (1 - db) + c1 * db, 0, 1);
  }
  return out;
}

/**
 * RGB [0..1] to HSL [h: 0..360, s: 0..1, l: 0..1]
 */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  if (d < 1e-6) {
    return [0, 0, l];
  }

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  } else if (max === g) {
    h = ((b - r) / d + 2) * 60;
  } else {
    h = ((r - g) / d + 4) * 60;
  }
  return [h % 360, clamp(s, 0, 1), clamp(l, 0, 1)];
}

/**
 * HSL [h: 0..360, s: 0..1, l: 0..1] to RGB [0..1]
 */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 1);
  const lum = clamp(l, 0, 1);

  if (sat < 1e-6) {
    return [lum, lum, lum];
  }

  const c = (1 - Math.abs(2 * lum - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lum - c / 2;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hue < 60) {
    r1 = c; g1 = x; b1 = 0;
  } else if (hue < 120) {
    r1 = x; g1 = c; b1 = 0;
  } else if (hue < 180) {
    r1 = 0; g1 = c; b1 = x;
  } else if (hue < 240) {
    r1 = 0; g1 = x; b1 = c;
  } else if (hue < 300) {
    r1 = x; g1 = 0; b1 = c;
  } else {
    r1 = c; g1 = 0; b1 = x;
  }

  return [clamp(r1 + m, 0, 1), clamp(g1 + m, 0, 1), clamp(b1 + m, 0, 1)];
}

/**
 * Canonical hue centers (degrees) for Adobe Lightroom's 8 HSL channels.
 */
export const ACR_HUE_CENTERS: Record<HSLChannelName, number> = {
  Red: 0,
  Orange: 28,
  Yellow: 56,
  Green: 120,
  Aqua: 180,
  Blue: 225,
  Purple: 275,
  Magenta: 320,
};

function shortestAngleDelta(fromDeg: number, toDeg: number): number {
  let diff = ((toDeg - fromDeg + 540) % 360) - 180;
  if (diff < -180) diff += 360;
  return diff;
}

/**
 * Evaluates a piece-wise linear or smooth tone curve defined by CurvePoint[] in [0..255] space for input x in [0..1].
 */
export function evaluateCurve01(points: CurvePoint[], x01: number): number {
  if (!points.length) return clamp(x01, 0, 1);
  const x = clamp(x01 * 255, 0, 255);
  if (x <= points[0].x) return clamp(points[0].y / 255, 0, 1);
  if (x >= points[points.length - 1].x) return clamp(points[points.length - 1].y / 255, 0, 1);

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    if (x >= p0.x && x <= p1.x) {
      const span = p1.x - p0.x || 1;
      const t = (x - p0.x) / span;
      const y = p0.y * (1 - t) + p1.y * t;
      return clamp(y / 255, 0, 1);
    }
  }
  return clamp(x01, 0, 1);
}

/**
 * Analytically fits an arbitrary 3D LUT into a full set of Adobe Lightroom Classic / ACR Develop parameters.
 */
export function fitLUTToLightroomXMP(
  lut: LUT3D,
  options?: {
    presetName?: string;
    presetGroup?: string;
    lutIntensity?: number;
    skinToneProtection?: number;
    curvePointCount?: 5 | 9 | 17;
  }
): { params: LightroomXMPParams; metrics: LUTAnalysisMetrics } {
  const presetName = options?.presetName ?? lut.title;
  const presetGroup = options?.presetGroup ?? 'ChromaXMP Cinema Grades';
  const lutIntensity = options?.lutIntensity ?? 100;
  const skinToneProtection = options?.skinToneProtection ?? 35;
  const curvePointCount = options?.curvePointCount ?? 9;
  const mix = clamp(lutIntensity / 100, 0, 1.5);

  const sampleMixed = (r: number, g: number, b: number): [number, number, number] => {
    const [lr, lg, lb] = sampleLUTTrilinear(lut, r, g, b);
    return [
      clamp(r + (lr - r) * mix, 0, 1),
      clamp(g + (lg - g) * mix, 0, 1),
      clamp(b + (lb - b) * mix, 0, 1),
    ];
  };

  // 1. Sample Neutral Axis for Tone Curves & White Balance
  const toneCurveRGB: CurvePoint[] = [];
  const toneCurveRed: CurvePoint[] = [];
  const toneCurveGreen: CurvePoint[] = [];
  const toneCurveBlue: CurvePoint[] = [];

  for (let i = 0; i < curvePointCount; i++) {
    const t = i / (curvePointCount - 1);
    const x255 = Math.round(t * 255);
    const [nr, ng, nb] = sampleMixed(t, t, t);
    const luma = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;

    toneCurveRGB.push({ x: x255, y: clamp(Math.round(luma * 255), 0, 255) });
    toneCurveRed.push({ x: x255, y: clamp(Math.round(nr * 255), 0, 255) });
    toneCurveGreen.push({ x: x255, y: clamp(Math.round(ng * 255), 0, 255) });
    toneCurveBlue.push({ x: x255, y: clamp(Math.round(nb * 255), 0, 255) });
  }

  // Analyze black point, midtone exposure, shadow/highlight slopes
  const [b0r, b0g, b0b] = sampleMixed(0, 0, 0);
  const [w1r, w1g, w1b] = sampleMixed(1, 1, 1);
  const [m5r, m5g, m5b] = sampleMixed(0.5, 0.5, 0.5);
  const [s2r, s2g, s2b] = sampleMixed(0.2, 0.2, 0.2);
  const [h8r, h8g, h8b] = sampleMixed(0.8, 0.8, 0.8);

  const luma0 = 0.2126 * b0r + 0.7152 * b0g + 0.0722 * b0b;
  const luma1 = 0.2126 * w1r + 0.7152 * w1g + 0.0722 * w1b;
  const lumaMid = 0.2126 * m5r + 0.7152 * m5g + 0.0722 * m5b;
  const lumaShadow = 0.2126 * s2r + 0.7152 * s2g + 0.0722 * s2b;
  const lumaHigh = 0.2126 * h8r + 0.7152 * h8g + 0.0722 * h8b;

  // Exposure in stops around mid-gray (0.5)
  const exposure = Number(clamp(Math.log2(Math.max(0.05, lumaMid) / 0.5) * 0.85, -3.0, 3.0).toFixed(2));
  // Contrast from midtone slope (0.2 to 0.8 span is normally 0.6)
  const midSlope = (lumaHigh - lumaShadow) / 0.6;
  const contrast = clamp(Math.round((midSlope - 1) * 115), -100, 100);

  const shadows = clamp(Math.round((lumaShadow - 0.2) * 190), -100, 100);
  const highlights = clamp(Math.round((lumaHigh - 0.8) * 190), -100, 100);
  const blacks = clamp(Math.round(luma0 * 180), -100, 100);
  const whites = clamp(Math.round((luma1 - 1.0) * 180), -100, 100);

  // Temperature (R - B balance at mid-gray) & Tint (G vs R/B average)
  const temperature = clamp(Math.round((m5r - m5b) * 130), -100, 100);
  const tint = clamp(Math.round(((m5r + m5b) / 2 - m5g) * 130), -100, 100);

  // Parametric curve decomposition
  const parametricShadows = clamp(Math.round((luma0 - 0.02) * 120), -100, 100);
  const parametricDarks = clamp(Math.round((lumaShadow - 0.2) * 110), -100, 100);
  const parametricLights = clamp(Math.round((lumaHigh - 0.8) * 110), -100, 100);
  const parametricHighlights = clamp(Math.round((luma1 - 0.98) * 120), -100, 100);

  // 2. 3-Way Color Grading (Shadows, Midtones, Highlights)
  const [shHue, shSat] = rgbToHsl(s2r, s2g, s2b);
  const [mdHue, mdSat] = rgbToHsl(m5r, m5g, m5b);
  const [hiHue, hiSat] = rgbToHsl(h8r, h8g, h8b);

  const shadowHue = Math.round(shHue) % 360;
  const shadowSat = clamp(Math.round(shSat * 110), 0, 100);
  const shadowLum = clamp(Math.round((lumaShadow - 0.2) * 80), -100, 100);

  const midtoneHue = Math.round(mdHue) % 360;
  const midtoneSat = clamp(Math.round(mdSat * 95), 0, 100);
  const midtoneLum = clamp(Math.round((lumaMid - 0.5) * 80), -100, 100);

  const highlightHue = Math.round(hiHue) % 360;
  const highlightSat = clamp(Math.round(hiSat * 110), 0, 100);
  const highlightLum = clamp(Math.round((lumaHigh - 0.8) * 80), -100, 100);

  // 3. 8-Channel HSL Extraction
  const hsl: Record<HSLChannelName, HSLChannelAdjustments> = {} as Record<
    HSLChannelName,
    HSLChannelAdjustments
  >;
  let globalSatDeltaAcc = 0;

  for (const ch of HSL_CHANNELS) {
    const centerHue = ACR_HUE_CENTERS[ch];
    const testRings: [number, number][] = [
      [0.65, 0.45],
      [0.75, 0.52],
      [0.55, 0.60],
    ];

    let hueShiftAcc = 0;
    let satDeltaAcc = 0;
    let lumDeltaAcc = 0;

    for (const [sIn, lIn] of testRings) {
      const [rIn, gIn, bIn] = hslToRgb(centerHue, sIn, lIn);
      const [rOut, gOut, bOut] = sampleMixed(rIn, gIn, bIn);

      const [hOut, sOut, lOut] = rgbToHsl(rOut, gOut, bOut);
      const expectedNeutralL = evaluateCurve01(toneCurveRGB, lIn);

      hueShiftAcc += shortestAngleDelta(centerHue, hOut);
      satDeltaAcc += (sOut - sIn) / Math.max(0.2, sIn);
      lumDeltaAcc += lOut - expectedNeutralL;
    }

    let hueAdj = clamp(Math.round((hueShiftAcc / testRings.length) * 2.2), -100, 100);
    let satAdj = clamp(Math.round((satDeltaAcc / testRings.length) * 105), -100, 100);
    let lumAdj = clamp(Math.round((lumDeltaAcc / testRings.length) * 165), -100, 100);

    // Apply Skin-Tone Protection on Orange and Red channels
    if ((ch === 'Orange' || ch === 'Red') && skinToneProtection > 0) {
      const protectFactor = 1 - (skinToneProtection / 100) * (ch === 'Orange' ? 0.75 : 0.45);
      hueAdj = Math.round(hueAdj * protectFactor);
      satAdj = Math.round(satAdj * (0.4 + 0.6 * protectFactor));
    }

    globalSatDeltaAcc += satAdj;
    hsl[ch] = {
      hue: hueAdj,
      saturation: satAdj,
      luminance: lumAdj,
    };
  }

  const avgSatBias = Math.round(globalSatDeltaAcc / HSL_CHANNELS.length);
  const vibrance = clamp(Math.round(avgSatBias * 0.45), -100, 100);
  const saturation = clamp(Math.round(avgSatBias * 0.25), -100, 100);

  // 4. Camera Calibration Primaries
  const [pRr, pRg, pRb] = sampleMixed(0.85, 0.15, 0.15);
  const [pGr, pGg, pGb] = sampleMixed(0.15, 0.85, 0.15);
  const [pBr, pBg, pBb] = sampleMixed(0.15, 0.15, 0.85);

  const [rH, rS] = rgbToHsl(pRr, pRg, pRb);
  const [gH, gS] = rgbToHsl(pGr, pGg, pGb);
  const [bH, bS] = rgbToHsl(pBr, pBg, pBb);

  const redPrimaryHue = clamp(Math.round(shortestAngleDelta(0, rH) * 1.5), -100, 100);
  const redPrimarySat = clamp(Math.round((rS - 0.7) * 90), -100, 100);
  const greenPrimaryHue = clamp(Math.round(shortestAngleDelta(120, gH) * 1.5), -100, 100);
  const greenPrimarySat = clamp(Math.round((gS - 0.7) * 90), -100, 100);
  const bluePrimaryHue = clamp(Math.round(shortestAngleDelta(240, bH) * 1.5), -100, 100);
  const bluePrimarySat = clamp(Math.round((bS - 0.7) * 90), -100, 100);

  const params: LightroomXMPParams = {
    presetName,
    presetGroup,
    uuid: deterministicUUID(`${presetName}-${lut.id}-${computeLUTDataHash(lut.data, presetName)}-${lutIntensity}`),
    supportsAmount: true,
    lutIntensity,
    skinToneProtection,
    curvePointCount,
    temperature,
    tint,
    exposure,
    contrast,
    highlights,
    shadows,
    whites,
    blacks,
    clarity: clamp(Math.round(contrast * 0.15), -50, 50),
    dehaze: clamp(Math.round((0.03 - luma0) * 60), -30, 40),
    vibrance,
    saturation,
    parametricShadows,
    parametricDarks,
    parametricLights,
    parametricHighlights,
    toneCurveRGB,
    toneCurveRed,
    toneCurveGreen,
    toneCurveBlue,
    hsl,
    shadowHue,
    shadowSat,
    shadowLum,
    midtoneHue,
    midtoneSat,
    midtoneLum,
    highlightHue,
    highlightSat,
    highlightLum,
    colorGradeBlending: 65,
    splitToningBalance: 0,
    shadowTint: clamp(Math.round((s2g - (s2r + s2b) / 2) * 90), -100, 100),
    redPrimaryHue,
    redPrimarySat,
    greenPrimaryHue,
    greenPrimarySat,
    bluePrimaryHue,
    bluePrimarySat,
    grainAmount: 0,
    postCropVignette: 0,
  };

  const metrics = computeApproximationMetrics(lut, params);
  return { params, metrics };
}

/**
 * Simulates the Adobe Lightroom Develop XMP pipeline on an input RGB [0..1] pixel.
 */
export function applyLightroomXMPToRGB(
  rIn: number,
  gIn: number,
  bIn: number,
  params: LightroomXMPParams
): [number, number, number] {
  // 1. Per-channel point tone curves (captures neutral & split curves directly)
  let r = evaluateCurve01(params.toneCurveRed, rIn);
  let g = evaluateCurve01(params.toneCurveGreen, gIn);
  let b = evaluateCurve01(params.toneCurveBlue, bIn);

  // Blend with master RGB curve delta relative to identity
  const lumaIn = 0.2126 * rIn + 0.7152 * gIn + 0.0722 * bIn;
  const masterOut = evaluateCurve01(params.toneCurveRGB, lumaIn);
  const masterDelta = (masterOut - lumaIn) * 0.25;
  r = clamp(r + masterDelta, 0, 1);
  g = clamp(g + masterDelta, 0, 1);
  b = clamp(b + masterDelta, 0, 1);

  // 1b. Basic Tone & White Balance live manual slider modulation
  const expGain = Math.pow(2, (params.exposure || 0) * 0.35);
  const tempShift = (params.temperature || 0) * 0.0018;
  const tintShift = (params.tint || 0) * 0.0015;
  r = clamp(r * expGain + tempShift + tintShift * 0.5, 0, 1);
  g = clamp(g * expGain - tintShift, 0, 1);
  b = clamp(b * expGain - tempShift + tintShift * 0.5, 0, 1);

  const lumaMid = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const shMask = (1 - lumaMid) * (1 - lumaMid);
  const hiMask = lumaMid * lumaMid;
  const toneOffset =
    ((params.shadows || 0) / 100) * 0.08 * shMask +
    ((params.highlights || 0) / 100) * 0.08 * hiMask +
    ((params.blacks || 0) / 100) * 0.05 * (1 - lumaMid) +
    ((params.whites || 0) / 100) * 0.05 * lumaMid;
  const contrastFactor = 1 + ((params.contrast || 0) / 100) * 0.22;

  r = clamp((r - 0.5) * contrastFactor + 0.5 + toneOffset, 0, 1);
  g = clamp((g - 0.5) * contrastFactor + 0.5 + toneOffset, 0, 1);
  b = clamp((b - 0.5) * contrastFactor + 0.5 + toneOffset, 0, 1);

  // 2. 8-Channel HSL Band Adjustments & Global Vibrance/Saturation
  const [h, s, l] = rgbToHsl(r, g, b);
  if (s > 0.01) {
    let totalHueDelta = 0;
    let totalSatFactor = 0;
    let totalLumDelta = 0;
    let weightSum = 0;

    for (const ch of HSL_CHANNELS) {
      const center = ACR_HUE_CENTERS[ch];
      const dist = Math.abs(shortestAngleDelta(h, center));
      if (dist < 55) {
        const w = Math.cos((dist / 55) * (Math.PI / 2)) ** 2;
        const adj = params.hsl[ch];
        totalHueDelta += (adj.hue / 100) * 32 * w;
        totalSatFactor += (adj.saturation / 100) * w;
        totalLumDelta += (adj.luminance / 100) * 0.24 * w;
        weightSum += w;
      }
    }

    if (weightSum > 0) {
      const newH = (h + totalHueDelta + 360) % 360;
      const newS = clamp(s * (1 + totalSatFactor * 0.75 + (params.saturation + params.vibrance * (1 - s)) / 220), 0, 1);
      const newL = clamp(l + totalLumDelta * s, 0, 1);
      [r, g, b] = hslToRgb(newH, newS, newL);
    }
  }

  // 3. 3-Way Color Grading (Shadows / Highlights subtle tint reinforcement)
  const currLuma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (params.shadowSat > 2 || params.highlightSat > 2) {
    const shadowWeight = clamp(1 - currLuma * 2.1, 0, 1) * (params.shadowSat / 100) * 0.14;
    const highWeight = clamp((currLuma - 0.5) * 2.0, 0, 1) * (params.highlightSat / 100) * 0.14;

    if (shadowWeight > 0.001) {
      const [sr, sg, sb] = hslToRgb(params.shadowHue, 0.8, 0.5);
      r = clamp(r * (1 - shadowWeight) + sr * shadowWeight, 0, 1);
      g = clamp(g * (1 - shadowWeight) + sg * shadowWeight, 0, 1);
      b = clamp(b * (1 - shadowWeight) + sb * shadowWeight, 0, 1);
    }
    if (highWeight > 0.001) {
      const [hr, hg, hb] = hslToRgb(params.highlightHue, 0.8, 0.65);
      r = clamp(r * (1 - highWeight) + hr * highWeight, 0, 1);
      g = clamp(g * (1 - highWeight) + hg * highWeight, 0, 1);
      b = clamp(b * (1 - highWeight) + hb * highWeight, 0, 1);
    }
  }

  return [r, g, b];
}

function hueToColorName(hue: number, sat: number): string {
  if (sat < 4) return 'Neutral Achromatic';
  if (hue < 20 || hue >= 340) return 'Crimson / Warm Red';
  if (hue < 48) return 'Amber / Tungsten Gold';
  if (hue < 75) return 'Warm Ochre / Yellow';
  if (hue < 150) return 'Emerald / Foliage Green';
  if (hue < 205) return 'Cinema Teal / Cyan';
  if (hue < 255) return 'Cobalt / Slate Blue';
  if (hue < 305) return 'Violet / Indigo';
  return 'Magenta / Rose';
}

/**
 * Computes color difference metrics (CIE76 Delta-E approximation) between the true 3D LUT and the Lightroom XMP parameters.
 */
export function computeApproximationMetrics(
  lut: LUT3D,
  params: LightroomXMPParams
): LUTAnalysisMetrics {
  const mix = clamp(params.lutIntensity / 100, 0, 1.5);
  let totalDeltaE = 0;
  let maxDeltaE = 0;
  let count = 0;

  for (let bi = 0; bi < 4; bi++) {
    for (let gi = 0; gi < 4; gi++) {
      for (let ri = 0; ri < 4; ri++) {
        const r = ri / 3;
        const g = gi / 3;
        const b = bi / 3;

        const [lr0, lg0, lb0] = sampleLUTTrilinear(lut, r, g, b);
        const lr = clamp(r + (lr0 - r) * mix, 0, 1);
        const lg = clamp(g + (lg0 - g) * mix, 0, 1);
        const lb = clamp(b + (lb0 - b) * mix, 0, 1);

        const [xr, xg, xb] = applyLightroomXMPToRGB(r, g, b, params);

        const dr = (lr - xr) * 100;
        const dg = (lg - xg) * 100;
        const db = (lb - xb) * 100;
        const dE = Math.sqrt(0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db) * 0.65;

        totalDeltaE += dE;
        if (dE > maxDeltaE) maxDeltaE = dE;
        count++;
      }
    }
  }

  const blackFloorLift = params.toneCurveRGB[0]?.y ?? 0;
  const whiteCeilingClip = params.toneCurveRGB[params.toneCurveRGB.length - 1]?.y ?? 255;
  const spanRatio = (whiteCeilingClip - blackFloorLift) / 255;
  const dynamicRangeCompression = Math.round((1 - spanRatio) * 100);

  return {
    meanDeltaE: Number((totalDeltaE / Math.max(1, count)).toFixed(2)),
    maxDeltaE: Number(maxDeltaE.toFixed(2)),
    dynamicRangeCompression,
    warmthShiftKelvinApprox: params.temperature * 45,
    saturationBiasPercent: params.vibrance + params.saturation,
    blackFloorLift,
    whiteCeilingClip,
    dominantShadowCast: hueToColorName(params.shadowHue, params.shadowSat),
    dominantHighlightCast: hueToColorName(params.highlightHue, params.highlightSat),
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatSigned(n: number, decimals = 0): string {
  const fixed = decimals > 0 ? n.toFixed(decimals) : Math.round(n).toString();
  return n > 0 ? `+${fixed}` : fixed;
}

function serializeCurveSeq(tagName: string, points: CurvePoint[]): string {
  const items = points
    .map((pt) => `     <rdf:li>${Math.round(pt.x)}, ${Math.round(pt.y)}</rdf:li>`)
    .join('\n');
  return `   <crs:${tagName}>\n    <rdf:Seq>\n${items}\n    </rdf:Seq>\n   </crs:${tagName}>`;
}

/**
 * Generates an authentic Adobe Lightroom Classic / Adobe Camera Raw (.xmp) preset XML file.
 */
export function generateLightroomXMP(params: LightroomXMPParams): string {
  const safeName = escapeXml(params.presetName || 'ChromaXMP Preset');
  const safeGroup = escapeXml(params.presetGroup || 'ChromaXMP Presets');
  const hslAttrs = HSL_CHANNELS.map(
    (ch) =>
      `   crs:HueAdjustment${ch}="${Math.round(params.hsl[ch].hue)}"\n` +
      `   crs:SaturationAdjustment${ch}="${Math.round(params.hsl[ch].saturation)}"\n` +
      `   crs:LuminanceAdjustment${ch}="${Math.round(params.hsl[ch].luminance)}"`
  ).join('\n');

  return `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        ">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
   crs:PresetType="Normal"
   crs:Cluster=""
   crs:UUID="${escapeXml(params.uuid)}"
   crs:SupportsAmount2="True"
   crs:SupportsAmount="${params.supportsAmount ? 'True' : 'False'}"
   crs:SupportsColor="True"
   crs:SupportsMonochrome="True"
   crs:SupportsHighDynamicRange="True"
   crs:SupportsNormalDynamicRange="True"
   crs:SupportsSceneReferred="True"
   crs:SupportsOutputReferred="True"
   crs:RequiresRGBTables="False"
   crs:CameraModelRestriction=""
   crs:Copyright="Generated with ChromaXMP Color Science Converter"
   crs:ContactInfo=""
   crs:Version="15.4"
   crs:ProcessVersion="11.0"
   crs:WhiteBalance="As Shot"
   crs:IncrementalTemperature="${Math.round(params.temperature)}"
   crs:IncrementalTint="${Math.round(params.tint)}"
   crs:Exposure2012="${formatSigned(params.exposure, 2)}"
   crs:Contrast2012="${formatSigned(params.contrast)}"
   crs:Highlights2012="${formatSigned(params.highlights)}"
   crs:Shadows2012="${formatSigned(params.shadows)}"
   crs:Whites2012="${formatSigned(params.whites)}"
   crs:Blacks2012="${formatSigned(params.blacks)}"
   crs:Texture="0"
   crs:Clarity2012="${formatSigned(params.clarity)}"
   crs:Dehaze="${formatSigned(params.dehaze)}"
   crs:Vibrance="${formatSigned(params.vibrance)}"
   crs:Saturation="${formatSigned(params.saturation)}"
   crs:ParametricShadows="${formatSigned(params.parametricShadows)}"
   crs:ParametricDarks="${formatSigned(params.parametricDarks)}"
   crs:ParametricLights="${formatSigned(params.parametricLights)}"
   crs:ParametricHighlights="${formatSigned(params.parametricHighlights)}"
   crs:ParametricShadowSplit="25"
   crs:ParametricMidtoneSplit="50"
   crs:ParametricHighlightSplit="75"
${hslAttrs}
   crs:SplitToningShadowHue="${Math.round(params.shadowHue)}"
   crs:SplitToningShadowSaturation="${Math.round(params.shadowSat)}"
   crs:ColorGradeShadowLum="${formatSigned(params.shadowLum)}"
   crs:ColorGradeMidtoneHue="${Math.round(params.midtoneHue)}"
   crs:ColorGradeMidtoneSat="${Math.round(params.midtoneSat)}"
   crs:ColorGradeMidtoneLum="${formatSigned(params.midtoneLum)}"
   crs:SplitToningHighlightHue="${Math.round(params.highlightHue)}"
   crs:SplitToningHighlightSaturation="${Math.round(params.highlightSat)}"
   crs:ColorGradeHighlightLum="${formatSigned(params.highlightLum)}"
   crs:SplitToningBalance="${formatSigned(params.splitToningBalance)}"
   crs:ColorGradeGlobalHue="0"
   crs:ColorGradeGlobalSat="0"
   crs:ColorGradeGlobalLum="0"
   crs:ColorGradeBlending="${Math.round(params.colorGradeBlending)}"
   crs:ShadowTint="${formatSigned(params.shadowTint)}"
   crs:RedHue="${formatSigned(params.redPrimaryHue)}"
   crs:RedSat="${formatSigned(params.redPrimarySat)}"
   crs:GreenHue="${formatSigned(params.greenPrimaryHue)}"
   crs:GreenSat="${formatSigned(params.greenPrimarySat)}"
   crs:BlueHue="${formatSigned(params.bluePrimaryHue)}"
   crs:BlueSat="${formatSigned(params.bluePrimarySat)}"
   crs:GrainAmount="${Math.round(params.grainAmount)}"
   crs:PostCropVignetteAmount="${formatSigned(params.postCropVignette)}"
   crs:ConvertToGrayscale="False"
   crs:ToneCurveName2012="Custom"
   crs:HasSettings="True">
   <crs:Name>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">${safeName}</rdf:li>
    </rdf:Alt>
   </crs:Name>
   <crs:ShortName>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">${safeName}</rdf:li>
    </rdf:Alt>
   </crs:ShortName>
   <crs:SortName>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">${safeName}</rdf:li>
    </rdf:Alt>
   </crs:SortName>
   <crs:Group>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">${safeGroup}</rdf:li>
    </rdf:Alt>
   </crs:Group>
   <crs:Description>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">Converted from 3D LUT (${safeName}) via ChromaXMP</rdf:li>
    </rdf:Alt>
   </crs:Description>
${serializeCurveSeq('ToneCurvePV2012', params.toneCurveRGB)}
${serializeCurveSeq('ToneCurvePV2012Red', params.toneCurveRed)}
${serializeCurveSeq('ToneCurvePV2012Green', params.toneCurveGreen)}
${serializeCurveSeq('ToneCurvePV2012Blue', params.toneCurveBlue)}
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>`;
}

/**
 * Bakes any Adobe Lightroom Develop XMP parameter state into a downloadable 3D LUT (.cube).
 * Powers the bidirectional "XMP to LUT" workflow in CineLUT Studio.
 */
export function bakeXMPParamsTo3DLUT(params: LightroomXMPParams, size = 17): LUT3D {
  const grid = clamp(size, 2, 65);
  const data = new Float32Array(grid * grid * grid * 3);
  let ptr = 0;

  for (let bi = 0; bi < grid; bi++) {
    for (let gi = 0; gi < grid; gi++) {
      for (let ri = 0; ri < grid; ri++) {
        const r = ri / (grid - 1);
        const g = gi / (grid - 1);
        const b = bi / (grid - 1);
        const [or, og, ob] = applyLightroomXMPToRGB(r, g, b, params);
        data[ptr++] = clamp(or, 0, 1);
        data[ptr++] = clamp(og, 0, 1);
        data[ptr++] = clamp(ob, 0, 1);
      }
    }
  }

  return {
    id: `xmp-baked-${deterministicUUID(params.presetName).slice(0, 8)}`,
    title: params.presetName || 'Baked Lightroom XMP LUT',
    format: 'cube',
    size: grid,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data,
    category: 'XMP → LUT Baked',
    description: `Baked ${grid}×${grid}×${grid} 3D LUT from Lightroom XMP preset "${params.presetName}"`,
  };
}

/**
 * Parses an Adobe Lightroom (.xmp) XML string into LightroomXMPParams for reverse XMP-to-LUT conversion.
 */
export function parseLightroomXMPString(
  xml: string,
  fallbackBase: LightroomXMPParams
): LightroomXMPParams {
  const next: LightroomXMPParams = structuredClone(fallbackBase);

  const readAttrNumber = (attr: string, def: number): number => {
    const regex = new RegExp(`crs:${attr}="([^"]+)"`, 'i');
    const match = xml.match(regex);
    if (!match) return def;
    const parsed = parseFloat(match[1]);
    return Number.isNaN(parsed) ? def : parsed;
  };

  const nameMatch = xml.match(/<crs:Name>[\s\S]*?<rdf:li[^>]*>([^<]+)<\/rdf:li>/i);
  if (nameMatch?.[1]) {
    next.presetName = nameMatch[1].trim();
  }

  next.temperature = readAttrNumber('IncrementalTemperature', next.temperature);
  next.tint = readAttrNumber('IncrementalTint', next.tint);
  next.exposure = readAttrNumber('Exposure2012', next.exposure);
  next.contrast = readAttrNumber('Contrast2012', next.contrast);
  next.highlights = readAttrNumber('Highlights2012', next.highlights);
  next.shadows = readAttrNumber('Shadows2012', next.shadows);
  next.whites = readAttrNumber('Whites2012', next.whites);
  next.blacks = readAttrNumber('Blacks2012', next.blacks);
  next.clarity = readAttrNumber('Clarity2012', next.clarity);
  next.dehaze = readAttrNumber('Dehaze', next.dehaze);
  next.vibrance = readAttrNumber('Vibrance', next.vibrance);
  next.saturation = readAttrNumber('Saturation', next.saturation);

  for (const ch of HSL_CHANNELS) {
    next.hsl[ch] = {
      hue: readAttrNumber(`HueAdjustment${ch}`, next.hsl[ch].hue),
      saturation: readAttrNumber(`SaturationAdjustment${ch}`, next.hsl[ch].saturation),
      luminance: readAttrNumber(`LuminanceAdjustment${ch}`, next.hsl[ch].luminance),
    };
  }

  return next;
}

/**
 * Generates built-in procedural 17x17x17 Cinema 3D LUTs matching the CineLUT Studio library.
 */
export function createBuiltInCinemaLUTs(): LUT3D[] {
  const size = 17;

  const buildLUT = (
    id: string,
    title: string,
    category: string,
    description: string,
    transform: (r: number, g: number, b: number) => [number, number, number]
  ): LUT3D => {
    const data = new Float32Array(size * size * size * 3);
    let ptr = 0;
    for (let bi = 0; bi < size; bi++) {
      for (let gi = 0; gi < size; gi++) {
        for (let ri = 0; ri < size; ri++) {
          const r = ri / (size - 1);
          const g = gi / (size - 1);
          const b = bi / (size - 1);
          const [or, og, ob] = transform(r, g, b);
          data[ptr++] = clamp(or, 0, 1);
          data[ptr++] = clamp(og, 0, 1);
          data[ptr++] = clamp(ob, 0, 1);
        }
      }
    }
    return {
      id,
      title,
      format: 'cube',
      size,
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
      data,
      category,
      description,
    };
  };

  const sCurve = (x: number, strength = 1.35, toeLift = 0.03, shoulderRoll = 0.96) => {
    const c = clamp(x, 0, 1);
    const s = (c ** strength) / (c ** strength + (1 - c) ** strength);
    return toeLift + s * (shoulderRoll - toeLift);
  };

  return [
    buildLUT(
      'kodak-2383-print',
      'Kodak Vision3 2383 Print',
      'Film Emulation',
      'Dense cinema print contrast curve, deep teal shadows, warm golden sunrise highlights, and rich skin rendition.',
      (r, g, b) => {
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const rc = sCurve(r, 1.38, 0.02, 0.98) + (1 - luma) * -0.02 + luma * 0.055;
        const gc = sCurve(g, 1.34, 0.022, 0.968) + luma * 0.022;
        const bc = sCurve(b, 1.28, 0.038, 0.90) + (1 - luma) * 0.035 - luma * 0.065;
        const [h, s, l] = rgbToHsl(clamp(rc, 0, 1), clamp(gc, 0, 1), clamp(bc, 0, 1));
        const hueShift = h > 80 && h < 160 ? 10 : h < 45 ? -3 : 0;
        return hslToRgb((h + hueShift + 360) % 360, clamp(s * 1.18, 0, 1), l);
      }
    ),
    buildLUT(
      'arri-logc-rec709-warm',
      'Arri Alexa LogC to 709',
      'Camera Look',
      'Naturalistic ARRI Alexa wide dynamic range expansion with smooth highlight roll-off and neutral-warm balance.',
      (r, g, b) => {
        const rc = sCurve(r, 1.25, 0.02, 0.985) * 1.03;
        const gc = sCurve(g, 1.24, 0.02, 0.975) * 1.01;
        const bc = sCurve(b, 1.22, 0.02, 0.935) * 0.95;
        return [clamp(rc, 0, 1), clamp(gc, 0, 1), clamp(bc, 0, 1)];
      }
    ),
    buildLUT(
      'fuji-eterna-250d',
      'FujiFilm Eterna 250D',
      'Film',
      'Gentle highlight roll-off, lifted matte shadow floor, pastel aqua skies, and organic documentary warmth.',
      (r, g, b) => {
        const rc = sCurve(r, 1.16, 0.045, 0.955) + 0.02;
        const gc = sCurve(g, 1.15, 0.05, 0.955) + 0.018;
        const bc = sCurve(b, 1.12, 0.055, 0.935);
        const [h, s, l] = rgbToHsl(clamp(rc, 0, 1), clamp(gc, 0, 1), clamp(bc, 0, 1));
        const newH = h >= 190 && h <= 255 ? h - 14 : h >= 85 && h <= 150 ? h + 8 : h;
        return hslToRgb((newH + 360) % 360, clamp(s * 0.95, 0, 1), l);
      }
    ),
    buildLUT(
      'blockbuster-teal-orange',
      'Cinematic Teal & Orange',
      'Creative',
      'High-separation complementary split grade pushing cool cyan-teal shadows against glowing amber-gold highlights.',
      (r, g, b) => {
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const shadowMask = (1 - luma) ** 1.4;
        const highMask = luma ** 1.3;
        const rc = sCurve(r, 1.32, 0.015, 0.98) - shadowMask * 0.06 + highMask * 0.065;
        const gc = sCurve(g, 1.30, 0.025, 0.96) + shadowMask * 0.025 + highMask * 0.02;
        const bc = sCurve(b, 1.26, 0.05, 0.92) + shadowMask * 0.09 - highMask * 0.07;
        const [h, s, l] = rgbToHsl(clamp(rc, 0, 1), clamp(gc, 0, 1), clamp(bc, 0, 1));
        const pushedH = h >= 170 && h <= 265 ? 196 + (h - 196) * 0.55 : h;
        return hslToRgb(pushedH, clamp(s * 1.22, 0, 1), l);
      }
    ),
    buildLUT(
      'kodak-portra-400',
      'Portra 400',
      'Film',
      'Classic Kodak Portra 400 negative stock with warm pastel highlights, luminous skin tones, and airy shadows.',
      (r, g, b) => {
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const rc = sCurve(r, 1.18, 0.035, 0.98) + luma * 0.035;
        const gc = sCurve(g, 1.16, 0.035, 0.97) + luma * 0.015;
        const bc = sCurve(b, 1.14, 0.04, 0.94) - luma * 0.025;
        const [h, s, l] = rgbToHsl(clamp(rc, 0, 1), clamp(gc, 0, 1), clamp(bc, 0, 1));
        return hslToRgb((h + 360) % 360, clamp(s * 1.08, 0, 1), clamp(l * 1.02, 0, 1));
      }
    ),
    buildLUT(
      'golden-hour-glow',
      'Golden Hour',
      'Creative',
      'Radiant sunset amber warmth, honey-gold midtones, and rich emerald-gold foliage illumination.',
      (r, g, b) => {
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const rc = sCurve(r, 1.28, 0.025, 0.99) + 0.055 * (0.4 + 0.6 * luma);
        const gc = sCurve(g, 1.24, 0.02, 0.96) + 0.025 * luma;
        const bc = sCurve(b, 1.20, 0.015, 0.88) - 0.05 * luma;
        const [h, s, l] = rgbToHsl(clamp(rc, 0, 1), clamp(gc, 0, 1), clamp(bc, 0, 1));
        return hslToRgb(h, clamp(s * 1.24, 0, 1), l);
      }
    ),
    buildLUT(
      'cinema-contrast-punch',
      'Cinema Contrast',
      'Creative',
      'Deep anamorphic theatrical black floor with punchy midtone separation and crisp highlight definition.',
      (r, g, b) => {
        const rc = sCurve(r, 1.52, 0.01, 0.975);
        const gc = sCurve(g, 1.50, 0.01, 0.97);
        const bc = sCurve(b, 1.48, 0.015, 0.965);
        const [h, s, l] = rgbToHsl(clamp(rc, 0, 1), clamp(gc, 0, 1), clamp(bc, 0, 1));
        return hslToRgb(h, clamp(s * 1.12, 0, 1), l);
      }
    ),
    buildLUT(
      'bw-film-400',
      'BW Film 400',
      'Monochrome',
      'Panchromatic Tri-X 400 black-and-white silver gelatin curve with rich tonal separation and subtle warm paper tone.',
      (r, g, b) => {
        const panLuma = clamp(0.28 * r + 0.62 * g + 0.10 * b, 0, 1);
        const mono = sCurve(panLuma, 1.44, 0.02, 0.975);
        return [clamp(mono * 1.01, 0, 1), clamp(mono * 1.005, 0, 1), clamp(mono * 0.985, 0, 1)];
      }
    ),
  ];
}

export interface SavedPresetSnapshot {
  id: string;
  name: string;
  lutId: string;
  lutTitle: string;
  updatedAt: string;
  meanDeltaE: number;
  params: LightroomXMPParams;
}

export type InstallerPlatform = 'windows-ps1' | 'macos-command';

/**
 * Generates a self-contained Adobe Lightroom Classic / Camera Raw preset auto-installer script
 * for Windows PowerShell (.ps1) or macOS Terminal (.command) that embeds the .xmp XML payloads
 * and writes them directly into Adobe's CameraRaw/Settings directory.
 */
export function generateLightroomInstallerScript(
  presets: LightroomXMPParams[],
  platform: InstallerPlatform
): { filename: string; content: string } {
  const safeFolder = (presets[0]?.presetGroup || 'ChromaXMP Cinema Grades').replace(
    /[^a-zA-Z0-9 _-]/g,
    ''
  ).trim() || 'ChromaXMP Cinema Grades';

  if (platform === 'windows-ps1') {
    const blocks = presets.map((p) => {
      const fileSafe = `${(p.presetName || 'Preset').replace(/[^a-zA-Z0-9_-]/g, '_')}.xmp`;
      const xml = generateLightroomXMP(p);
      return `# Install ${p.presetName}
$targetFile = Join-Path $targetDir "${fileSafe}"
$xmlContent = @'
${xml}
'@
Set-Content -Path $targetFile -Value $xmlContent -Encoding UTF8
Write-Host "  [+] Installed: ${fileSafe}" -ForegroundColor Green`;
    });

    const content = `# ============================================================================
# ChromaXMP — Adobe Lightroom Classic & Camera Raw Preset Auto-Installer (Windows)
# Preset Group: ${safeFolder} (${presets.length} Preset${presets.length === 1 ? '' : 's'})
# ============================================================================
$ErrorActionPreference = "Stop"

$acrRoot = Join-Path $env:APPDATA "Adobe\\CameraRaw\\Settings"
$targetDir = Join-Path $acrRoot "${safeFolder}"

Write-Host "Installing ChromaXMP Lightroom Presets into:" -ForegroundColor Cyan
Write-Host "  $targetDir" -ForegroundColor Yellow

if (-not (Test-Path -Path $targetDir)) {
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
}

${blocks.join('\n\n')}

Write-Host ""
Write-Host "Installation complete! Restart Adobe Lightroom Classic, Lightroom Desktop, or Photoshop to load your new '${safeFolder}' presets." -ForegroundColor Cyan
`;
    return {
      filename: `Install_${safeFolder.replace(/\s+/g, '_')}_Lightroom_Windows.ps1`,
      content,
    };
  }

  // macOS .command (Bash script)
  const macBlocks = presets.map((p) => {
    const fileSafe = `${(p.presetName || 'Preset').replace(/[^a-zA-Z0-9_-]/g, '_')}.xmp`;
    const xml = generateLightroomXMP(p);
    return `cat << 'EOF_CHROMAXMP_XML' > "$TARGET_DIR/${fileSafe}"
${xml}
EOF_CHROMAXMP_XML
echo "  [+] Installed: ${fileSafe}"`;
  });

  const macContent = `#!/usr/bin/env bash
# ============================================================================
# ChromaXMP — Adobe Lightroom Classic & Camera Raw Preset Auto-Installer (macOS)
# Preset Group: ${safeFolder} (${presets.length} Preset${presets.length === 1 ? '' : 's'})
# ============================================================================
set -e

TARGET_DIR="$HOME/Library/Application Support/Adobe/CameraRaw/Settings/${safeFolder}"
echo "Installing ChromaXMP Lightroom Presets into:"
echo "  $TARGET_DIR"
mkdir -p "$TARGET_DIR"

${macBlocks.join('\n\n')}

echo ""
echo "Installation complete! Restart Adobe Lightroom Classic, Lightroom Desktop, or Photoshop to load your '${safeFolder}' presets."
`;

  return {
    filename: `Install_${safeFolder.replace(/\s+/g, '_')}_Lightroom_macOS.command`,
    content: macContent,
  };
}

