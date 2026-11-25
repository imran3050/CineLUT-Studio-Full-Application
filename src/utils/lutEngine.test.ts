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
  generateLightroomInstallerScript,
  bakeXMPParamsTo3DLUT,
  parseLightroomXMPString,
  parseAnyLUTFile,
} from './lutEngine';

test('uploading 1st and 2nd LUTs with empty TITLE "" or identical generic TITLE headers produces distinct LUT IDs, distinct titles, and distinct Lightroom XMP crs:UUIDs', () => {
  const firstCube = `
TITLE ""
LUT_3D_SIZE 2
0.02 0.01 0.00
0.98 0.05 0.02
0.02 0.96 0.04
1.00 0.98 0.06
0.01 0.04 0.90
0.95 0.09 0.92
0.05 0.94 0.95
1.00 0.99 0.94
`;

  const secondCubeWithShaperAndSameHeader = `
# DaVinci Resolve Export with 1D Shaper + 3D LUT and identical empty TITLE
TITLE ""
LUT_1D_SIZE 2
LUT_3D_SIZE 2
0.0 0.0 0.0
1.0 1.0 1.0
0.00 0.05 0.12
0.90 0.08 0.15
0.04 0.88 0.14
0.92 0.91 0.18
0.02 0.10 0.96
0.88 0.14 0.98
0.08 0.92 0.99
0.94 0.95 1.00
`;

  const lut1 = parseAnyLUTFile(firstCube, 'Warm_Golden_Film_01.cube');
  const lut2 = parseAnyLUTFile(secondCubeWithShaperAndSameHeader, 'Cool_Cyber_Teal_02.cube');

  assert.equal(lut1.title, 'Warm_Golden_Film_01');
  assert.equal(lut2.title, 'Cool_Cyber_Teal_02');
  assert.notEqual(lut1.id, lut2.id, '1st and 2nd uploaded LUTs must have distinct IDs');

  const solved1 = fitLUTToLightroomXMP(lut1, { presetName: lut1.title });
  const solved2 = fitLUTToLightroomXMP(lut2, { presetName: lut2.title });

  assert.notEqual(
    solved1.params.uuid,
    solved2.params.uuid,
    '1st and 2nd LUT XMP presets must have distinct crs:UUID values so Lightroom imports both'
  );
  assert.notEqual(
    solved1.params.temperature,
    solved2.params.temperature,
    '1st warm LUT and 2nd cool LUT must solve to distinct Lightroom temperature values'
  );

  const xmp1 = generateLightroomXMP(solved1.params);
  const xmp2 = generateLightroomXMP(solved2.params);
  assert.ok(xmp1.includes('Warm_Golden_Film_01'));
  assert.ok(xmp2.includes('Cool_Cyber_Teal_02'));
  assert.notEqual(xmp1, xmp2);
});


test('generateLightroomInstallerScript creates self-contained Windows .ps1 and macOS .command scripts with embedded XMP', () => {
  const builtIns = createBuiltInCinemaLUTs();
  const { params } = fitLUTToLightroomXMP(builtIns[0], {
    presetName: 'Kodak 2383 Print',
    presetGroup: 'ChromaXMP Film',
  });

  const winScript = generateLightroomInstallerScript([params], 'windows-ps1');
  assert.ok(winScript.filename.endsWith('.ps1'));
  assert.ok(winScript.content.includes('Adobe\\CameraRaw\\Settings'));
  assert.ok(winScript.content.includes('<x:xmpmeta'));
  assert.ok(winScript.content.includes('Kodak_2383_Print.xmp'));

  const macScript = generateLightroomInstallerScript([params], 'macos-command');
  assert.ok(macScript.filename.endsWith('.command'));
  assert.ok(macScript.content.includes('Library/Application Support/Adobe/CameraRaw/Settings'));
  assert.ok(macScript.content.includes('<x:xmpmeta'));
});

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

test('fitLUTToLightroomXMP extracts accurate curves, HSL, and valid Adobe XMP XML from cinema LUTs, and bakeXMPParamsTo3DLUT reverses back to 3D LUT', () => {
  const builtIns = createBuiltInCinemaLUTs();
  assert.equal(builtIns.length, 8);

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

  const parsedXmp = parseLightroomXMPString(xmp, params);
  assert.equal(parsedXmp.presetName, 'Kodak 2383 Cinema');
  assert.equal(parsedXmp.contrast, params.contrast);

  const bakedLut = bakeXMPParamsTo3DLUT(parsedXmp, 9);
  assert.equal(bakedLut.size, 9);
  assert.equal(bakedLut.data.length, 9 * 9 * 9 * 3);

  const cubeText = serializeCubeLUT(kodak);
  const reparsed = parseCubeLUT(cubeText);
  assert.equal(reparsed.size, kodak.size);

  const [pr, pg, pb] = applyLightroomXMPToRGB(0.5, 0.4, 0.3, params);
  assert.ok(pr >= 0 && pr <= 1);
  assert.ok(pg >= 0 && pg <= 1);
  assert.ok(pb >= 0 && pb <= 1);
});
