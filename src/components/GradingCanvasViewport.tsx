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
import {
  Undo2,
  Redo2,
  Pipette,
  Maximize2,
  Columns2,
  Square,
  SplitSquareHorizontal,
  Eye,
  Box,
  Scan,
  Crop,
} from 'lucide-react';

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
  customPhotoData?: ImageData | null;
  customPhotoName?: string | null;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

export const GradingCanvasViewport: React.FC<GradingCanvasViewportProps> = ({
  activeLUT,
  xmpParams,
  metrics,
  activeSceneId,
  onSelectScene,
  comparisonMode,
  onChangeComparisonMode,
  customPhotoData,
  customPhotoName,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sourceImageRef = useRef<ImageData | null>(null);

  const [splitPosition, setSplitPosition] = useState<number>(47); // Matches center-left split in mockup
  const [isDraggingSplit, setIsDraggingSplit] = useState<boolean>(false);
  const [zoomMode, setZoomMode] = useState<'Fit' | '100%' | 'Fill'>('Fit');
  const [probeEnabled, setProbeEnabled] = useState<boolean>(false);
  const [hoverProbe, setHoverProbe] = useState<{
    x: number;
    y: number;
    srcRgb: [number, number, number];
    outRgb: [number, number, number];
  } | null>(null);

  const WIDTH = 768;
  const HEIGHT = 432;

  // Build or rebuild source ImageData when scene or custom upload changes
  useEffect(() => {
    if (activeSceneId === 'custom-upload' && customPhotoData) {
      sourceImageRef.current = customPhotoData;
    } else {
      sourceImageRef.current = renderReferenceSceneToImageData(
        activeSceneId,
        WIDTH,
        HEIGHT
      );
    }
  }, [activeSceneId, customPhotoData, customPhotoName]);

  // Render graded split-screen canvas
  useEffect(() => {
    const canvas = canvasRef.current;
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
          // Delta-E Error Heatmap
          const [lr0, lg0, lb0] = sampleLUTTrilinear(activeLUT, r0, g0, b0);
          const lr = clamp(r0 + (lr0 - r0) * mix, 0, 1);
          const lg = clamp(g0 + (lg0 - g0) * mix, 0, 1);
          const lb = clamp(b0 + (lb0 - b0) * mix, 0, 1);
          const [xr, xg, xb] = applyLightroomXMPToRGB(r0, g0, b0, xmpParams);

          const diff = Math.sqrt(
            0.3 * (lr - xr) ** 2 + 0.59 * (lg - xg) ** 2 + 0.11 * (lb - xb) ** 2
          );
          const heat = clamp(diff * 8.5, 0, 1);
          rOut = clamp(heat * 1.8 - 0.2, 0.06, 1);
          gOut = clamp(1 - Math.abs(heat - 0.5) * 2.1, 0.08, 0.92);
          bOut = clamp(0.85 - heat * 1.5, 0.12, 0.95);
        }

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

        dst[i] = clamp(Math.round(rOut * 255), 0, 255);
        dst[i + 1] = clamp(Math.round(gOut * 255), 0, 255);
        dst[i + 2] = clamp(Math.round(bOut * 255), 0, 255);
        dst[i + 3] = 255;
      }
    }

    ctx.putImageData(outImg, 0, 0);
  }, [activeLUT, xmpParams, activeSceneId, comparisonMode, splitPosition, customPhotoData, customPhotoName]);

  const handlePointerMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceImageRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const relX = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const relY = clamp((e.clientY - rect.top) / rect.height, 0, 1);

    if (isDraggingSplit && comparisonMode !== 'delta-heatmap') {
      setSplitPosition(clamp(Math.round(relX * 100), 4, 96));
    }

    if (probeEnabled) {
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
    }
  };

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const shortLutName = activeLUT.title.replace(/\s+Print$/i, '');

  const leftBadgeText =
    comparisonMode === 'xmp-vs-lut'
      ? `3D LUT (${activeLUT.size}³)`
      : 'Original';

  const rightBadgeText =
    comparisonMode === 'lut-vs-original'
      ? `3D LUT (${shortLutName})`
      : `Graded (${shortLutName})`;

  return (
    <div
      ref={containerRef}
      className="bg-[#121221] border border-[#24243B] rounded-2xl p-3 flex flex-col gap-2.5 shadow-xl"
    >
      {/* Top Viewport Mode Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="flex items-center gap-1.5"
          role="group"
          aria-label="Preview Comparison Mode"
        >
          <button
            type="button"
            onClick={() => onChangeComparisonMode('xmp-vs-original')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
              comparisonMode === 'xmp-vs-original'
                ? 'bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white shadow-[0_0_16px_rgba(139,92,246,0.45)] border border-[#A78BFA]/60'
                : 'bg-[#171729] border border-[#292942] text-zinc-300 hover:text-white'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-violet-200" />
            <span>XMP (Lightroom)</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeComparisonMode('lut-vs-original')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-xl transition-all cursor-pointer ${
              comparisonMode === 'lut-vs-original'
                ? 'bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white shadow-[0_0_16px_rgba(139,92,246,0.45)] border border-[#A78BFA]/60'
                : 'bg-[#171729] border border-[#292942] text-zinc-300 hover:text-white'
            }`}
          >
            <Box className="w-3.5 h-3.5 text-zinc-400" />
            <span>3D LUT</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeComparisonMode('xmp-vs-lut')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-xl transition-all cursor-pointer ${
              comparisonMode === 'xmp-vs-lut'
                ? 'bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white shadow-[0_0_16px_rgba(139,92,246,0.45)] border border-[#A78BFA]/60'
                : 'bg-[#171729] border border-[#292942] text-zinc-300 hover:text-white'
            }`}
          >
            <Columns2 className="w-3.5 h-3.5 text-zinc-400" />
            <span>Side-by-Side</span>
          </button>
        </div>

        {/* Right Zoom / Test Plate Selector & View Controls */}
        <div className="flex items-center gap-1.5">
          <select
            aria-label="Zoom and Reference Plate"
            value={activeSceneId}
            onChange={(e) => onSelectScene(e.target.value)}
            className="bg-[#171729] border border-[#292942] text-zinc-200 text-xs font-medium rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-violet-500 cursor-pointer"
          >
            <option value="alpine-sunrise">Fit · Mountain Sunrise</option>
            <option value="golden-portrait">Fit · Portrait &amp; Skin</option>
            <option value="neon-twilight-street">Fit · Blue Hour Street</option>
            <option value="colorchecker-chart">Fit · 24-Patch Chart</option>
            {customPhotoName && (
              <option value="custom-upload">Fit · {customPhotoName}</option>
            )}
          </select>

          <button
            type="button"
            title="Toggle Zoom Fit / 100%"
            onClick={() => setZoomMode((z) => (z === 'Fit' ? '100%' : 'Fit'))}
            className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
              zoomMode === '100%'
                ? 'bg-violet-600/30 border-violet-500 text-violet-200'
                : 'bg-[#171729] border-[#292942] text-zinc-400 hover:text-white'
            }`}
          >
            <Scan className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            title="Center Split Wipe (50%)"
            onClick={() => setSplitPosition(50)}
            className="p-1.5 rounded-lg bg-[#171729] border border-[#292942] text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <Crop className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            title="Fullscreen Grading Canvas"
            onClick={handleToggleFullscreen}
            className="p-1.5 rounded-lg bg-[#171729] border border-[#292942] text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Split-Wipe Interactive Canvas Container */}
      <div
        onMouseDown={() => setIsDraggingSplit(true)}
        onMouseUp={() => setIsDraggingSplit(false)}
        onMouseLeave={() => {
          setIsDraggingSplit(false);
          setHoverProbe(null);
        }}
        onMouseMove={handlePointerMove}
        className="relative bg-[#090912] border border-[#26263E] rounded-xl overflow-hidden select-none cursor-ew-resize"
      >
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          data-testid="grading-preview-canvas"
          className={`w-full h-auto block aspect-video transition-transform duration-200 ${
            zoomMode === '100%' ? 'scale-110' : ''
          }`}
        />

        {/* Top-left & Top-right floating scrim pills matching CineLUT Studio */}
        {comparisonMode !== 'delta-heatmap' ? (
          <>
            <div className="pointer-events-none absolute top-3.5 left-3.5 max-w-[42%] truncate bg-[#151824]/80 backdrop-blur-md px-3 py-1 rounded-lg border border-white/10 text-xs font-medium text-zinc-100 shadow-md">
              {leftBadgeText}
            </div>
            <div className="pointer-events-none absolute top-3.5 right-3.5 max-w-[46%] truncate bg-[#1A1625]/85 backdrop-blur-md px-3 py-1 rounded-lg border border-white/15 text-xs font-medium text-zinc-100 shadow-md">
              {rightBadgeText}
            </div>

            {/* Vertical White Split Line + Centered White Circular "< >" Handle */}
            <div
              style={{ left: `${splitPosition}%` }}
              className="pointer-events-none absolute inset-y-0 -translate-x-1/2 flex flex-col items-center justify-center"
            >
              <div className="w-[1.5px] h-full bg-white/95 shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
              <div
                aria-label="Split Wipe Handle"
                className="pointer-events-auto absolute w-9 h-9 rounded-full bg-white text-zinc-900 shadow-[0_4px_18px_rgba(0,0,0,0.55)] border border-white flex items-center justify-center cursor-ew-resize hover:scale-105 transition-transform"
              >
                <span className="text-xs font-bold tracking-tighter select-none">
                  &lt; &gt;
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="pointer-events-none absolute top-3.5 left-3.5 bg-black/80 backdrop-blur-md px-3 py-1 rounded-lg border border-white/10 text-xs text-zinc-100">
            CIE76 Delta-E Error Map · Mean ΔE {metrics.meanDeltaE.toFixed(2)} · Peak ΔE{' '}
            {metrics.maxDeltaE.toFixed(2)}
          </div>
        )}

        {/* Live Pixel Probe Overlay when Eyedropper is active */}
        {probeEnabled && hoverProbe && (
          <div className="pointer-events-none absolute bottom-3 left-3 bg-black/85 backdrop-blur-md px-3 py-1 rounded-lg border border-violet-500/40 text-[11px] font-mono text-zinc-200">
            XY({hoverProbe.x},{hoverProbe.y}) · Raw RGB({hoverProbe.srcRgb.join(',')}) → Graded(
            {hoverProbe.outRgb.join(',')})
          </div>
        )}
      </div>

      {/* Bottom Viewport Toolbar: Undo/Redo (Left), 4 Split Icons (Center), Eyedropper & Fullscreen (Right) */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        {/* Left: Undo / Redo */}
        <div className="flex items-center bg-[#171728] border border-[#282840] rounded-xl p-0.5">
          <button
            type="button"
            title="Undo parameter change"
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1.5 px-2.5 text-zinc-300 hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <div className="w-[1px] h-4 bg-[#282840]" />
          <button
            type="button"
            title="Redo parameter change"
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1.5 px-2.5 text-zinc-300 hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Center: 4 Split / Comparison View Mode Buttons */}
        <div className="flex items-center gap-1 bg-[#171728] border border-[#282840] rounded-xl p-1">
          <button
            type="button"
            title="Full Graded Preview"
            onClick={() => {
              onChangeComparisonMode('xmp-vs-original');
              setSplitPosition(4);
            }}
            className={`p-1.5 px-2 rounded-lg transition-colors cursor-pointer ${
              comparisonMode !== 'delta-heatmap' && splitPosition <= 10
                ? 'bg-[#28234A] text-violet-300 border border-violet-500/40'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Square className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            title="Interactive Split Wipe (Before / After)"
            onClick={() => {
              onChangeComparisonMode('xmp-vs-original');
              setSplitPosition(47);
            }}
            className={`p-1.5 px-2 rounded-lg transition-colors cursor-pointer ${
              comparisonMode === 'xmp-vs-original' && splitPosition > 10 && splitPosition < 90
                ? 'bg-[#28234A] text-violet-300 border border-violet-500/40'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <SplitSquareHorizontal className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            title="Side-by-Side 3D LUT vs Lightroom XMP"
            onClick={() => {
              onChangeComparisonMode('xmp-vs-lut');
              setSplitPosition(50);
            }}
            className={`p-1.5 px-2 rounded-lg transition-colors cursor-pointer ${
              comparisonMode === 'xmp-vs-lut'
                ? 'bg-[#28234A] text-violet-300 border border-violet-500/40'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Columns2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            title="CIE76 Delta-E Color Accuracy Heatmap"
            onClick={() =>
              onChangeComparisonMode(
                comparisonMode === 'delta-heatmap' ? 'xmp-vs-original' : 'delta-heatmap'
              )
            }
            className={`p-1.5 px-2 rounded-lg transition-colors cursor-pointer ${
              comparisonMode === 'delta-heatmap'
                ? 'bg-[#28234A] text-violet-300 border border-violet-500/40'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Eyedropper Pixel Probe & Fullscreen */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            title="Toggle Eyedropper Color Probe"
            onClick={() => setProbeEnabled((p) => !p)}
            className={`p-2 rounded-xl border transition-colors cursor-pointer ${
              probeEnabled
                ? 'bg-violet-600/30 border-violet-500 text-violet-200'
                : 'bg-[#171728] border-[#282840] text-zinc-300 hover:text-white'
            }`}
          >
            <Pipette className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Toggle Fullscreen Preview"
            onClick={handleToggleFullscreen}
            className="p-2 rounded-xl bg-[#171728] border border-[#282840] text-zinc-300 hover:text-white transition-colors cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
