import React, { useEffect, useRef, useState } from 'react';
import {
  LUT3D,
  LightroomXMPParams,
  LUTAnalysisMetrics,
  sampleLUTTrilinear,
  applyLightroomXMPToRGB,
  clamp,
} from '../utils/lutEngine';
import {
  REFERENCE_SCENES,
  renderReferenceSceneToImageData,
} from '../utils/referenceScenes';
import { Upload, SlidersHorizontal, Eye, Activity } from 'lucide-react';

export type PreviewComparisonMode =
  | 'xmp-vs-original'
  | 'lut-vs-original'
  | 'xmp-vs-lut'
  | 'delta-heatmap';

interface GradingCanvasViewportProps {
  activeLUT: LUT3D;
  xmpParams: LightroomXMPParams;
  metrics: LUTAnalysisMetrics;
  activeSceneId: string;
  onSelectScene: (sceneId: string) => void;
  comparisonMode: PreviewComparisonMode;
  onChangeComparisonMode: (mode: PreviewComparisonMode) => void;
}

export const GradingCanvasViewport: React.FC<GradingCanvasViewportProps> = ({
  activeLUT,
  xmpParams,
  metrics,
  activeSceneId,
  onSelectScene,
  comparisonMode,
  onChangeComparisonMode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scopeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceImageRef = useRef<ImageData | null>(null);
  const customImageRef = useRef<ImageData | null>(null);

  const [splitPosition, setSplitPosition] = useState<number>(52); // 0 to 100%
  const [isDraggingSplit, setIsDraggingSplit] = useState<boolean>(false);
  const [customPhotoName, setCustomPhotoName] = useState<string | null>(null);
  const [hoverProbe, setHoverProbe] = useState<{
    x: number;
    y: number;
    srcRgb: [number, number, number];
    outRgb: [number, number, number];
  } | null>(null);

  const WIDTH = 720;
  const HEIGHT = 405;

  // Build or rebuild source ImageData when scene changes
  useEffect(() => {
    if (activeSceneId === 'custom-upload' && customImageRef.current) {
      sourceImageRef.current = customImageRef.current;
    } else {
      sourceImageRef.current = renderReferenceSceneToImageData(
        activeSceneId,
        WIDTH,
        HEIGHT
      );
    }
  }, [activeSceneId, customPhotoName]);

  // Render graded comparison canvas and live RGB Parade / Luma Waveform scope
  useEffect(() => {
    const canvas = canvasRef.current;
    const scopeCanvas = scopeCanvasRef.current;
    if (!canvas) return;

    if (!sourceImageRef.current) {
      sourceImageRef.current = renderReferenceSceneToImageData(
        activeSceneId,
        WIDTH,
        HEIGHT
      );
    }
    const srcData = sourceImageRef.current.data;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const outImg = ctx.createImageData(WIDTH, HEIGHT);
    const dst = outImg.data;
    const splitX = Math.floor((splitPosition / 100) * WIDTH);
    const mix = clamp(xmpParams.lutIntensity / 100, 0, 1.5);

    // 64-bin RGB histogram for real-time RGB Parade / Waveform scope
    const histR = new Uint32Array(64);
    const histG = new Uint32Array(64);
    const histB = new Uint32Array(64);

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const i = (y * WIDTH + x) * 4;
        const r0 = srcData[i] / 255;
        const g0 = srcData[i + 1] / 255;
        const b0 = srcData[i + 2] / 255;

        let rOut = r0;
        let gOut = g0;
        let bOut = b0;

        if (comparisonMode === 'xmp-vs-original') {
          if (x >= splitX) {
            [rOut, gOut, bOut] = applyLightroomXMPToRGB(r0, g0, b0, xmpParams);
          }
        } else if (comparisonMode === 'lut-vs-original') {
          if (x >= splitX) {
            const [lr, lg, lb] = sampleLUTTrilinear(activeLUT, r0, g0, b0);
            rOut = clamp(r0 + (lr - r0) * mix, 0, 1);
            gOut = clamp(g0 + (lg - g0) * mix, 0, 1);
            bOut = clamp(b0 + (lb - b0) * mix, 0, 1);
          }
        } else if (comparisonMode === 'xmp-vs-lut') {
          if (x < splitX) {
            const [lr, lg, lb] = sampleLUTTrilinear(activeLUT, r0, g0, b0);
            rOut = clamp(r0 + (lr - r0) * mix, 0, 1);
            gOut = clamp(g0 + (lg - g0) * mix, 0, 1);
            bOut = clamp(b0 + (lb - b0) * mix, 0, 1);
          } else {
            [rOut, gOut, bOut] = applyLightroomXMPToRGB(r0, g0, b0, xmpParams);
          }
        } else {
          // Delta-E Error Heatmap between 3D LUT and Lightroom XMP Approximation
          const [lr0, lg0, lb0] = sampleLUTTrilinear(activeLUT, r0, g0, b0);
          const lr = clamp(r0 + (lr0 - r0) * mix, 0, 1);
          const lg = clamp(g0 + (lg0 - g0) * mix, 0, 1);
          const lb = clamp(b0 + (lb0 - b0) * mix, 0, 1);
          const [xr, xg, xb] = applyLightroomXMPToRGB(r0, g0, b0, xmpParams);

          const diff = Math.sqrt(
            0.3 * (lr - xr) ** 2 + 0.59 * (lg - xg) ** 2 + 0.11 * (lb - xb) ** 2
          );
          const heat = clamp(diff * 8.5, 0, 1);
          // False-color heatmap: deep navy (0 error) -> teal -> amber -> crimson
          rOut = clamp(heat * 1.8 - 0.2, 0.06, 1);
          gOut = clamp(1 - Math.abs(heat - 0.5) * 2.1, 0.08, 0.92);
          bOut = clamp(0.85 - heat * 1.5, 0.12, 0.95);
        }

        // Optional film grain & vignette preview from XMP effects
        if (x >= splitX && (xmpParams.grainAmount > 0 || xmpParams.postCropVignette !== 0)) {
          if (xmpParams.postCropVignette !== 0) {
            const dx = (x / WIDTH - 0.5) * 2;
            const dy = (y / HEIGHT - 0.5) * 2;
            const distSq = (dx * dx + dy * dy) * 0.55;
            const vig = 1 + (xmpParams.postCropVignette / 100) * distSq;
            rOut = clamp(rOut * vig, 0, 1);
            gOut = clamp(gOut * vig, 0, 1);
            bOut = clamp(bOut * vig, 0, 1);
          }
        }

        const R8 = clamp(Math.round(rOut * 255), 0, 255);
        const G8 = clamp(Math.round(gOut * 255), 0, 255);
        const B8 = clamp(Math.round(bOut * 255), 0, 255);

        dst[i] = R8;
        dst[i + 1] = G8;
        dst[i + 2] = B8;
        dst[i + 3] = 255;

        // Accumulate graded right-half pixels into RGB histogram
        if (x >= splitX || comparisonMode === 'delta-heatmap') {
          histR[R8 >> 2]++;
          histG[G8 >> 2]++;
          histB[B8 >> 2]++;
        }
      }
    }

    ctx.putImageData(outImg, 0, 0);

    // Draw split divider line if not in heatmap mode
    if (comparisonMode !== 'delta-heatmap') {
      ctx.save();
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(splitX, 0);
      ctx.lineTo(splitX, HEIGHT);
      ctx.stroke();
      ctx.restore();
    }

    // Draw RGB Parade / Histogram Scope
    if (scopeCanvas) {
      const sCtx = scopeCanvas.getContext('2d');
      if (sCtx) {
        const sw = scopeCanvas.width;
        const sh = scopeCanvas.height;
        sCtx.clearRect(0, 0, sw, sh);
        sCtx.fillStyle = '#0D0F17';
        sCtx.fillRect(0, 0, sw, sh);

        // Subtle graticule lines at 25%, 50%, 75%
        sCtx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        sCtx.lineWidth = 1;
        for (const frac of [0.25, 0.5, 0.75]) {
          sCtx.beginPath();
          sCtx.moveTo(0, sh * frac);
          sCtx.lineTo(sw, sh * frac);
          sCtx.stroke();
        }

        let maxBin = 1;
        for (let b = 1; b < 63; b++) {
          maxBin = Math.max(maxBin, histR[b], histG[b], histB[b]);
        }

        const drawChannel = (bins: Uint32Array, stroke: string, fill: string) => {
          sCtx.beginPath();
          sCtx.moveTo(0, sh);
          for (let b = 0; b < 64; b++) {
            const px = (b / 63) * sw;
            const py = sh - clamp((bins[b] / maxBin) * (sh - 10), 0, sh - 4);
            sCtx.lineTo(px, py);
          }
          sCtx.lineTo(sw, sh);
          sCtx.closePath();
          sCtx.fillStyle = fill;
          sCtx.fill();
          sCtx.strokeStyle = stroke;
          sCtx.lineWidth = 1.5;
          sCtx.stroke();
        };

        drawChannel(histB, '#3B82F6', 'rgba(59, 130, 246, 0.18)');
        drawChannel(histG, '#10B981', 'rgba(16, 185, 129, 0.18)');
        drawChannel(histR, '#F43F5E', 'rgba(244, 63, 94, 0.18)');
      }
    }
  }, [activeLUT, xmpParams, activeSceneId, comparisonMode, splitPosition, customPhotoName]);

  const handleUploadReferencePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const off = document.createElement('canvas');
        off.width = WIDTH;
        off.height = HEIGHT;
        const oCtx = off.getContext('2d');
        if (oCtx) {
          oCtx.drawImage(img, 0, 0, WIDTH, HEIGHT);
          customImageRef.current = oCtx.getImageData(0, 0, WIDTH, HEIGHT);
          sourceImageRef.current = customImageRef.current;
          setCustomPhotoName(file.name);
          onSelectScene('custom-upload');
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleCanvasPointerMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceImageRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const relX = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const relY = clamp((e.clientY - rect.top) / rect.height, 0, 1);

    if (isDraggingSplit && comparisonMode !== 'delta-heatmap') {
      setSplitPosition(Math.round(relX * 100));
    }

    const px = Math.min(WIDTH - 1, Math.floor(relX * WIDTH));
    const py = Math.min(HEIGHT - 1, Math.floor(relY * HEIGHT));
    const i = (py * WIDTH + px) * 4;
    const src = sourceImageRef.current.data;
    const r0 = src[i] / 255;
    const g0 = src[i + 1] / 255;
    const b0 = src[i + 2] / 255;
    const [xr, xg, xb] = applyLightroomXMPToRGB(r0, g0, b0, xmpParams);

    setHoverProbe({
      x: px,
      y: py,
      srcRgb: [src[i], src[i + 1], src[i + 2]],
      outRgb: [Math.round(xr * 255), Math.round(xg * 255), Math.round(xb * 255)],
    });
  };

  const currentSceneMeta =
    REFERENCE_SCENES.find((s) => s.id === activeSceneId) ?? REFERENCE_SCENES[0];

  const leftBannerLabel =
    comparisonMode === 'xmp-vs-lut'
      ? `3D LUT (${activeLUT.size}³ .${activeLUT.format.toUpperCase()})`
      : 'Ungraded Reference';

  const rightBannerLabel =
    comparisonMode === 'lut-vs-original'
      ? `3D LUT (${xmpParams.lutIntensity}%)`
      : `XMP · ${xmpParams.presetName}`;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar: Comparison Mode & Reference Test Scene Switcher */}
      <div className="flex flex-col gap-2.5 bg-[#11131C] border border-zinc-800/90 rounded-xl p-3">
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-1 bg-[#090A0F] p-1 rounded-lg border border-zinc-800/80"
          role="group"
          aria-label="Preview Comparison Mode"
        >
          <button
            type="button"
            onClick={() => onChangeComparisonMode('xmp-vs-original')}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap truncate ${
              comparisonMode === 'xmp-vs-original'
                ? 'bg-amber-500 text-zinc-950 font-semibold'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            XMP vs. Original
          </button>
          <button
            type="button"
            onClick={() => onChangeComparisonMode('xmp-vs-lut')}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap truncate ${
              comparisonMode === 'xmp-vs-lut'
                ? 'bg-amber-500 text-zinc-950 font-semibold'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            3D LUT vs. XMP
          </button>
          <button
            type="button"
            onClick={() => onChangeComparisonMode('lut-vs-original')}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap truncate ${
              comparisonMode === 'lut-vs-original'
                ? 'bg-amber-500 text-zinc-950 font-semibold'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            Raw 3D LUT Only
          </button>
          <button
            type="button"
            onClick={() => onChangeComparisonMode('delta-heatmap')}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap truncate ${
              comparisonMode === 'delta-heatmap'
                ? 'bg-amber-500 text-zinc-950 font-semibold'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            Delta-E Heatmap
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <label htmlFor="scene-selector" className="text-xs text-zinc-400 whitespace-nowrap shrink-0">
              Test Plate:
            </label>
            <select
              id="scene-selector"
              aria-label="Select Reference Test Plate"
              value={activeSceneId}
              onChange={(e) => onSelectScene(e.target.value)}
              className="flex-1 min-w-0 bg-[#090A0F] border border-zinc-800 text-zinc-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-500"
            >
              {REFERENCE_SCENES.map((scene) => (
                <option key={scene.id} value={scene.id}>
                  {scene.name}
                </option>
              ))}
              {customPhotoName && (
                <option value="custom-upload">Custom Photo: {customPhotoName}</option>
              )}
            </select>
          </div>

          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-[#090A0F] hover:bg-zinc-800 border border-zinc-800 rounded-lg cursor-pointer transition-colors whitespace-nowrap shrink-0">
            <Upload className="w-3.5 h-3.5 text-amber-400" />
            <span>Load Photo</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleUploadReferencePhoto}
              className="sr-only"
              aria-label="Upload custom reference photo"
            />
          </label>
        </div>
      </div>

      {/* Main Split-Wipe Color Grading Canvas */}
      <div className="relative bg-[#07080C] border border-zinc-800/90 rounded-xl overflow-hidden select-none">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          data-testid="grading-preview-canvas"
          onMouseDown={() => setIsDraggingSplit(true)}
          onMouseUp={() => setIsDraggingSplit(false)}
          onMouseLeave={() => {
            setIsDraggingSplit(false);
            setHoverProbe(null);
          }}
          onMouseMove={handleCanvasPointerMove}
          className="w-full h-auto block cursor-ew-resize aspect-video"
        />

        {/* Top-left and top-right measured scrim labels with strict max-w-[44%] so they never collide */}
        {comparisonMode !== 'delta-heatmap' ? (
          <>
            <div className="pointer-events-none absolute top-3 left-3 max-w-[44%] truncate bg-black/80 px-2.5 py-1 rounded-md border border-white/10 text-xs text-zinc-200">
              <span className="text-zinc-400">Left · </span>
              <span className="font-medium">{leftBannerLabel}</span>
            </div>
            <div className="pointer-events-none absolute top-3 right-3 max-w-[44%] truncate bg-black/80 px-2.5 py-1 rounded-md border border-amber-500/30 text-xs text-amber-200">
              <span className="text-amber-400/80">Right · </span>
              <span className="font-medium">{rightBannerLabel}</span>
            </div>
          </>
        ) : (
          <div className="pointer-events-none absolute top-3 left-3 bg-black/85 px-3 py-1 rounded-md border border-white/10 text-xs text-zinc-200">
            CIE76 Delta-E Color Approximation Map · Mean ΔE {metrics.meanDeltaE.toFixed(2)} · Peak ΔE{' '}
            {metrics.maxDeltaE.toFixed(2)}
          </div>
        )}

        {/* Bottom Split Wipe Slider Control & Pixel Probe Readout */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-[#0D0F17]/95 border-t border-zinc-800/90 text-xs">
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <label htmlFor="split-wipe-range" className="text-zinc-400 whitespace-nowrap">
              Split Wipe
            </label>
            <input
              id="split-wipe-range"
              type="range"
              min={0}
              max={100}
              value={splitPosition}
              onChange={(e) => setSplitPosition(Number(e.target.value))}
              disabled={comparisonMode === 'delta-heatmap'}
              className="w-28 accent-amber-500 cursor-pointer"
            />
            <span className="font-mono tabular-nums text-zinc-300 w-8">
              {splitPosition}%
            </span>
          </div>

          <div className="text-zinc-400 font-mono tabular-nums truncate">
            {hoverProbe ? (
              <span>
                XY({hoverProbe.x},{hoverProbe.y}) · RGB({hoverProbe.srcRgb.join(',')}) → XMP(
                {hoverProbe.outRgb.join(',')})
              </span>
            ) : (
              <span>{currentSceneMeta.exifSummary}</span>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Telemetry Strip: Live RGB Histogram Scope + Extracted Color Science Summary */}
      <div className="flex flex-col gap-3.5 bg-[#11131C] border border-zinc-800/90 rounded-xl p-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-medium text-zinc-200 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-amber-400" />
              Graded RGB Parade &amp; Luminance Distribution
            </span>
            <span className="font-mono tabular-nums">8-Bit Code Value 0 — 255</span>
          </div>
          <canvas
            ref={scopeCanvasRef}
            width={560}
            height={68}
            data-testid="rgb-parade-canvas"
            className="w-full h-[68px] rounded-lg border border-zinc-800/90 block"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-zinc-800/80">
          <div>
            <div className="text-xs text-zinc-400">XMP Fidelity (ΔE)</div>
            <div className="text-base font-semibold font-mono tabular-nums text-zinc-100 mt-0.5">
              {metrics.meanDeltaE.toFixed(2)}
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">
              Peak {metrics.maxDeltaE.toFixed(1)} · CIE76
            </div>
          </div>

          <div>
            <div className="text-xs text-zinc-400">Tone Floor / Ceiling</div>
            <div className="text-base font-semibold font-mono tabular-nums text-zinc-100 mt-0.5">
              {metrics.blackFloorLift} — {metrics.whiteCeilingClip}
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">
              Span {metrics.dynamicRangeCompression >= 0 ? `-${metrics.dynamicRangeCompression}%` : `+${Math.abs(metrics.dynamicRangeCompression)}%`}
            </div>
          </div>

          <div>
            <div className="text-xs text-zinc-400">Shadow Split Cast</div>
            <div className="text-xs font-semibold text-zinc-100 mt-1 truncate">
              {metrics.dominantShadowCast}
            </div>
            <div className="text-xs font-mono tabular-nums text-zinc-500 mt-0.5">
              {xmpParams.shadowHue}° · Sat {xmpParams.shadowSat}
            </div>
          </div>

          <div>
            <div className="text-xs text-zinc-400">Highlight Split Cast</div>
            <div className="text-xs font-semibold text-zinc-100 mt-1 truncate">
              {metrics.dominantHighlightCast}
            </div>
            <div className="text-xs font-mono tabular-nums text-zinc-500 mt-0.5">
              {xmpParams.highlightHue}° · Sat {xmpParams.highlightSat}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
