import React, { useState } from 'react';
import {
  LUT3D,
  LightroomXMPParams,
  LUTAnalysisMetrics,
  generateLightroomXMP,
  fitLUTToLightroomXMP,
  serializeCubeLUT,
} from '../utils/lutEngine';
import { Copy, Check, Download, FileCode2, Layers, Sparkles } from 'lucide-react';

interface XMPInspectorAndBatchViewProps {
  mode: 'inspector' | 'batch';
  activeLUT: LUT3D;
  allLUTs: LUT3D[];
  xmpParams: LightroomXMPParams;
  metrics: LUTAnalysisMetrics;
  onSelectLUT: (lut: LUT3D) => void;
  onTriggerSingleExport: () => void;
}

export const XMPInspectorAndBatchView: React.FC<XMPInspectorAndBatchViewProps> = ({
  mode,
  activeLUT,
  allLUTs,
  xmpParams,
  metrics,
  onSelectLUT,
  onTriggerSingleExport,
}) => {
  const [copiedXml, setCopiedXml] = useState(false);
  const [batchGroup, setBatchGroup] = useState(xmpParams.presetGroup);
  const [batchIntensity, setBatchIntensity] = useState(xmpParams.lutIntensity);
  const [batchSkinProtection, setBatchSkinProtection] = useState(
    xmpParams.skinToneProtection
  );
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>(() =>
    allLUTs.map((l) => l.id)
  );
  const [batchExportCount, setBatchExportCount] = useState<number>(0);

  const xmlString = generateLightroomXMP(xmpParams);

  const handleCopyXML = async () => {
    try {
      await navigator.clipboard.writeText(xmlString);
      setCopiedXml(true);
      setTimeout(() => setCopiedXml(false), 2000);
    } catch {
      setCopiedXml(true);
      setTimeout(() => setCopiedXml(false), 2000);
    }
  };

  const handleDownloadCubeSample = (lut: LUT3D) => {
    const content = serializeCubeLUT(lut);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${lut.title.replace(/[^a-z0-9-_]+/gi, '_')}.cube`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleBatchItem = (id: string) => {
    setSelectedBatchIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBatchDownloadAll = () => {
    const targets = allLUTs.filter((l) => selectedBatchIds.includes(l.id));
    targets.forEach((lut, idx) => {
      const { params } = fitLUTToLightroomXMP(lut, {
        presetName: lut.title,
        presetGroup: batchGroup,
        lutIntensity: batchIntensity,
        skinToneProtection: batchSkinProtection,
        curvePointCount: xmpParams.curvePointCount,
      });
      const xml = generateLightroomXMP(params);
      const blob = new Blob([xml], { type: 'application/rdf+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${lut.title.replace(/[^a-z0-9-_]+/gi, '_')}.xmp`;
      setTimeout(() => {
        a.click();
        URL.revokeObjectURL(url);
      }, idx * 120);
    });
    setBatchExportCount((c) => c + targets.length);
  };

  if (mode === 'inspector') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 8 Columns: Live Adobe Camera Raw XMP XML Document */}
        <div className="lg:col-span-8 bg-[#11131C] border border-zinc-800/90 rounded-xl overflow-hidden flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#0D0F17] border-b border-zinc-800/90">
            <div className="flex items-center gap-2 text-xs">
              <FileCode2 className="w-4 h-4 text-amber-400" />
              <span className="font-semibold text-zinc-100">
                {xmpParams.presetName.replace(/[^a-z0-9-_]+/gi, '_')}.xmp
              </span>
              <span aria-hidden="true" className="text-zinc-600">
                ·
              </span>
              <span className="text-zinc-400 font-mono tabular-nums">
                crs:Version=&quot;15.4&quot; · ProcessVersion=&quot;11.0&quot;
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyXML}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {copiedXml ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied XML</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy XMP XML</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onTriggerSingleExport}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .XMP File</span>
              </button>
            </div>
          </div>

          <pre
            data-testid="xmp-xml-code"
            className="p-4 text-xs font-mono leading-relaxed text-zinc-300 bg-[#090A0F] overflow-x-auto max-h-[540px] overflow-y-auto"
          >
            {xmlString}
          </pre>
        </div>

        {/* Right 4 Columns: Preset Metadata & Adobe Lightroom Installation Steps */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="bg-[#11131C] border border-zinc-800/90 rounded-xl p-4 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-zinc-100">
              Converted XMP Diagnostic Summary
            </h3>
            <div className="divide-y divide-zinc-800/70 text-xs">
              <div className="py-2 flex items-center justify-between">
                <span className="text-zinc-400">Source 3D LUT</span>
                <span className="text-zinc-200 font-medium">{activeLUT.title}</span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-zinc-400">3D Mesh Resolution</span>
                <span className="text-zinc-200 font-mono tabular-nums">
                  {activeLUT.size}×{activeLUT.size}×{activeLUT.size} ({activeLUT.size ** 3} nodes)
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-zinc-400">Mean Approximation Error</span>
                <span className="text-emerald-400 font-mono tabular-nums font-medium">
                  ΔE {metrics.meanDeltaE.toFixed(2)} (Peak {metrics.maxDeltaE.toFixed(2)})
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-zinc-400">Tone Curve Control Nodes</span>
                <span className="text-zinc-200 font-mono tabular-nums">
                  {xmpParams.curvePointCount} pts × 4 channels
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-zinc-400">Lightroom Amount Slider</span>
                <span className="text-zinc-200">
                  {xmpParams.supportsAmount ? 'Enabled (crs:SupportsAmount="True")' : 'Fixed'}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-[#11131C] border border-zinc-800/90 rounded-xl p-4 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-zinc-100">
              How to Import into Adobe Lightroom
            </h3>
            <ol className="flex flex-col gap-2.5 text-xs text-zinc-300 leading-relaxed">
              <li>
                <span className="font-semibold text-amber-400">01. Lightroom Classic (v7.3+):</span>{' '}
                Open the <span className="text-zinc-100">Develop</span> module, click the{' '}
                <span className="text-zinc-100">+</span> icon in the Presets panel, choose{' '}
                <span className="text-zinc-100">Import Presets</span>, and select your exported{' '}
                <code className="text-amber-300">.xmp</code> file.
              </li>
              <li>
                <span className="font-semibold text-amber-400">02. Lightroom Desktop &amp; Cloud:</span>{' '}
                Go to <span className="text-zinc-100">File → Import Profiles &amp; Presets</span> and
                choose the downloaded <code className="text-amber-300">.xmp</code> preset.
              </li>
              <li>
                <span className="font-semibold text-amber-400">03. Adobe Camera Raw (Photoshop):</span>{' '}
                In the Presets tab, open the menu and select{' '}
                <span className="text-zinc-100">Import Profiles and Presets</span>, or drop the file into{' '}
                <code className="text-zinc-400">CameraRaw/Settings</code>.
              </li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  // Batch Converter View
  return (
    <div className="flex flex-col gap-6">
      <div className="bg-[#11131C] border border-zinc-800/90 rounded-xl p-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="batch-group-input" className="text-xs text-zinc-400">
              Target Lightroom Preset Group
            </label>
            <input
              id="batch-group-input"
              type="text"
              value={batchGroup}
              onChange={(e) => setBatchGroup(e.target.value)}
              className="bg-[#090A0F] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 w-56 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="batch-intensity-range" className="text-xs text-zinc-400">
              Global LUT Strength:{' '}
              <span className="font-mono tabular-nums text-zinc-200">{batchIntensity}%</span>
            </label>
            <input
              id="batch-intensity-range"
              type="range"
              min={10}
              max={150}
              value={batchIntensity}
              onChange={(e) => setBatchIntensity(Number(e.target.value))}
              className="w-40 accent-amber-500 cursor-pointer"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="batch-skin-range" className="text-xs text-zinc-400">
              Skin-Tone Protection:{' '}
              <span className="font-mono tabular-nums text-zinc-200">{batchSkinProtection}%</span>
            </label>
            <input
              id="batch-skin-range"
              type="range"
              min={0}
              max={100}
              value={batchSkinProtection}
              onChange={(e) => setBatchSkinProtection(Number(e.target.value))}
              className="w-40 accent-amber-500 cursor-pointer"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {batchExportCount > 0 && (
            <span className="text-xs text-emerald-400 font-mono tabular-nums">
              Exported {batchExportCount} .XMP files
            </span>
          )}
          <button
            type="button"
            onClick={handleBatchDownloadAll}
            disabled={selectedBatchIds.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Batch Export Selected ({selectedBatchIds.length}) .XMP</span>
          </button>
        </div>
      </div>

      {/* Batch LUT Matrix Table */}
      <div className="bg-[#11131C] border border-zinc-800/90 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#0D0F17] text-zinc-400 border-b border-zinc-800">
                <th className="py-3 px-4 font-medium">Include</th>
                <th className="py-3 px-4 font-medium">3D LUT Title &amp; Profile</th>
                <th className="py-3 px-4 font-medium text-right">Grid</th>
                <th className="py-3 px-4 font-medium text-right">Exposure</th>
                <th className="py-3 px-4 font-medium text-right">Contrast</th>
                <th className="py-3 px-4 font-medium text-right">Temp / Tint</th>
                <th className="py-3 px-4 font-medium text-right">Split Shadow / High</th>
                <th className="py-3 px-4 font-medium text-right">Mean ΔE</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {allLUTs.map((lut) => {
                const { params: fitted, metrics: m } = fitLUTToLightroomXMP(lut, {
                  presetName: lut.title,
                  presetGroup: batchGroup,
                  lutIntensity: batchIntensity,
                  skinToneProtection: batchSkinProtection,
                  curvePointCount: xmpParams.curvePointCount,
                });
                const isChecked = selectedBatchIds.includes(lut.id);

                return (
                  <tr key={lut.id} className="hover:bg-zinc-900/50 transition-colors">
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        aria-label={`Select ${lut.title} for batch export`}
                        checked={isChecked}
                        onChange={() => toggleBatchItem(lut.id)}
                        className="accent-amber-500 rounded cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-zinc-100">{lut.title}</div>
                      <div className="text-zinc-500 mt-0.5">
                        {lut.category ?? 'Custom 3D LUT'} · .{lut.format.toUpperCase()}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-300">
                      {lut.size}³
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-200">
                      {fitted.exposure > 0 ? `+${fitted.exposure.toFixed(2)}` : fitted.exposure.toFixed(2)} EV
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-200">
                      {fitted.contrast > 0 ? `+${fitted.contrast}` : fitted.contrast}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-300">
                      {fitted.temperature > 0 ? `+${fitted.temperature}` : fitted.temperature} /{' '}
                      {fitted.tint > 0 ? `+${fitted.tint}` : fitted.tint}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-300">
                      {fitted.shadowHue}° / {fitted.highlightHue}°
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-400">
                      {m.meanDeltaE.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectLUT(lut)}
                          className="px-2.5 py-1 text-xs font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors whitespace-nowrap"
                        >
                          Load in Studio
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadCubeSample(lut)}
                          className="px-2.5 py-1 text-xs font-medium text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded transition-colors whitespace-nowrap"
                        >
                          .CUBE
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
