import React, { useState } from 'react';
import {
  HSL_CHANNELS,
  HSLChannelName,
  LightroomXMPParams,
  ACR_HUE_CENTERS,
} from '../utils/lutEngine';

interface HSLAndColorWheelsPanelProps {
  params: LightroomXMPParams;
  onUpdateParams: (updater: (prev: LightroomXMPParams) => LightroomXMPParams) => void;
}

const CHANNEL_SWATCH_COLORS: Record<HSLChannelName, string> = {
  Red: '#EF4444',
  Orange: '#F97316',
  Yellow: '#EAB308',
  Green: '#22C55E',
  Aqua: '#06B6D4',
  Blue: '#3B82F6',
  Purple: '#A855F7',
  Magenta: '#EC4899',
};

export const HSLAndColorWheelsPanel: React.FC<HSLAndColorWheelsPanelProps> = ({
  params,
  onUpdateParams,
}) => {
  const [activeHSLComponent, setActiveHSLComponent] = useState<'hue' | 'saturation' | 'luminance'>(
    'saturation'
  );

  const updateHSLValue = (
    channel: HSLChannelName,
    component: 'hue' | 'saturation' | 'luminance',
    value: number
  ) => {
    onUpdateParams((prev) => ({
      ...prev,
      hsl: {
        ...prev.hsl,
        [channel]: {
          ...prev.hsl[channel],
          [component]: value,
        },
      },
    }));
  };

  return (
    <div className="flex flex-col gap-5">
      {/* 8-Channel HSL Matrix Section */}
      <div className="bg-[#090A0F] border border-zinc-800/90 rounded-xl p-3.5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-zinc-200">
            8-Channel HSL Color Mixer
          </h3>
          <div
            className="flex items-center gap-1 bg-[#11131C] p-0.5 rounded-lg border border-zinc-800"
            role="group"
            aria-label="HSL Parameter Tab"
          >
            {(
              [
                { id: 'hue', label: 'Hue' },
                { id: 'saturation', label: 'Saturation' },
                { id: 'luminance', label: 'Luminance' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveHSLComponent(tab.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeHSLComponent === tab.id
                    ? 'bg-amber-500 text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {HSL_CHANNELS.map((ch) => {
            const val = params.hsl[ch][activeHSLComponent];
            return (
              <div
                key={ch}
                className="grid grid-cols-12 items-center gap-2 text-xs py-0.5"
              >
                <label
                  htmlFor={`hsl-${ch}-${activeHSLComponent}`}
                  className="col-span-4 flex items-center gap-2 text-zinc-300"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-xs shrink-0"
                    style={{ backgroundColor: CHANNEL_SWATCH_COLORS[ch] }}
                    aria-hidden="true"
                  />
                  <span>{ch}</span>
                </label>
                <input
                  id={`hsl-${ch}-${activeHSLComponent}`}
                  type="range"
                  min={-100}
                  max={100}
                  value={val}
                  onChange={(e) =>
                    updateHSLValue(ch, activeHSLComponent, Number(e.target.value))
                  }
                  className="col-span-6 accent-amber-500 cursor-pointer"
                />
                <span className="col-span-2 text-right font-mono tabular-nums text-zinc-200">
                  {val > 0 ? `+${val}` : val}
                </span>
              </div>
            );
          })}
        </div>

        {/* Complete 8x3 Compact HSL Matrix Table */}
        <div className="mt-2 pt-2.5 border-t border-zinc-800/80 overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800/80">
                <th className="py-1.5 font-medium">Band</th>
                <th className="py-1.5 font-medium text-right">Center</th>
                <th className="py-1.5 font-medium text-right">Hue</th>
                <th className="py-1.5 font-medium text-right">Sat</th>
                <th className="py-1.5 font-medium text-right">Lum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40 font-mono tabular-nums">
              {HSL_CHANNELS.map((ch) => {
                const row = params.hsl[ch];
                return (
                  <tr key={ch} className="hover:bg-zinc-900/50">
                    <td className="py-1 font-sans text-zinc-300">{ch}</td>
                    <td className="py-1 text-right text-zinc-500">{ACR_HUE_CENTERS[ch]}°</td>
                    <td className="py-1 text-right text-zinc-200">
                      {row.hue > 0 ? `+${row.hue}` : row.hue}
                    </td>
                    <td className="py-1 text-right text-zinc-200">
                      {row.saturation > 0 ? `+${row.saturation}` : row.saturation}
                    </td>
                    <td className="py-1 text-right text-zinc-200">
                      {row.luminance > 0 ? `+${row.luminance}` : row.luminance}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3-Way Color Grading (Shadows / Midtones / Highlights) */}
      <div className="bg-[#090A0F] border border-zinc-800/90 rounded-xl p-3.5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-200">
            3-Way Color Grading &amp; Split Toning
          </h3>
          <span className="text-xs text-zinc-500 font-mono tabular-nums">
            Blend {params.colorGradeBlending}%
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {(
            [
              {
                title: 'Shadows',
                hueKey: 'shadowHue',
                satKey: 'shadowSat',
                lumKey: 'shadowLum',
              },
              {
                title: 'Midtones',
                hueKey: 'midtoneHue',
                satKey: 'midtoneSat',
                lumKey: 'midtoneLum',
              },
              {
                title: 'Highlights',
                hueKey: 'highlightHue',
                satKey: 'highlightSat',
                lumKey: 'highlightLum',
              },
            ] as const
          ).map((wheel) => {
            const hue = params[wheel.hueKey];
            const sat = params[wheel.satKey];
            const angleRad = ((hue - 90) * Math.PI) / 180;
            const radius = (sat / 100) * 28;
            const dotX = 36 + Math.cos(angleRad) * radius;
            const dotY = 36 + Math.sin(angleRad) * radius;

            return (
              <div
                key={wheel.title}
                className="flex flex-col items-center bg-[#11131C] border border-zinc-800/80 rounded-lg p-2"
              >
                <span className="text-xs font-medium text-zinc-300 mb-1.5">
                  {wheel.title}
                </span>
                <svg
                  viewBox="0 0 72 72"
                  className="w-16 h-16 overflow-visible"
                  aria-label={`${wheel.title} Color Wheel`}
                >
                  <circle
                    cx={36}
                    cy={36}
                    r={30}
                    fill="#090A0F"
                    stroke="rgba(255,255,255,0.14)"
                    strokeWidth="1.5"
                  />
                  <line
                    x1={36}
                    y1={6}
                    x2={36}
                    y2={66}
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth="1"
                  />
                  <line
                    x1={6}
                    y1={36}
                    x2={66}
                    y2={36}
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth="1"
                  />
                  <line
                    x1={36}
                    y1={36}
                    x2={dotX}
                    y2={dotY}
                    stroke={`hsl(${hue}, 85%, 60%)`}
                    strokeWidth="1.5"
                  />
                  <circle
                    cx={dotX}
                    cy={dotY}
                    r={5}
                    fill={`hsl(${hue}, 85%, 55%)`}
                    stroke="#FFFFFF"
                    strokeWidth="1.5"
                  />
                </svg>

                <div className="w-full mt-2 flex flex-col gap-1.5 text-xs">
                  <div className="flex items-center justify-between font-mono tabular-nums text-zinc-400">
                    <span>H {hue}°</span>
                    <span>S {sat}</span>
                  </div>
                  <input
                    type="range"
                    aria-label={`${wheel.title} Hue`}
                    min={0}
                    max={360}
                    value={hue}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      onUpdateParams((prev) => ({ ...prev, [wheel.hueKey]: v }));
                    }}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <input
                    type="range"
                    aria-label={`${wheel.title} Saturation`}
                    min={0}
                    max={100}
                    value={sat}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      onUpdateParams((prev) => ({ ...prev, [wheel.satKey]: v }));
                    }}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
