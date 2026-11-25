import React, { useState } from 'react';
import { CurvePoint, LightroomXMPParams, clamp } from '../utils/lutEngine';
import { RotateCcw } from 'lucide-react';

type ActiveCurveChannel = 'rgb' | 'red' | 'green' | 'blue';

interface ToneCurveEditorProps {
  params: LightroomXMPParams;
  onUpdateParams: (updater: (prev: LightroomXMPParams) => LightroomXMPParams) => void;
  onChangePointDensity: (count: 5 | 9 | 17) => void;
}

export const ToneCurveEditor: React.FC<ToneCurveEditorProps> = ({
  params,
  onUpdateParams,
  onChangePointDensity,
}) => {
  const [activeChannel, setActiveChannel] = useState<ActiveCurveChannel>('rgb');
  const [selectedPointIndex, setSelectedPointIndex] = useState<number>(
    Math.floor(params.toneCurveRGB.length / 2)
  );

  const getActivePoints = (): CurvePoint[] => {
    if (activeChannel === 'red') return params.toneCurveRed;
    if (activeChannel === 'green') return params.toneCurveGreen;
    if (activeChannel === 'blue') return params.toneCurveBlue;
    return params.toneCurveRGB;
  };

  const activePoints = getActivePoints();
  const safeSelectedIdx = clamp(selectedPointIndex, 0, Math.max(0, activePoints.length - 1));
  const selectedPoint = activePoints[safeSelectedIdx] ?? { x: 128, y: 128 };

  const updatePointY = (index: number, newY: number) => {
    const clampedY = clamp(Math.round(newY), 0, 255);
    onUpdateParams((prev) => {
      const key =
        activeChannel === 'red'
          ? 'toneCurveRed'
          : activeChannel === 'green'
          ? 'toneCurveGreen'
          : activeChannel === 'blue'
          ? 'toneCurveBlue'
          : 'toneCurveRGB';
      const nextCurve = prev[key].map((pt, idx) =>
        idx === index ? { ...pt, y: clampedY } : pt
      );
      return {
        ...prev,
        [key]: nextCurve,
      };
    });
  };

  const resetActiveChannelToLinear = () => {
    onUpdateParams((prev) => {
      const key =
        activeChannel === 'red'
          ? 'toneCurveRed'
          : activeChannel === 'green'
          ? 'toneCurveGreen'
          : activeChannel === 'blue'
          ? 'toneCurveBlue'
          : 'toneCurveRGB';
      const linear = prev[key].map((pt) => ({ x: pt.x, y: pt.x }));
      return {
        ...prev,
        [key]: linear,
      };
    });
  };

  const buildPolyline = (pts: CurvePoint[]): string => {
    return pts
      .map((p) => {
        const sx = (p.x / 255) * 240;
        const sy = 240 - (p.y / 255) * 240;
        return `${sx.toFixed(1)},${sy.toFixed(1)}`;
      })
      .join(' ');
  };

  const activeStrokeColor =
    activeChannel === 'red'
      ? '#F43F5E'
      : activeChannel === 'green'
      ? '#10B981'
      : activeChannel === 'blue'
      ? '#3B82F6'
      : '#F59E0B';

  return (
    <div className="flex flex-col gap-4">
      {/* Channel Selector & Curve Point Density */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="flex items-center gap-1 bg-[#090A0F] p-1 rounded-lg border border-zinc-800/80"
          role="group"
          aria-label="Tone Curve Channel"
        >
          {(
            [
              { id: 'rgb', label: 'Master RGB' },
              { id: 'red', label: 'Red' },
              { id: 'green', label: 'Green' },
              { id: 'blue', label: 'Blue' },
            ] as const
          ).map((ch) => (
            <button
              key={ch.id}
              type="button"
              onClick={() => setActiveChannel(ch.id)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeChannel === ch.id
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {ch.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-400">Nodes:</span>
          {([5, 9, 17] as const).map((cnt) => (
            <button
              key={cnt}
              type="button"
              onClick={() => {
                onChangePointDensity(cnt);
                setSelectedPointIndex(Math.floor(cnt / 2));
              }}
              className={`px-2 py-1 text-xs font-mono tabular-nums rounded border transition-colors whitespace-nowrap shrink-0 ${
                params.curvePointCount === cnt
                  ? 'bg-amber-500/15 border-amber-500/60 text-amber-300 font-semibold'
                  : 'bg-[#090A0F] border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {cnt}pt
            </button>
          ))}
        </div>
      </div>

      {/* Interactive 240x240 SVG Tone Curve Graph */}
      <div className="relative bg-[#090A0F] border border-zinc-800/90 rounded-xl p-3 flex flex-col items-center">
        <svg
          viewBox="0 0 240 240"
          className="w-full max-w-[260px] aspect-square overflow-visible select-none"
          role="img"
          aria-label={`Lightroom ToneCurvePV2012 ${activeChannel.toUpperCase()} Graph`}
        >
          {/* Quarter Grid Lines */}
          {[60, 120, 180].map((pos) => (
            <g key={pos}>
              <line
                x1={pos}
                y1={0}
                x2={pos}
                y2={240}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="1"
              />
              <line
                x1={0}
                y1={pos}
                x2={240}
                y2={pos}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="1"
              />
            </g>
          ))}

          {/* Linear Reference Diagonal */}
          <line
            x1={0}
            y1={240}
            x2={240}
            y2={0}
            stroke="rgba(255,255,255,0.14)"
            strokeDasharray="4 4"
            strokeWidth="1"
          />

          {/* Ghost curves of other RGB channels for visual context */}
          <polyline
            fill="none"
            stroke="rgba(244, 63, 94, 0.35)"
            strokeWidth="1.25"
            points={buildPolyline(params.toneCurveRed)}
          />
          <polyline
            fill="none"
            stroke="rgba(16, 185, 129, 0.35)"
            strokeWidth="1.25"
            points={buildPolyline(params.toneCurveGreen)}
          />
          <polyline
            fill="none"
            stroke="rgba(59, 130, 246, 0.35)"
            strokeWidth="1.25"
            points={buildPolyline(params.toneCurveBlue)}
          />

          {/* Active Channel Curve */}
          <polyline
            fill="none"
            stroke={activeStrokeColor}
            strokeWidth="2.5"
            points={buildPolyline(activePoints)}
          />

          {/* Interactive Control Points */}
          {activePoints.map((pt, idx) => {
            const cx = (pt.x / 255) * 240;
            const cy = 240 - (pt.y / 255) * 240;
            const isSelected = idx === safeSelectedIdx;
            return (
              <g
                key={pt.x}
                onClick={() => setSelectedPointIndex(idx)}
                className="cursor-pointer"
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={isSelected ? 6 : 4}
                  fill={isSelected ? '#F59E0B' : '#18181B'}
                  stroke={activeStrokeColor}
                  strokeWidth={2}
                />
              </g>
            );
          })}
        </svg>

        {/* Selected Node Fine Adjustment Slider */}
        <div className="w-full mt-3 pt-3 border-t border-zinc-800/80 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400">
              Node #{safeSelectedIdx + 1} · Input{' '}
              <span className="font-mono tabular-nums text-zinc-200">{selectedPoint.x}</span>
            </span>
            <button
              type="button"
              onClick={resetActiveChannelToLinear}
              className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Flatten Channel</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <label htmlFor="curve-node-output" className="text-xs text-zinc-400 whitespace-nowrap">
              Output Y:
            </label>
            <input
              id="curve-node-output"
              type="range"
              min={0}
              max={255}
              value={selectedPoint.y}
              onChange={(e) => updatePointY(safeSelectedIdx, Number(e.target.value))}
              className="flex-1 accent-amber-500 cursor-pointer"
            />
            <span className="text-xs font-mono tabular-nums text-amber-400 w-10 text-right">
              {selectedPoint.y}
            </span>
          </div>
        </div>
      </div>

      {/* Parametric Curve Regions */}
      <div className="flex flex-col gap-2.5 bg-[#090A0F] border border-zinc-800/90 rounded-xl p-3">
        <div className="text-xs font-medium text-zinc-300">
          Parametric Tone Curve Regions (crs:Parametric*)
        </div>
        {(
          [
            { key: 'parametricHighlights', label: 'Highlights' },
            { key: 'parametricLights', label: 'Lights' },
            { key: 'parametricDarks', label: 'Darks' },
            { key: 'parametricShadows', label: 'Shadows' },
          ] as const
        ).map((item) => (
          <div key={item.key} className="grid grid-cols-12 items-center gap-2 text-xs">
            <label htmlFor={`param-${item.key}`} className="col-span-4 text-zinc-400">
              {item.label}
            </label>
            <input
              id={`param-${item.key}`}
              type="range"
              min={-100}
              max={100}
              value={params[item.key]}
              onChange={(e) => {
                const val = Number(e.target.value);
                onUpdateParams((prev) => ({ ...prev, [item.key]: val }));
              }}
              className="col-span-6 accent-amber-500 cursor-pointer"
            />
            <span className="col-span-2 text-right font-mono tabular-nums text-zinc-200">
              {params[item.key] > 0 ? `+${params[item.key]}` : params[item.key]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
