import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCubeLUT,
  parse3dlLUT,
  serializeCubeLUT,
  sampleLUTTrilinear,
  fitLUTToLightroomXMP,
  generateLightroomXMP,
  createBuiltInCinemaLUTs,
  applyLightroomXMPToRGB,
} from './lutEngine';

test('parseCubeLUT parses valid 2x2x2 .cube file and trilinear interpolation matches identity', () => {
  const sampleCube = `
# Sample 2x2x2 Identity Cube
TITLE "Identity Test LUT"
LUT_3D_SIZE 2
DOMAIN_MIN 0.0 0.0 0.0
DOMAIN_MAX 1.0 1.0 1.0
0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
1.0 1.0 0.0
0.0 0.0 1.0
1.0 0.0 1.0
0.0 1.0 1.0
1.0 1.0 1.0
`;

  const lut = parseCubeLUT(sampleCube);
  assert.equal(lut.title, 'Identity Test LUT');
  assert.equal(lut.size, 2);
  assert.equal(lut.data.length, 24);

  const [r, g, b] = sampleLUTTrilinear(lut, 0.25, 0.6, 0.8);
  assert.ok(Math.abs(r - 0.25) < 1e-5);
  assert.ok(Math.abs(g - 0.6) < 1e-5);
  assert.ok(Math.abs(b - 0.8) < 1e-5);
});

test('parseCubeLUT throws helpful error on malformed input', () => {
  assert.throws(() => {
    parseCubeLUT('TITLE "Broken"\nLUT_3D_SIZE 4\n0.0 0.0 0.0');
  }, /Invalid \.cube LUT/);
});

test('parse3dlLUT parses 10-bit integer .3dl LUT and normalizes correctly', () => {
  const lines = ['0 1023'];
  for (let r = 0; r < 2; r++) {
    for (let g = 0; g < 2; g++) {
      for (let b = 0; b < 2; b++) {
        lines.push(`${r * 1023} ${g * 1023} ${b * 1023}`);
      }
    }
  }
  const lut = parse3dlLUT(lines.join('\n'), 'Test 3DL');
  assert.equal(lut.size, 2);
  const [rOut, gOut, bOut] = sampleLUTTrilinear(lut, 1, 0.5, 0);
  assert.ok(Math.abs(rOut - 1) < 1e-4);
  assert.ok(Math.abs(gOut - 0.5) < 1e-4);
  assert.ok(Math.abs(bOut - 0) < 1e-4);
});

test('fitLUTToLightroomXMP extracts accurate curves, HSL, and valid Adobe XMP XML from cinema LUTs', () => {
  const builtIns = createBuiltInCinemaLUTs();
  assert.equal(builtIns.length, 5);

  const kodak = builtIns[0];
  const { params, metrics } = fitLUTToLightroomXMP(kodak, {
    presetName: 'Kodak 2383 Cinema',
    presetGroup: 'Film Emulation',
    lutIntensity: 100,
    skinToneProtection: 40,
    curvePointCount: 9,
  });

  assert.equal(params.presetName, 'Kodak 2383 Cinema');
  assert.equal(params.toneCurveRGB.length, 9);
  assert.ok(params.contrast > 0, 'Kodak 2383 print LUT should yield positive contrast');
  assert.ok(metrics.meanDeltaE >= 0 && metrics.meanDeltaE < 15, 'Approximation Delta-E should be low');

  const xmp = generateLightroomXMP(params);
  assert.ok(xmp.includes('<x:xmpmeta xmlns:x="adobe:ns:meta/"'));
  assert.ok(xmp.includes('crs:PresetType="Normal"'));
  assert.ok(xmp.includes('crs:ProcessVersion="11.0"'));
  assert.ok(xmp.includes('<crs:ToneCurvePV2012>'));
  assert.ok(xmp.includes('Kodak 2383 Cinema'));

  const cubeText = serializeCubeLUT(kodak);
  const reparsed = parseCubeLUT(cubeText);
  assert.equal(reparsed.size, kodak.size);

  const [pr, pg, pb] = applyLightroomXMPToRGB(0.5, 0.4, 0.3, params);
  assert.ok(pr >= 0 && pr <= 1);
  assert.ok(pg >= 0 && pg <= 1);
  assert.ok(pb >= 0 && pb <= 1);
});
