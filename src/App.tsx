import React, { useEffect, useMemo, useState } from 'react';
import {
  LUT3D,
  LightroomXMPParams,
  SavedPresetSnapshot,
  createBuiltInCinemaLUTs,
  fitLUTToLightroomXMP,
  computeApproximationMetrics,
  generateLightroomXMP,
  parseCubeLUT,
  parse3dlLUT,
  serializeCubeLUT,
} from './utils/lutEngine';
import {
  GradingCanvasViewport,
  PreviewComparisonMode,
} from './components/GradingCanvasViewport';
import { ToneCurveEditor } from './components/ToneCurveEditor';
import { HSLAndColorWheelsPanel } from './components/HSLAndColorWheelsPanel';
import { XMPInspectorAndBatchView } from './components/XMPInspectorAndBatchView';
import {
  PWAInstallButtonAndModal,
  OfflineIndicator,
} from './components/DesktopInstallSection';
import {
  Upload,
  Download,
  RefreshCw,
  FileText,
  Sliders,
  Activity,
  Palette,
  AlertCircle,
  CheckCircle2,
  BookmarkPlus,
  Trash2,
} from 'lucide-react';

type MainWorkspaceTab = 'studio' | 'curves-hsl' | 'inspector' | 'batch';
type DevelopPanelTab = 'basic' | 'curves' | 'hsl-wheels' | 'calibration';

const STORAGE_SESSION_KEY = 'chromaxmp_session_v1';
const STORAGE_SNAPSHOTS_KEY = 'chromaxmp_saved_snapshots_v1';

export default function App() {
  const initialLUTs = useMemo(() => createBuiltInCinemaLUTs(), []);
  const [luts, setLuts] = useState<LUT3D[]>(initialLUTs);

  // Load persisted session from browser localStorage if available
  const savedSession = useMemo(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_SESSION_KEY);
      if (raw) {
        return JSON.parse(raw) as {
          activeLUTId?: string;
          xmpParams?: LightroomXMPParams;
          activeSceneId?: string;
        };
      }
    } catch {
      // Ignore storage access errors
    }
    return null;
  }, []);

  const [activeLUTId, setActiveLUTId] = useState<string>(
    savedSession?.activeLUTId ?? initialLUTs[0].id
  );

  const activeLUT = useMemo(
    () => luts.find((l) => l.id === activeLUTId) ?? luts[0],
    [luts, activeLUTId]
  );

  const [xmpParams, setXmpParams] = useState<LightroomXMPParams>(() => {
    if (savedSession?.xmpParams && savedSession.xmpParams.toneCurveRGB) {
      return savedSession.xmpParams;
    }
    return fitLUTToLightroomXMP(initialLUTs[0], {
      presetName: initialLUTs[0].title,
      presetGroup: 'ChromaXMP Cinema Grades',
      lutIntensity: 100,
      skinToneProtection: 35,
      curvePointCount: 9,
    }).params;
  });

  const [savedSnapshots, setSavedSnapshots] = useState<SavedPresetSnapshot[]>(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_SNAPSHOTS_KEY);
      if (raw) {
        return JSON.parse(raw) as SavedPresetSnapshot[];
      }
    } catch {
      // Ignore storage access errors
    }
    return [];
  });

  const [workspaceTab, setWorkspaceTab] = useState<MainWorkspaceTab>('studio');
  const [developTab, setDevelopTab] = useState<DevelopPanelTab>('basic');
  const [activeSceneId, setActiveSceneId] = useState<string>(
    savedSession?.activeSceneId ?? 'golden-portrait'
  );
  const [comparisonMode, setComparisonMode] =
    useState<PreviewComparisonMode>('xmp-vs-original');

  const [showRawCubeEditor, setShowRawCubeEditor] = useState<boolean>(false);
  const [rawCubeTitle, setRawCubeTitle] = useState<string>('');
  const [rawCubeInput, setRawCubeInput] = useState<string>('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [exportStatusBanner, setExportStatusBanner] = useState<string | null>(null);
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<string>('Auto-saved locally');

  // Auto-save active session to browser localStorage whenever parameters change
  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_SESSION_KEY,
        JSON.stringify({
          activeLUTId,
          xmpParams,
          activeSceneId,
        })
      );
      const now = new Date();
      setLastAutoSaveTime(
        `Auto-saved ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
      );
    } catch {
      // Ignore quota errors
    }
  }, [activeLUTId, xmpParams, activeSceneId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_SNAPSHOTS_KEY,
        JSON.stringify(savedSnapshots)
      );
    } catch {
      // Ignore quota errors
    }
  }, [savedSnapshots]);

  const metrics = useMemo(
    () => computeApproximationMetrics(activeLUT, xmpParams),
    [activeLUT, xmpParams]
  );

  const handleSelectLUT = (lut: LUT3D) => {
    setActiveLUTId(lut.id);
    const { params } = fitLUTToLightroomXMP(lut, {
      presetName: lut.title,
      presetGroup: xmpParams.presetGroup,
      lutIntensity: xmpParams.lutIntensity,
      skinToneProtection: xmpParams.skinToneProtection,
      curvePointCount: xmpParams.curvePointCount,
    });
    setXmpParams(params);
    setUploadError(null);
  };

  const handleRefitFromCurrentLUT = (
    overrideIntensity?: number,
    overrideSkinProtect?: number,
    overridePoints?: 5 | 9 | 17
  ) => {
    const { params } = fitLUTToLightroomXMP(activeLUT, {
      presetName: xmpParams.presetName,
      presetGroup: xmpParams.presetGroup,
      lutIntensity: overrideIntensity ?? xmpParams.lutIntensity,
      skinToneProtection: overrideSkinProtect ?? xmpParams.skinToneProtection,
      curvePointCount: overridePoints ?? xmpParams.curvePointCount,
    });
    setXmpParams(params);
  };

  const handleSaveSnapshotDraft = () => {
    const name = xmpParams.presetName.trim() || activeLUT.title;
    const snap: SavedPresetSnapshot = {
      id: `snap-${Date.now()}`,
      name,
      lutId: activeLUT.id,
      lutTitle: activeLUT.title,
      updatedAt: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      meanDeltaE: metrics.meanDeltaE,
      params: structuredClone(xmpParams),
    };
    setSavedSnapshots((prev) => [snap, ...prev]);
    setExportStatusBanner(`Saved snapshot "${name}" to browser local storage.`);
    setTimeout(() => setExportStatusBanner(null), 4000);
  };

  const handleLoadSnapshotDraft = (snap: SavedPresetSnapshot) => {
    if (luts.some((l) => l.id === snap.lutId)) {
      setActiveLUTId(snap.lutId);
    }
    setXmpParams(structuredClone(snap.params));
  };

  const handleDeleteSnapshotDraft = (id: string) => {
    setSavedSnapshots((prev) => prev.filter((s) => s.id !== id));
  };

  const handleLUTFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '');
        const cleanName = file.name.replace(/\.(cube|3dl)$/i, '');
        const is3dl = /\.3dl$/i.test(file.name);
        const parsed = is3dl
          ? parse3dlLUT(text, cleanName)
          : parseCubeLUT(text, cleanName);

        parsed.category = 'Imported User LUT';
        parsed.description = `Imported from ${file.name} (${parsed.size}×${parsed.size}×${parsed.size} 3D grid)`;

        setLuts((prev) => [parsed, ...prev.filter((item) => item.id !== parsed.id)]);
        handleSelectLUT(parsed);
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : 'Unable to parse LUT file.'
        );
      }
    };
    reader.readAsText(file);
  };

  const handleParseRawCubeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);
    if (!rawCubeInput.trim()) {
      setUploadError('Please paste valid .cube LUT text with LUT_3D_SIZE and RGB triplets.');
      return;
    }
    try {
      const parsed = parseCubeLUT(
        rawCubeInput,
        rawCubeTitle.trim() || 'Custom Pasted LUT'
      );
      parsed.category = 'Custom Pasted .CUBE';
      parsed.description = `Parsed directly from raw .cube specification (${parsed.size}³ mesh)`;
      setLuts((prev) => [parsed, ...prev.filter((item) => item.id !== parsed.id)]);
      handleSelectLUT(parsed);
      setShowRawCubeEditor(false);
      setRawCubeInput('');
      setRawCubeTitle('');
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Invalid .cube specification.'
      );
    }
  };

  const handleExportSingleXMP = () => {
    if (!xmpParams.presetName.trim()) {
      setUploadError('Preset Name is required before exporting an Adobe Lightroom .xmp file.');
      return;
    }
    setUploadError(null);
    const xml = generateLightroomXMP(xmpParams);
    const blob = new Blob([xml], { type: 'application/rdf+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const filename = `${xmpParams.presetName.trim().replace(/[^a-z0-9-_]+/gi, '_')}.xmp`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    setExportStatusBanner(
      `Exported ${filename} (Adobe Camera Raw ProcessVersion 11.0 · Mean ΔE ${metrics.meanDeltaE.toFixed(2)})`
    );
    setTimeout(() => setExportStatusBanner(null), 5000);
  };

  const loadSample2x2CubeIntoPasteBox = () => {
    setRawCubeTitle('Teal Warmth 2x2x2 Sample');
    setRawCubeInput(`TITLE "Teal Warmth 2x2x2 Sample"
LUT_3D_SIZE 2
DOMAIN_MIN 0.0 0.0 0.0
DOMAIN_MAX 1.0 1.0 1.0
0.020000 0.045000 0.075000
0.980000 0.080000 0.060000
0.040000 0.940000 0.090000
1.000000 0.960000 0.080000
0.030000 0.080000 0.920000
0.950000 0.120000 0.910000
0.080000 0.950000 0.940000
0.990000 0.970000 0.910000`);
    setUploadError(null);
  };

  return (
    <div className="min-h-screen bg-[#090A0F] text-zinc-100 flex flex-col">
      <OfflineIndicator />

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-[#0D0F17] border-b border-zinc-800/90 sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setWorkspaceTab('studio');
          }}
          className="text-lg font-bold tracking-tight text-zinc-100 whitespace-nowrap shrink-0"
        >
          ChromaXMP
        </a>

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav
          aria-label="Primary Workspace Views"
          className="flex items-center gap-6 text-sm font-medium text-zinc-400 overflow-x-auto"
        >
          <a
            href="#studio"
            onClick={(e) => {
              e.preventDefault();
              setWorkspaceTab('studio');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              workspaceTab === 'studio'
                ? 'text-zinc-100 border-amber-500'
                : 'border-transparent hover:text-zinc-200'
            }`}
          >
            Grading Studio
          </a>
          <a
            href="#curves-hsl"
            onClick={(e) => {
              e.preventDefault();
              setWorkspaceTab('curves-hsl');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              workspaceTab === 'curves-hsl'
                ? 'text-zinc-100 border-amber-500'
                : 'border-transparent hover:text-zinc-200'
            }`}
          >
            Curves &amp; HSL Matrix
          </a>
          <a
            href="#inspector"
            onClick={(e) => {
              e.preventDefault();
              setWorkspaceTab('inspector');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              workspaceTab === 'inspector'
                ? 'text-zinc-100 border-amber-500'
                : 'border-transparent hover:text-zinc-200'
            }`}
          >
            XMP Inspector
          </a>
          <a
            href="#batch"
            onClick={(e) => {
              e.preventDefault();
              setWorkspaceTab('batch');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              workspaceTab === 'batch'
                ? 'text-zinc-100 border-amber-500'
                : 'border-transparent hover:text-zinc-200'
            }`}
          >
            Batch Converter
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleExportSingleXMP}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export .XMP Preset</span>
          </button>
        </div>
      </header>

      {/* Feedback Banner for Export or Parse Errors */}
      {(uploadError || exportStatusBanner) && (
        <div className="px-6 pt-3 max-w-[1440px] w-full mx-auto">
          {uploadError && (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{uploadError}</span>
              </div>
              <button
                type="button"
                onClick={() => setUploadError(null)}
                className="text-rose-300 hover:text-white font-medium"
              >
                Dismiss
              </button>
            </div>
          )}
          {exportStatusBanner && (
            <div
              role="status"
              className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-xs text-emerald-200"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{exportStatusBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setExportStatusBanner(null)}
                className="text-emerald-300 hover:text-white font-medium"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Content Container (1440px max-width workstation) */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-5 flex flex-col gap-6">
        {/* Contextual Workstation Header Strip */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-800/80 pb-4">
          <div>
            <div className="text-xs text-zinc-400">
              3D Color Lookup Table (.CUBE / .3DL) → Adobe Camera Raw Develop Preset (.XMP)
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-100 mt-0.5">
              {activeLUT.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 mt-1">
              <span>{activeLUT.category ?? 'Cinema 3D LUT'}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {activeLUT.size}×{activeLUT.size}×{activeLUT.size} Mesh ({activeLUT.size ** 3}{' '}
                Triplets)
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-amber-400">
                Fitted XMP Error ΔE {metrics.meanDeltaE.toFixed(2)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-400 font-mono tabular-nums">
                {lastAutoSaveTime}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* In-App Standalone PC / PWA Installation Button & Modal */}
            <PWAInstallButtonAndModal />

            <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-zinc-200 bg-[#11131C] hover:bg-zinc-800 border border-zinc-800 rounded-lg cursor-pointer transition-colors whitespace-nowrap shrink-0">
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              <span>Import .CUBE / .3DL File</span>
              <input
                type="file"
                accept=".cube,.3dl,text/plain"
                onChange={handleLUTFileUpload}
                className="sr-only"
                aria-label="Import .CUBE or .3DL LUT File"
              />
            </label>

            <button
              type="button"
              onClick={() => setShowRawCubeEditor((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-300 bg-[#11131C] hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              <span>{showRawCubeEditor ? 'Close Raw .CUBE Parser' : 'Paste Raw .CUBE Text'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleRefitFromCurrentLUT()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-300 bg-[#11131C] hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
              <span>Re-Solve XMP from LUT</span>
            </button>
          </div>
        </div>

        {/* Optional Collapsible Raw .CUBE Text Parser Form */}
        {showRawCubeEditor && (
          <form
            onSubmit={handleParseRawCubeSubmit}
            className="bg-[#11131C] border border-zinc-800 rounded-xl p-4 flex flex-col gap-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-zinc-100">
                Parse Raw Adobe .CUBE 3D LUT Specification
              </h2>
              <button
                type="button"
                onClick={loadSample2x2CubeIntoPasteBox}
                className="text-xs text-amber-400 hover:text-amber-300 underline"
              >
                Load Sample 2×2×2 .CUBE Data
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="raw-cube-title" className="text-xs text-zinc-400">
                  LUT Preset Name
                </label>
                <input
                  id="raw-cube-title"
                  type="text"
                  placeholder="e.g. Kodak 5219 Emulation"
                  value={rawCubeTitle}
                  onChange={(e) => setRawCubeTitle(e.target.value)}
                  className="bg-[#090A0F] border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="md:col-span-2 flex flex-col gap-1">
                <label htmlFor="raw-cube-textarea" className="text-xs text-zinc-400">
                  Raw .CUBE Body (LUT_3D_SIZE N followed by N³ normalized RGB triplets)
                </label>
                <textarea
                  id="raw-cube-textarea"
                  rows={4}
                  value={rawCubeInput}
                  onChange={(e) => setRawCubeInput(e.target.value)}
                  placeholder={'TITLE "Custom"\nLUT_3D_SIZE 2\n0.0 0.0 0.0\n1.0 0.0 0.0 ...'}
                  className="bg-[#090A0F] border border-zinc-800 rounded-lg p-2.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRawCubeEditor(false)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors"
              >
                Parse &amp; Fit Lightroom XMP
              </button>
            </div>
          </form>
        )}

        {/* Workspace View Switcher */}
        {workspaceTab === 'studio' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column (3 cols): 3D LUT Source Library, Solver & Saved Snapshots */}
            <aside className="lg:col-span-3 flex flex-col gap-4">
              {/* LUT Library List */}
              <div className="bg-[#11131C] border border-zinc-800/90 rounded-xl p-3.5 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-zinc-200">
                    3D LUT Library ({luts.length})
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      const content = serializeCubeLUT(activeLUT);
                      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${activeLUT.title.replace(/[^a-z0-9-_]+/gi, '_')}.cube`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="text-xs text-amber-400 hover:text-amber-300"
                  >
                    Save .CUBE
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  {luts.map((lut) => {
                    const isSelected = lut.id === activeLUT.id;
                    return (
                      <button
                        key={lut.id}
                        type="button"
                        onClick={() => handleSelectLUT(lut)}
                        className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                          isSelected
                            ? 'bg-amber-500/10 border-amber-500/60 text-zinc-100'
                            : 'bg-[#090A0F] border-zinc-800/80 text-zinc-300 hover:border-zinc-700'
                        }`}
                      >
                        <div className="text-xs font-semibold truncate">{lut.title}</div>
                        <div className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1.5">
                          <span className="truncate">{lut.category ?? 'Custom Grade'}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums shrink-0">{lut.size}³</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* XMP Conversion Solver & Preset Metadata */}
              <div className="bg-[#11131C] border border-zinc-800/90 rounded-xl p-3.5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-zinc-200">
                    XMP Preset Target &amp; Solver
                  </h2>
                  <button
                    type="button"
                    onClick={handleSaveSnapshotDraft}
                    className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    <span>Save Draft</span>
                  </button>
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="xmp-preset-name" className="text-xs text-zinc-400">
                    Lightroom Preset Name (crs:Name)
                  </label>
                  <input
                    id="xmp-preset-name"
                    type="text"
                    value={xmpParams.presetName}
                    onChange={(e) =>
                      setXmpParams((prev) => ({ ...prev, presetName: e.target.value }))
                    }
                    className="bg-[#090A0F] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="xmp-preset-group" className="text-xs text-zinc-400">
                    Lightroom Preset Group (crs:Group)
                  </label>
                  <input
                    id="xmp-preset-group"
                    type="text"
                    value={xmpParams.presetGroup}
                    onChange={(e) =>
                      setXmpParams((prev) => ({ ...prev, presetGroup: e.target.value }))
                    }
                    className="bg-[#090A0F] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex flex-col gap-1 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="lut-intensity-slider" className="text-zinc-400">
                      LUT Conversion Strength
                    </label>
                    <span className="font-mono tabular-nums text-amber-400">
                      {xmpParams.lutIntensity}%
                    </span>
                  </div>
                  <input
                    id="lut-intensity-slider"
                    type="range"
                    min={0}
                    max={150}
                    value={xmpParams.lutIntensity}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      handleRefitFromCurrentLUT(val, undefined, undefined);
                    }}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="skin-protection-slider" className="text-zinc-400">
                      Skin-Tone Orange/Red Guard
                    </label>
                    <span className="font-mono tabular-nums text-zinc-200">
                      {xmpParams.skinToneProtection}%
                    </span>
                  </div>
                  <input
                    id="skin-protection-slider"
                    type="range"
                    min={0}
                    max={100}
                    value={xmpParams.skinToneProtection}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      handleRefitFromCurrentLUT(undefined, val, undefined);
                    }}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-zinc-300 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={xmpParams.supportsAmount}
                    onChange={(e) =>
                      setXmpParams((prev) => ({
                        ...prev,
                        supportsAmount: e.target.checked,
                      }))
                    }
                    className="accent-amber-500 rounded"
                  />
                  <span>Enable Lightroom Amount Slider</span>
                </label>

                {/* Saved Browser LocalStorage Draft Snapshots */}
                {savedSnapshots.length > 0 && (
                  <div className="pt-2.5 border-t border-zinc-800/80 flex flex-col gap-2">
                    <div className="text-xs font-medium text-zinc-300">
                      Saved Local Drafts ({savedSnapshots.length})
                    </div>
                    <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                      {savedSnapshots.map((snap) => (
                        <div
                          key={snap.id}
                          className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#090A0F] border border-zinc-800/80 text-xs"
                        >
                          <button
                            type="button"
                            onClick={() => handleLoadSnapshotDraft(snap)}
                            className="text-left flex-1 min-w-0 hover:text-amber-300 transition-colors"
                          >
                            <div className="font-medium text-zinc-200 truncate">
                              {snap.name}
                            </div>
                            <div className="text-zinc-500 font-mono tabular-nums">
                              {snap.updatedAt} · ΔE {snap.meanDeltaE.toFixed(2)}
                            </div>
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete saved draft ${snap.name}`}
                            onClick={() => handleDeleteSnapshotDraft(snap.id)}
                            className="p-1 text-zinc-500 hover:text-rose-400 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </aside>

            {/* Center Column (5 cols): Interactive Split-Screen Color Grading Viewport */}
            <section className="lg:col-span-5">
              <GradingCanvasViewport
                activeLUT={activeLUT}
                xmpParams={xmpParams}
                metrics={metrics}
                activeSceneId={activeSceneId}
                onSelectScene={setActiveSceneId}
                comparisonMode={comparisonMode}
                onChangeComparisonMode={setComparisonMode}
              />
            </section>

            {/* Right Column (4 cols): Adobe Lightroom Develop XMP Parameter Rack */}
            <aside className="lg:col-span-4 bg-[#11131C] border border-zinc-800/90 rounded-xl p-4 flex flex-col gap-4">
              {/* Develop Module Sub-Tabs */}
              <div
                className="grid grid-cols-4 gap-1 bg-[#090A0F] p-1 rounded-lg border border-zinc-800"
                role="tablist"
                aria-label="Lightroom Develop Parameter Panels"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={developTab === 'basic'}
                  onClick={() => setDevelopTab('basic')}
                  className={`flex items-center justify-center gap-1 py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    developTab === 'basic'
                      ? 'bg-amber-500 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Sliders className="w-3 h-3 shrink-0" />
                  <span>Basic</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={developTab === 'curves'}
                  onClick={() => setDevelopTab('curves')}
                  className={`flex items-center justify-center gap-1 py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    developTab === 'curves'
                      ? 'bg-amber-500 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Activity className="w-3 h-3 shrink-0" />
                  <span>Curves</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={developTab === 'hsl-wheels'}
                  onClick={() => setDevelopTab('hsl-wheels')}
                  className={`flex items-center justify-center gap-1 py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    developTab === 'hsl-wheels'
                      ? 'bg-amber-500 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Palette className="w-3 h-3 shrink-0" />
                  <span>HSL / Split</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={developTab === 'calibration'}
                  onClick={() => setDevelopTab('calibration')}
                  className={`flex items-center justify-center gap-1 py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    developTab === 'calibration'
                      ? 'bg-amber-500 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span>Calibrate</span>
                </button>
              </div>

              {/* Panel 1: Basic Tone & White Balance */}
              {developTab === 'basic' && (
                <div className="flex flex-col gap-3">
                  <div className="bg-[#090A0F] border border-zinc-800/90 rounded-xl p-3.5 flex flex-col gap-2.5">
                    <div className="text-xs font-semibold text-zinc-200">
                      White Balance &amp; Global Presence
                    </div>
                    {(
                      [
                        {
                          key: 'temperature',
                          label: 'Temp (crs:IncrementalTemperature)',
                          min: -100,
                          max: 100,
                          step: 1,
                        },
                        {
                          key: 'tint',
                          label: 'Tint (crs:IncrementalTint)',
                          min: -100,
                          max: 100,
                          step: 1,
                        },
                        {
                          key: 'vibrance',
                          label: 'Vibrance (crs:Vibrance)',
                          min: -100,
                          max: 100,
                          step: 1,
                        },
                        {
                          key: 'saturation',
                          label: 'Saturation (crs:Saturation)',
                          min: -100,
                          max: 100,
                          step: 1,
                        },
                      ] as const
                    ).map((s) => (
                      <div key={s.key} className="flex flex-col gap-1 text-xs">
                        <div className="flex items-center justify-between">
                          <label htmlFor={`basic-${s.key}`} className="text-zinc-400">
                            {s.label}
                          </label>
                          <span className="font-mono tabular-nums text-zinc-200">
                            {xmpParams[s.key] > 0 ? `+${xmpParams[s.key]}` : xmpParams[s.key]}
                          </span>
                        </div>
                        <input
                          id={`basic-${s.key}`}
                          type="range"
                          min={s.min}
                          max={s.max}
                          step={s.step}
                          value={xmpParams[s.key]}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setXmpParams((prev) => ({ ...prev, [s.key]: val }));
                          }}
                          className="w-full accent-amber-500 cursor-pointer"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="bg-[#090A0F] border border-zinc-800/90 rounded-xl p-3.5 flex flex-col gap-2.5">
                    <div className="text-xs font-semibold text-zinc-200">
                      Tone &amp; Dynamic Range (ProcessVersion 11.0)
                    </div>
                    {(
                      [
                        {
                          key: 'exposure',
                          label: 'Exposure (EV)',
                          min: -4,
                          max: 4,
                          step: 0.05,
                        },
                        {
                          key: 'contrast',
                          label: 'Contrast',
                          min: -100,
                          max: 100,
                          step: 1,
                        },
                        {
                          key: 'highlights',
                          label: 'Highlights',
                          min: -100,
                          max: 100,
                          step: 1,
                        },
                        {
                          key: 'shadows',
                          label: 'Shadows',
                          min: -100,
                          max: 100,
                          step: 1,
                        },
                        {
                          key: 'whites',
                          label: 'Whites',
                          min: -100,
                          max: 100,
                          step: 1,
                        },
                        {
                          key: 'blacks',
                          label: 'Blacks',
                          min: -100,
                          max: 100,
                          step: 1,
                        },
                        {
                          key: 'clarity',
                          label: 'Clarity',
                          min: -100,
                          max: 100,
                          step: 1,
                        },
                        {
                          key: 'dehaze',
                          label: 'Dehaze',
                          min: -100,
                          max: 100,
                          step: 1,
                        },
                      ] as const
                    ).map((s) => (
                      <div key={s.key} className="grid grid-cols-12 items-center gap-2 text-xs">
                        <label htmlFor={`tone-${s.key}`} className="col-span-4 text-zinc-400">
                          {s.label}
                        </label>
                        <input
                          id={`tone-${s.key}`}
                          type="range"
                          min={s.min}
                          max={s.max}
                          step={s.step}
                          value={xmpParams[s.key]}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setXmpParams((prev) => ({ ...prev, [s.key]: val }));
                          }}
                          className="col-span-6 accent-amber-500 cursor-pointer"
                        />
                        <span className="col-span-2 text-right font-mono tabular-nums text-zinc-200">
                          {s.key === 'exposure'
                            ? xmpParams.exposure > 0
                              ? `+${xmpParams.exposure.toFixed(2)}`
                              : xmpParams.exposure.toFixed(2)
                            : xmpParams[s.key] > 0
                            ? `+${xmpParams[s.key]}`
                            : xmpParams[s.key]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Panel 2: Tone Curves */}
              {developTab === 'curves' && (
                <ToneCurveEditor
                  params={xmpParams}
                  onUpdateParams={setXmpParams}
                  onChangePointDensity={(cnt) =>
                    handleRefitFromCurrentLUT(undefined, undefined, cnt)
                  }
                />
              )}

              {/* Panel 3: 8-Channel HSL & 3-Way Color Grading */}
              {developTab === 'hsl-wheels' && (
                <HSLAndColorWheelsPanel
                  params={xmpParams}
                  onUpdateParams={setXmpParams}
                />
              )}

              {/* Panel 4: Camera Calibration & Effects */}
              {developTab === 'calibration' && (
                <div className="flex flex-col gap-3">
                  <div className="bg-[#090A0F] border border-zinc-800/90 rounded-xl p-3.5 flex flex-col gap-2.5">
                    <div className="text-xs font-semibold text-zinc-200">
                      ACR Camera Calibration Primaries
                    </div>
                    {(
                      [
                        { key: 'shadowTint', label: 'Shadow Tint' },
                        { key: 'redPrimaryHue', label: 'Red Primary Hue' },
                        { key: 'redPrimarySat', label: 'Red Primary Saturation' },
                        { key: 'greenPrimaryHue', label: 'Green Primary Hue' },
                        { key: 'greenPrimarySat', label: 'Green Primary Saturation' },
                        { key: 'bluePrimaryHue', label: 'Blue Primary Hue' },
                        { key: 'bluePrimarySat', label: 'Blue Primary Saturation' },
                      ] as const
                    ).map((item) => (
                      <div
                        key={item.key}
                        className="grid grid-cols-12 items-center gap-2 text-xs"
                      >
                        <label
                          htmlFor={`cal-${item.key}`}
                          className="col-span-5 text-zinc-400"
                        >
                          {item.label}
                        </label>
                        <input
                          id={`cal-${item.key}`}
                          type="range"
                          min={-100}
                          max={100}
                          value={xmpParams[item.key]}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setXmpParams((prev) => ({ ...prev, [item.key]: val }));
                          }}
                          className="col-span-5 accent-amber-500 cursor-pointer"
                        />
                        <span className="col-span-2 text-right font-mono tabular-nums text-zinc-200">
                          {xmpParams[item.key] > 0
                            ? `+${xmpParams[item.key]}`
                            : xmpParams[item.key]}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="bg-[#090A0F] border border-zinc-800/90 rounded-xl p-3.5 flex flex-col gap-2.5">
                    <div className="text-xs font-semibold text-zinc-200">
                      Film Grain &amp; Optical Vignette
                    </div>
                    <div className="grid grid-cols-12 items-center gap-2 text-xs">
                      <label htmlFor="fx-grain" className="col-span-5 text-zinc-400">
                        Grain Amount
                      </label>
                      <input
                        id="fx-grain"
                        type="range"
                        min={0}
                        max={100}
                        value={xmpParams.grainAmount}
                        onChange={(e) =>
                          setXmpParams((prev) => ({
                            ...prev,
                            grainAmount: Number(e.target.value),
                          }))
                        }
                        className="col-span-5 accent-amber-500 cursor-pointer"
                      />
                      <span className="col-span-2 text-right font-mono tabular-nums text-zinc-200">
                        {xmpParams.grainAmount}
                      </span>
                    </div>

                    <div className="grid grid-cols-12 items-center gap-2 text-xs">
                      <label htmlFor="fx-vignette" className="col-span-5 text-zinc-400">
                        Post-Crop Vignette
                      </label>
                      <input
                        id="fx-vignette"
                        type="range"
                        min={-100}
                        max={100}
                        value={xmpParams.postCropVignette}
                        onChange={(e) =>
                          setXmpParams((prev) => ({
                            ...prev,
                            postCropVignette: Number(e.target.value),
                          }))
                        }
                        className="col-span-5 accent-amber-500 cursor-pointer"
                      />
                      <span className="col-span-2 text-right font-mono tabular-nums text-zinc-200">
                        {xmpParams.postCropVignette > 0
                          ? `+${xmpParams.postCropVignette}`
                          : xmpParams.postCropVignette}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </aside>
          </div>
        )}

        {/* Dedicated Full-Width Curves & HSL Matrix Tab */}
        {workspaceTab === 'curves-hsl' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-[#11131C] border border-zinc-800/90 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-zinc-100 mb-3">
                4-Channel RGB Tone Curve Extraction (ToneCurvePV2012)
              </h2>
              <ToneCurveEditor
                params={xmpParams}
                onUpdateParams={setXmpParams}
                onChangePointDensity={(cnt) =>
                  handleRefitFromCurrentLUT(undefined, undefined, cnt)
                }
              />
            </div>

            <div className="lg:col-span-7 bg-[#11131C] border border-zinc-800/90 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-zinc-100 mb-3">
                8-Band Adobe Camera Raw HSL Mixer &amp; 3-Way Split Toning
              </h2>
              <HSLAndColorWheelsPanel
                params={xmpParams}
                onUpdateParams={setXmpParams}
              />
            </div>
          </div>
        )}

        {/* Dedicated Full-Width XMP Code Inspector Tab */}
        {workspaceTab === 'inspector' && (
          <XMPInspectorAndBatchView
            mode="inspector"
            activeLUT={activeLUT}
            allLUTs={luts}
            xmpParams={xmpParams}
            metrics={metrics}
            onSelectLUT={(lut) => {
              handleSelectLUT(lut);
              setWorkspaceTab('studio');
            }}
            onTriggerSingleExport={handleExportSingleXMP}
          />
        )}

        {/* Dedicated Full-Width Batch LUT Converter Tab */}
        {workspaceTab === 'batch' && (
          <XMPInspectorAndBatchView
            mode="batch"
            activeLUT={activeLUT}
            allLUTs={luts}
            xmpParams={xmpParams}
            metrics={metrics}
            onSelectLUT={(lut) => {
              handleSelectLUT(lut);
              setWorkspaceTab('studio');
            }}
            onTriggerSingleExport={handleExportSingleXMP}
          />
        )}
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="mt-auto border-t border-zinc-900 bg-[#07080C] px-6 py-4">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-500">
          <span>
            ChromaXMP · Standalone Installable PWA &amp; 3D LUT (.CUBE / .3DL) to Adobe Lightroom
            (.XMP) Workstation
          </span>
          <span>
            Compatible with Lightroom Classic v7.3+, Lightroom Desktop, and Adobe Camera Raw v10.3+
          </span>
        </div>
      </footer>
    </div>
  );
}
