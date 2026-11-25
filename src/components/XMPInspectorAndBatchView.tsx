import React, { useEffect, useState } from 'react';
import {
  LUT3D,
  LightroomXMPParams,
  LUTAnalysisMetrics,
  InstallerPlatform,
  generateLightroomXMP,
  fitLUTToLightroomXMP,
  serializeCubeLUT,
  generateLightroomInstallerScript,
} from '../utils/lutEngine';
import {
  Copy,
  Check,
  Download,
  FileCode2,
  Layers,
  Terminal,
  Upload,
} from 'lucide-react';

interface XMPInspectorAndBatchViewProps {
  mode: 'inspector' | 'batch';
  activeLUT: LUT3D;
  allLUTs: LUT3D[];
  xmpParams: LightroomXMPParams;
  metrics: LUTAnalysisMetrics;
  onSelectLUT: (lut: LUT3D) => void;
  onTriggerSingleExport: () => void;
  onUploadLUTFiles?: (files: FileList | null) => void;
}

export const XMPInspectorAndBatchView: React.FC<XMPInspectorAndBatchViewProps> = ({
  mode,
  activeLUT,
  allLUTs,
  xmpParams,
  metrics,
  onSelectLUT,
  onTriggerSingleExport,
  onUploadLUTFiles,
}) => {
  const [copiedXml, setCopiedXml] = useState(false);
  const [inspectorViewMode, setInspectorViewMode] = useState<'xmp-xml' | 'installer-script'>('xmp-xml');
  const [installerPlatform, setInstallerPlatform] = useState<InstallerPlatform>('windows-ps1');
  const [batchGroup, setBatchGroup] = useState(xmpParams.presetGroup);
  const [batchIntensity, setBatchIntensity] = useState(xmpParams.lutIntensity);
  const [batchSkinProtection, setBatchSkinProtection] = useState(
    xmpParams.skinToneProtection
  );
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>(() =>
    allLUTs.map((l) => l.id)
  );
  const [batchExportCount, setBatchExportCount] = useState<number>(0);

  // Automatically include newly uploaded 2nd/3rd/Nth LUTs in selectedBatchIds
  useEffect(() => {
    setSelectedBatchIds((prev) => {
      const next = new Set(prev);
      for (const lut of allLUTs) {
        if (lut.category?.includes('Imported') || lut.category?.includes('Custom')) {
          next.add(lut.id);
        }
      }
      return Array.from(next);
    });
  }, [allLUTs]);

  const xmlString = generateLightroomXMP(xmpParams);
  const singleInstaller = generateLightroomInstallerScript([xmpParams], installerPlatform);

  const handleCopyCode = async () => {
    const textToCopy =
      inspectorViewMode === 'xmp-xml' ? xmlString : singleInstaller.content;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedXml(true);
      setTimeout(() => setCopiedXml(false), 2000);
    } catch {
      setCopiedXml(true);
      setTimeout(() => setCopiedXml(false), 2000);
    }
  };

  const handleDownloadSingleInstaller = (platform: InstallerPlatform) => {
    const script = generateLightroomInstallerScript([xmpParams], platform);
    const blob = new Blob([script.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = script.filename;
    a.click();
    URL.revokeObjectURL(url);
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

  const handleDownloadSpecificLUTAsXMP = (lut: LUT3D) => {
    const { params } = fitLUTToLightroomXMP(lut, {
      presetName: lut.title,
      presetGroup: batchGroup || xmpParams.presetGroup,
      lutIntensity: batchIntensity,
      skinToneProtection: batchSkinProtection,
      curvePointCount: xmpParams.curvePointCount,
    });
    const xml = generateLightroomXMP(params);
    const blob = new Blob([xml], { type: 'application/rdf+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${params.presetName.replace(/[^a-z0-9-_]+/gi, '_')}.xmp`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleBatchItem = (id: string) => {
    setSelectedBatchIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const getBatchFittedPresets = (): LightroomXMPParams[] => {
    const targets = allLUTs.filter((l) => selectedBatchIds.includes(l.id));
    return targets.map(
      (lut) =>
        fitLUTToLightroomXMP(lut, {
          presetName: lut.title,
          presetGroup: batchGroup,
          lutIntensity: batchIntensity,
          skinToneProtection: batchSkinProtection,
          curvePointCount: xmpParams.curvePointCount,
        }).params
    );
  };

  const handleBatchDownloadAll = () => {
    const fittedPresets = getBatchFittedPresets();
    fittedPresets.forEach((params, idx) => {
      const xml = generateLightroomXMP(params);
      const blob = new Blob([xml], { type: 'application/rdf+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${params.presetName.replace(/[^a-z0-9-_]+/gi, '_')}.xmp`;
      setTimeout(() => {
        a.click();
        URL.revokeObjectURL(url);
      }, idx * 120);
    });
    setBatchExportCount((c) => c + fittedPresets.length);
  };

  const handleBatchDownloadInstallerScript = (platform: InstallerPlatform) => {
    const fittedPresets = getBatchFittedPresets();
    if (!fittedPresets.length) return;
    const script = generateLightroomInstallerScript(fittedPresets, platform);
    const blob = new Blob([script.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = script.filename;
    a.click();
    URL.revokeObjectURL(url);
    setBatchExportCount((c) => c + fittedPresets.length);
  };

  if (mode === 'inspector') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 8 Columns: Live Adobe Camera Raw XMP XML Document or Auto-Installer Script */}
        <div className="lg:col-span-8 bg-[#11131C] border border-zinc-800/90 rounded-xl overflow-hidden flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-[#0D0F17] border-b border-zinc-800/90">
            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-1 bg-[#090A0F] p-1 rounded-lg border border-zinc-800"
                role="group"
                aria-label="Code View Mode"
              >
                <button
                  type="button"
                  onClick={() => setInspectorViewMode('xmp-xml')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    inspectorViewMode === 'xmp-xml'
                      ? 'bg-amber-500 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <FileCode2 className="w-3.5 h-3.5" />
                  <span>Adobe .XMP XML</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorViewMode('installer-script')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    inspectorViewMode === 'installer-script'
                      ? 'bg-amber-500 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Lightroom Installer Script</span>
                </button>
              </div>

              {inspectorViewMode === 'installer-script' && (
                <select
                  aria-label="Select Installer OS Platform"
                  value={installerPlatform}
                  onChange={(e) =>
                    setInstallerPlatform(e.target.value as InstallerPlatform)
                  }
                  className="bg-[#090A0F] border border-zinc-800 text-zinc-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-500"
                >
                  <option value="windows-ps1">Windows PowerShell (.ps1)</option>
                  <option value="macos-command">macOS Terminal (.command)</option>
                </select>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyCode}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {copiedXml ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>
                      {inspectorViewMode === 'xmp-xml'
                        ? 'Copy XMP XML'
                        : 'Copy Installer Script'}
                    </span>
                  </>
                )}
              </button>

              {inspectorViewMode === 'xmp-xml' ? (
                <button
                  type="button"
                  onClick={onTriggerSingleExport}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .XMP File</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleDownloadSingleInstaller(installerPlatform)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Download Installer Script</span>
                </button>
              )}
            </div>
          </div>

          <pre
            data-testid="xmp-xml-code"
            className="p-4 text-xs font-mono leading-relaxed text-zinc-300 bg-[#090A0F] overflow-x-auto max-h-[540px] overflow-y-auto"
          >
            {inspectorViewMode === 'xmp-xml' ? xmlString : singleInstaller.content}
          </pre>
        </div>

        {/* Right 4 Columns: Auto-Installer Quick Download & Diagnostic Summary */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="bg-[#11131C] border border-zinc-800/90 rounded-xl p-4 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-zinc-100">
              1-Click Lightroom Auto-Installer Script
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Generate a self-contained installer script that embeds this preset and
              automatically writes it into your Adobe Lightroom &amp; Camera Raw{' '}
              <code className="text-zinc-300">Settings/{xmpParams.presetGroup}</code> folder.
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleDownloadSingleInstaller('windows-ps1')}
                className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Download Windows Installer (.PS1)</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadSingleInstaller('macos-command')}
                className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors"
              >
                <Terminal className="w-3.5 h-3.5 text-amber-400" />
                <span>Download macOS Installer (.COMMAND)</span>
              </button>
            </div>
          </div>

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
              className="w-36 accent-amber-500 cursor-pointer"
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
              className="w-36 accent-amber-500 cursor-pointer"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {batchExportCount > 0 && (
            <span className="text-xs text-emerald-400 font-mono tabular-nums">
              Generated {batchExportCount} presets
            </span>
          )}
          {onUploadLUTFiles && (
            <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] hover:brightness-110 border border-[#A78BFA]/40 rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Import LUT(s)</span>
              <input
                type="file"
                multiple
                accept=".cube,.3dl,.look,.lut,text/plain"
                onChange={(e) => {
                  onUploadLUTFiles(e.target.files);
                  e.target.value = '';
                }}
                className="sr-only"
              />
            </label>
          )}
          <button
            type="button"
            onClick={() => handleBatchDownloadInstallerScript('windows-ps1')}
            disabled={selectedBatchIds.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-100 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Terminal className="w-3.5 h-3.5 text-amber-400" />
            <span>Windows Installer (.PS1)</span>
          </button>

          <button
            type="button"
            onClick={() => handleBatchDownloadInstallerScript('macos-command')}
            disabled={selectedBatchIds.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-100 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Terminal className="w-3.5 h-3.5 text-amber-400" />
            <span>macOS Installer (.COMMAND)</span>
          </button>

          <button
            type="button"
            onClick={handleBatchDownloadAll}
            disabled={selectedBatchIds.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Batch Export ({selectedBatchIds.length}) .XMP</span>
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
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleDownloadSpecificLUTAsXMP(lut)}
                          className="px-2.5 py-1 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Export .XMP
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectLUT(lut)}
                          className="px-2.5 py-1 text-xs font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Load in Studio
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadCubeSample(lut)}
                          className="px-2.5 py-1 text-xs font-medium text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded transition-colors whitespace-nowrap cursor-pointer"
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
