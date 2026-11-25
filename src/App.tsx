import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  bakeXMPParamsTo3DLUT,
  parseLightroomXMPString,
  generateLightroomInstallerScript,
} from './utils/lutEngine';
import {
  generateLUTThumbnailDataURL,
} from './utils/referenceScenes';
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
  Activity,
  AlertCircle,
  CheckCircle2,
  BookmarkPlus,
  Trash2,
  Folder,
  Plus,
  Box,
  Search,
  Star,
  ChevronDown,
  Wand2,
  ArrowLeftRight,
  Layers,
  Settings2,
  Moon,
  Sun,
  Check,
  Maximize2,
  Terminal,
} from 'lucide-react';

type MainWorkspaceTab =
  | 'studio'
  | 'lut-to-xmp'
  | 'xmp-to-lut'
  | 'batch'
  | 'curves-hsl'
  | 'presets'
  | 'inspector';

type DevelopPanelTab =
  | 'basic'
  | 'curves'
  | 'hsl'
  | 'color'
  | 'effects'
  | 'calibration';

type FilmstripTab = 'applied-lut' | 'looks-presets' | 'history';

const STORAGE_SESSION_KEY = 'cinelut_studio_session_v2';
const STORAGE_SNAPSHOTS_KEY = 'cinelut_saved_snapshots_v2';

const FILMSTRIP_SHORT_NAMES: Record<string, string> = {
  'kodak-2383-print': 'Kodak Vision3 2383 Print',
  'arri-logc-rec709-warm': 'Arri LogC to 709',
  'fuji-eterna-250d': 'Fuji Eterna 250D',
  'blockbuster-teal-orange': 'Teal & Orange Cine',
  'kodak-portra-400': 'Portra 400',
  'golden-hour-glow': 'Golden Hour',
  'cinema-contrast-punch': 'Cinema Contrast',
  'bw-film-400': 'BW Film 400',
};

function applyKodak2383SignatureDefaults(params: LightroomXMPParams): LightroomXMPParams {
  return {
    ...params,
    temperature: 4,
    tint: -1,
    vibrance: 13,
    saturation: 7,
    exposure: 0.08,
    contrast: 18,
    highlights: -8,
    shadows: -9,
    whites: -5,
    blacks: 4,
  };
}

export default function App() {
  const initialLUTs = useMemo(() => createBuiltInCinemaLUTs(), []);
  const [luts, setLuts] = useState<LUT3D[]>(initialLUTs);
  const [favoriteLutIds, setFavoriteLutIds] = useState<string[]>([
    'kodak-2383-print',
  ]);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const lutInputRef = useRef<HTMLInputElement | null>(null);

  const [customPhotoData, setCustomPhotoData] = useState<ImageData | null>(null);
  const [customPhotoName, setCustomPhotoName] = useState<string | null>(null);

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
      // Ignore storage errors
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
    const fitted = fitLUTToLightroomXMP(initialLUTs[0], {
      presetName: initialLUTs[0].title,
      presetGroup: 'CineLUT Studio Grades',
      lutIntensity: 100,
      skinToneProtection: 35,
      curvePointCount: 9,
    }).params;
    return applyKodak2383SignatureDefaults(fitted);
  });

  // Undo / Redo parameter stack
  const [historyStack, setHistoryStack] = useState<LightroomXMPParams[]>([]);
  const [redoStack, setRedoStack] = useState<LightroomXMPParams[]>([]);

  const updateXmpParamsWithHistory = (
    updater: LightroomXMPParams | ((prev: LightroomXMPParams) => LightroomXMPParams)
  ) => {
    setXmpParams((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setHistoryStack((h) => [prev, ...h.slice(0, 19)]);
      setRedoStack([]);
      return next;
    });
  };

  const handleUndo = () => {
    if (historyStack.length === 0) return;
    const [previous, ...rest] = historyStack;
    setRedoStack((r) => [xmpParams, ...r]);
    setHistoryStack(rest);
    setXmpParams(previous);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const [nextState, ...rest] = redoStack;
    setHistoryStack((h) => [xmpParams, ...h]);
    setRedoStack(rest);
    setXmpParams(nextState);
  };

  const [savedSnapshots, setSavedSnapshots] = useState<SavedPresetSnapshot[]>(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_SNAPSHOTS_KEY);
      if (raw) {
        return JSON.parse(raw) as SavedPresetSnapshot[];
      }
    } catch {
      // Ignore storage errors
    }
    return [];
  });

  const [workspaceTab, setWorkspaceTab] = useState<MainWorkspaceTab>('studio');
  const [developTab, setDevelopTab] = useState<DevelopPanelTab>('basic');
  const [filmstripTab, setFilmstripTab] = useState<FilmstripTab>('applied-lut');
  const [wbMode, setWbMode] = useState<string>('As Shot');
  const [wbSectionOpen, setWbSectionOpen] = useState<boolean>(true);
  const [toneSectionOpen, setToneSectionOpen] = useState<boolean>(true);
  const [highContrastTheme, setHighContrastTheme] = useState<boolean>(false);

  const [activeSceneId, setActiveSceneId] = useState<string>(
    savedSession?.activeSceneId ?? 'alpine-sunrise'
  );
  const [comparisonMode, setComparisonMode] =
    useState<PreviewComparisonMode>('xmp-vs-original');

  const [showRawCubeEditor, setShowRawCubeEditor] = useState<boolean>(false);
  const [rawCubeTitle, setRawCubeTitle] = useState<string>('');
  const [rawCubeInput, setRawCubeInput] = useState<string>('');
  const [reverseXmpInput, setReverseXmpInput] = useState<string>('');
  const [reverseBakeSize, setReverseBakeSize] = useState<number>(17);

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [exportStatusBanner, setExportStatusBanner] = useState<string | null>(null);

  // Generate and memoize graded landscape thumbnails for all LUTs
  const lutThumbnails = useMemo(() => {
    const map: Record<string, string> = {};
    for (const lut of luts) {
      map[lut.id] = generateLUTThumbnailDataURL(lut, 120, 72);
    }
    return map;
  }, [luts]);

  // Auto-save active session to browser localStorage
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

  const filteredLuts = useMemo(() => {
    if (!searchQuery.trim()) return luts;
    const q = searchQuery.toLowerCase();
    return luts.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        (l.category ?? '').toLowerCase().includes(q)
    );
  }, [luts, searchQuery]);

  const handleSelectLUT = (lut: LUT3D) => {
    setActiveLUTId(lut.id);
    const { params } = fitLUTToLightroomXMP(lut, {
      presetName: lut.title,
      presetGroup: xmpParams.presetGroup,
      lutIntensity: xmpParams.lutIntensity,
      skinToneProtection: xmpParams.skinToneProtection,
      curvePointCount: xmpParams.curvePointCount,
    });
    const nextParams =
      lut.id === 'kodak-2383-print' && xmpParams.lutIntensity === 100
        ? applyKodak2383SignatureDefaults(params)
        : params;
    updateXmpParamsWithHistory(nextParams);
    setUploadError(null);
  };

  const handleRefitFromCurrentLUT = (
    overrideIntensity?: number,
    overrideSkinProtect?: number,
    overridePoints?: 5 | 9 | 17
  ) => {
    const nextIntensity = overrideIntensity ?? xmpParams.lutIntensity;
    const { params } = fitLUTToLightroomXMP(activeLUT, {
      presetName: xmpParams.presetName,
      presetGroup: xmpParams.presetGroup,
      lutIntensity: nextIntensity,
      skinToneProtection: overrideSkinProtect ?? xmpParams.skinToneProtection,
      curvePointCount: overridePoints ?? xmpParams.curvePointCount,
    });
    if (activeLUT.id === 'kodak-2383-print' && nextIntensity === 100) {
      updateXmpParamsWithHistory(applyKodak2383SignatureDefaults(params));
    } else {
      updateXmpParamsWithHistory(params);
    }
  };

  const toggleFavoriteLut = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavoriteLutIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const off = document.createElement('canvas');
        off.width = 768;
        off.height = 432;
        const oCtx = off.getContext('2d');
        if (oCtx) {
          oCtx.drawImage(img, 0, 0, 768, 432);
          const data = oCtx.getImageData(0, 0, 768, 432);
          setCustomPhotoData(data);
          setCustomPhotoName(file.name);
          setActiveSceneId('custom-upload');
          setExportStatusBanner(`Loaded reference photo "${file.name}" into grading canvas.`);
          setTimeout(() => setExportStatusBanner(null), 3500);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const processUploadedLUTFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError(null);

    Array.from(files).forEach((file, idx) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = String(reader.result ?? '');
          const cleanName = file.name.replace(/\.(cube|3dl|look|lut)$/i, '');
          const is3dl = /\.3dl$/i.test(file.name);
          const parsed = is3dl
            ? parse3dlLUT(text, cleanName)
            : parseCubeLUT(text, cleanName);

          parsed.category = 'Custom Imported';
          parsed.description = `Imported from ${file.name} (${parsed.size}³ mesh)`;

          setLuts((prev) => [parsed, ...prev.filter((item) => item.id !== parsed.id)]);
          if (idx === 0) {
            handleSelectLUT(parsed);
          }
        } catch (err) {
          setUploadError(
            err instanceof Error ? err.message : `Unable to parse ${file.name}.`
          );
        }
      };
      reader.readAsText(file);
    });
  };

  const handleLUTFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    processUploadedLUTFiles(e.target.files);
  };

  const handleDropLUTs = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    processUploadedLUTFiles(e.dataTransfer.files);
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
    setExportStatusBanner(`Saved preset "${name}" to browser local storage.`);
    setTimeout(() => setExportStatusBanner(null), 4000);
  };

  const handleLoadSnapshotDraft = (snap: SavedPresetSnapshot) => {
    if (luts.some((l) => l.id === snap.lutId)) {
      setActiveLUTId(snap.lutId);
    }
    updateXmpParamsWithHistory(structuredClone(snap.params));
  };

  const handleDeleteSnapshotDraft = (id: string) => {
    setSavedSnapshots((prev) => prev.filter((s) => s.id !== id));
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
      parsed.category = 'Custom .CUBE';
      parsed.description = `Parsed directly from raw .cube specification (${parsed.size}³ mesh)`;
      setLuts((prev) => [parsed, ...prev.filter((item) => item.id !== parsed.id)]);
      handleSelectLUT(parsed);
      setShowRawCubeEditor(false);
      setRawCubeInput('');
      setRawCubeTitle('');
      setWorkspaceTab('studio');
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
      `Exported ${filename} (Adobe Lightroom ProcessVersion 11.0 · Mean ΔE ${metrics.meanDeltaE.toFixed(2)})`
    );
    setTimeout(() => setExportStatusBanner(null), 5000);
  };

  const handleExportBakedCubeFromXMP = () => {
    let targetParams = xmpParams;
    if (reverseXmpInput.trim()) {
      targetParams = parseLightroomXMPString(reverseXmpInput, xmpParams);
    }
    const baked = bakeXMPParamsTo3DLUT(targetParams, reverseBakeSize);
    const cubeContent = serializeCubeLUT(baked);
    const blob = new Blob([cubeContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const filename = `${baked.title.replace(/[^a-z0-9-_]+/gi, '_')}_${reverseBakeSize}x${reverseBakeSize}x${reverseBakeSize}.cube`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    setLuts((prev) => [baked, ...prev.filter((item) => item.id !== baked.id)]);
    setActiveLUTId(baked.id);
    setExportStatusBanner(
      `Converted XMP Preset "${baked.title}" to 3D LUT (${filename}) and added to LUT Library!`
    );
    setTimeout(() => setExportStatusBanner(null), 5000);
  };

  const handleWBModeChange = (mode: string) => {
    setWbMode(mode);
    if (mode === 'Daylight') {
      updateXmpParamsWithHistory((p) => ({ ...p, temperature: 12, tint: 2 }));
    } else if (mode === 'Cloudy') {
      updateXmpParamsWithHistory((p) => ({ ...p, temperature: 24, tint: 5 }));
    } else if (mode === 'Tungsten') {
      updateXmpParamsWithHistory((p) => ({ ...p, temperature: -28, tint: -6 }));
    } else if (mode === 'As Shot') {
      updateXmpParamsWithHistory((p) => ({ ...p, temperature: 4, tint: -1 }));
    }
  };

  const formatSignedVal = (n: number, isFloat = false) => {
    if (isFloat) {
      const f = n.toFixed(2);
      return n > 0 ? `+${f}` : f;
    }
    const r = Math.round(n);
    return r > 0 ? `+${r}` : `${r}`;
  };

  return (
    <div
      className={`min-h-screen flex flex-col ${
        highContrastTheme ? 'bg-[#05050B]' : 'bg-[#0B0B15]'
      } text-zinc-100`}
    >
      <OfflineIndicator />

      {/* Hidden File Inputs triggered by Left Sidebar & Filmstrip "+ Add LUT" */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handlePhotoUpload}
        className="sr-only"
        aria-label="Import Reference Photo"
      />
      <input
        ref={lutInputRef}
        type="file"
        multiple
        accept=".cube,.3dl,.look,.lut,text/plain"
        onChange={handleLUTFileUpload}
        className="sr-only"
        aria-label="Import LUT Files"
      />

      {/* Top Navigation Bar matching CineLUT Studio */}
      <header className="flex flex-wrap items-center justify-between gap-4 px-5 py-2.5 bg-[#0F0F1C] border-b border-[#222238] sticky top-0 z-30">
        {/* Left: Rainbow Film Icon + CineLUT Studio Wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setWorkspaceTab('studio');
          }}
          className="flex items-center gap-3 shrink-0 group"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-pink-500 via-amber-400 to-cyan-400 p-[2px] shadow-[0_0_18px_rgba(236,72,153,0.35)] flex items-center justify-center">
            <div className="w-full h-full bg-[#121222] rounded-[10px] flex items-center justify-center relative overflow-hidden">
              <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-fuchsia-500 via-amber-400 to-emerald-400 opacity-95" />
              {/* Film perforations */}
              <div className="absolute left-0.5 inset-y-1 flex flex-col justify-between">
                <span className="w-1 h-1 rounded-xs bg-white/80" />
                <span className="w-1 h-1 rounded-xs bg-white/80" />
                <span className="w-1 h-1 rounded-xs bg-white/80" />
              </div>
              <div className="absolute right-0.5 inset-y-1 flex flex-col justify-between">
                <span className="w-1 h-1 rounded-xs bg-white/80" />
                <span className="w-1 h-1 rounded-xs bg-white/80" />
                <span className="w-1 h-1 rounded-xs bg-white/80" />
              </div>
            </div>
          </div>
          <div className="flex flex-col">
            <div className="text-lg font-extrabold tracking-tight leading-none flex items-center gap-1">
              <span className="text-white">Cine</span>
              <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-pink-500 bg-clip-text text-transparent">
                LUT Studio
              </span>
            </div>
            <span className="text-[11px] text-zinc-400 tracking-tight mt-0.5">
              LUT ↔ XMP Converter &amp; Grading
            </span>
          </div>
        </a>

        {/* Center: Rounded Pill Navigation Dock */}
        <nav
          aria-label="Primary Workspace Views"
          className="flex items-center gap-1 bg-[#151526] border border-[#26263E] rounded-2xl p-1 overflow-x-auto max-w-full"
        >
          {(
            [
              { id: 'studio', label: 'Grading Studio', icon: Wand2 },
              { id: 'lut-to-xmp', label: 'LUT to XMP', icon: FileText },
              { id: 'xmp-to-lut', label: 'XMP to LUT', icon: ArrowLeftRight },
              { id: 'batch', label: 'Batch Converter', icon: Layers },
              { id: 'curves-hsl', label: 'Curves & HSL', icon: Activity },
              { id: 'presets', label: 'Presets', icon: Star },
              { id: 'inspector', label: 'Inspector', icon: Settings2 },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = workspaceTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setWorkspaceTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white font-semibold shadow-[0_0_16px_rgba(139,92,246,0.45)] border border-[#A78BFA]/50'
                    : 'text-zinc-300 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right: Theme Icon, Settings / PC .EXE Install Icon, and Export XMP Preset Gradient Button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setHighContrastTheme((v) => !v)}
            title="Toggle Deep Darkroom Contrast"
            aria-label="Toggle Deep Darkroom Contrast"
            className="w-9 h-9 rounded-xl bg-[#161628] hover:bg-[#1E1E36] border border-[#282842] flex items-center justify-center text-zinc-300 hover:text-white transition-colors cursor-pointer"
          >
            {highContrastTheme ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>

          {/* Settings Gear Button opens Standalone PC (.EXE / PWA) Installer Modal */}
          <PWAInstallButtonAndModal variant="icon" />

          <button
            type="button"
            onClick={handleExportSingleXMP}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-amber-500 via-orange-500 to-fuchsia-600 hover:brightness-110 rounded-xl shadow-[0_0_20px_rgba(236,72,153,0.4)] border border-white/20 transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export XMP Preset</span>
          </button>
        </div>
      </header>

      {/* Alert / Status Toast Banner */}
      {(uploadError || exportStatusBanner) && (
        <div className="px-5 pt-2.5 max-w-[1600px] w-full mx-auto">
          {uploadError && (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 px-4 py-2 rounded-xl bg-rose-950/70 border border-rose-500/40 text-xs text-rose-200"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{uploadError}</span>
              </div>
              <button
                type="button"
                onClick={() => setUploadError(null)}
                className="text-rose-300 hover:text-white font-medium cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}
          {exportStatusBanner && (
            <div
              role="status"
              className="flex items-center justify-between gap-3 px-4 py-2 rounded-xl bg-violet-950/70 border border-violet-500/40 text-xs text-violet-100"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-violet-400 shrink-0" />
                <span>{exportStatusBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setExportStatusBanner(null)}
                className="text-violet-300 hover:text-white font-medium cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Workstation Container */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 py-3.5 flex flex-col gap-4">
        {/* VIEW 1: GRADING STUDIO (Exact 3-Column + Bottom Filmstrip Layout from Reference Image) */}
        {workspaceTab === 'studio' && (
          <div className="grid grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)_318px] gap-3.5 items-stretch">
            {/* LEFT SIDEBAR (248px) */}
            <aside className="bg-[#121221] border border-[#24243B] rounded-2xl p-3 flex flex-col justify-between gap-3 shadow-xl">
              <div className="flex flex-col gap-3">
                {/* Project Section */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200 px-0.5">
                    <Folder className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Project</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] hover:brightness-110 shadow-[0_0_18px_rgba(124,58,237,0.4)] border border-[#A78BFA]/40 transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Import Photo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => lutInputRef.current?.click()}
                    className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-medium text-zinc-200 bg-[#171729] hover:bg-[#1E1E36] border border-[#2C2C46] transition-colors cursor-pointer"
                  >
                    <Box className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Import LUT(s)</span>
                  </button>
                </div>

                <div className="h-[1px] bg-[#222238]" />

                {/* LUT Library Section */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between px-0.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                      <Layers className="w-3.5 h-3.5 text-zinc-400" />
                      <span>LUT Library ({luts.length})</span>
                    </div>
                    <button
                      type="button"
                      title="View All Presets"
                      onClick={() => setWorkspaceTab('presets')}
                      className="text-zinc-400 hover:text-white p-0.5 cursor-pointer"
                    >
                      <Maximize2 className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Search LUTs Input */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search LUTs..."
                      aria-label="Search LUTs"
                      className="w-full bg-[#161628] border border-[#282842] rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-violet-500"
                    />
                  </div>

                  {/* Scrollable LUT List with Live Graded Landscape Thumbnails */}
                  <div className="flex flex-col gap-1.5 max-h-[375px] overflow-y-auto cinelut-scroll pr-0.5">
                    {filteredLuts.map((lut) => {
                      const isSelected = lut.id === activeLUT.id;
                      const isFav = favoriteLutIds.includes(lut.id);
                      const thumbUrl = lutThumbnails[lut.id];

                      return (
                        <div
                          key={lut.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSelectLUT(lut)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSelectLUT(lut);
                            }
                          }}
                          className={`group flex items-center gap-2 p-1.5 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#251C47] border-2 border-[#A78BFA] shadow-[0_0_16px_rgba(139,92,246,0.35)]'
                              : 'bg-[#161627]/70 border-[#24243B] hover:bg-[#1B1B30] hover:border-[#343454]'
                          }`}
                        >
                          {thumbUrl ? (
                            <img
                              src={thumbUrl}
                              alt={lut.title}
                              className="w-11 h-7 rounded-md object-cover border border-white/10 shrink-0"
                            />
                          ) : (
                            <div className="w-11 h-7 rounded-md bg-gradient-to-r from-slate-700 to-amber-600 shrink-0" />
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-semibold text-white truncate">
                              {lut.title}
                            </div>
                            <div className="text-[10px] text-zinc-400 truncate">
                              {lut.category ?? 'Creative'} · .{lut.format}
                            </div>
                          </div>

                          <button
                            type="button"
                            aria-label={`Favorite ${lut.title}`}
                            onClick={(e) => toggleFavoriteLut(lut.id, e)}
                            className={`p-0.5 rounded-md transition-colors shrink-0 cursor-pointer ${
                              isFav || isSelected
                                ? 'text-[#A78BFA]'
                                : 'text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-zinc-300'
                            }`}
                          >
                            <Star
                              className="w-3 h-3"
                              fill={isFav || isSelected ? 'currentColor' : 'none'}
                            />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Bottom Purple Dashed Drag & Drop Zone */}
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={handleDropLUTs}
                className="border-2 border-dashed border-[#6D28D9]/70 hover:border-[#A78BFA] bg-[#16122B]/70 hover:bg-[#1D1738] rounded-2xl p-3.5 flex flex-col items-center justify-center text-center cursor-pointer transition-all"
              >
                <Upload className="w-4 h-4 text-[#A78BFA] mb-1" />
                <span className="text-xs font-semibold text-zinc-100">
                  Drop LUT files here
                </span>
                <span className="text-[11px] text-zinc-400 mt-0.5">
                  or click to browse
                </span>
                <span className="text-[10px] font-mono text-zinc-500 mt-1 tracking-wide">
                  .cube &nbsp; .3dl &nbsp; .look &nbsp; .lut
                </span>
                <input
                  type="file"
                  multiple
                  accept=".cube,.3dl,.look,.lut,text/plain"
                  onChange={handleLUTFileUpload}
                  className="sr-only"
                />
              </label>
            </aside>

            {/* CENTER COLUMN: Split-Screen Viewport + Bottom Filmstrip Dock */}
            <section className="flex flex-col gap-3 min-w-0">
              <GradingCanvasViewport
                activeLUT={activeLUT}
                xmpParams={xmpParams}
                metrics={metrics}
                activeSceneId={activeSceneId}
                onSelectScene={setActiveSceneId}
                comparisonMode={comparisonMode}
                onChangeComparisonMode={setComparisonMode}
                customPhotoData={customPhotoData}
                customPhotoName={customPhotoName}
                onUndo={handleUndo}
                onRedo={handleRedo}
                canUndo={historyStack.length > 0}
                canRedo={redoStack.length > 0}
              />

              {/* Bottom Filmstrip Dock (`Applied LUT`, `Looks & Presets`, `History` + `Intensity` Slider) */}
              <div className="bg-[#121221] border border-[#24243B] rounded-2xl p-3 flex flex-col gap-2.5 shadow-xl">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Left Filmstrip Tabs */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFilmstripTab('applied-lut')}
                      className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        filmstripTab === 'applied-lut'
                          ? 'bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white shadow-[0_0_14px_rgba(139,92,246,0.4)] border border-[#A78BFA]/50'
                          : 'text-zinc-300 hover:text-white bg-[#171729] border border-[#282842]'
                      }`}
                    >
                      Applied LUT
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilmstripTab('looks-presets')}
                      className={`px-3 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                        filmstripTab === 'looks-presets'
                          ? 'bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white shadow-[0_0_14px_rgba(139,92,246,0.4)] border border-[#A78BFA]/50'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Looks &amp; Presets
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilmstripTab('history')}
                      className={`px-3 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                        filmstripTab === 'history'
                          ? 'bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white shadow-[0_0_14px_rgba(139,92,246,0.4)] border border-[#A78BFA]/50'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      History
                    </button>
                  </div>

                  {/* Right: Intensity Slider */}
                  <div className="flex items-center gap-2.5">
                    <label
                      htmlFor="filmstrip-intensity-slider"
                      className="text-xs font-medium text-zinc-300"
                    >
                      Intensity
                    </label>
                    <input
                      id="filmstrip-intensity-slider"
                      type="range"
                      min={0}
                      max={150}
                      value={xmpParams.lutIntensity}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        handleRefitFromCurrentLUT(val, undefined, undefined);
                      }}
                      className="w-36 sm:w-44 cinelut-slider track-intensity"
                    />
                    <span className="bg-[#18182C] border border-[#2D2D48] rounded-lg px-2 py-0.5 text-xs font-mono text-zinc-100 min-w-[46px] text-center">
                      {xmpParams.lutIntensity}%
                    </span>
                  </div>
                </div>

                {/* Filmstrip Cards Row — all 8 cards + Add LUT visible across the dock */}
                {filmstripTab === 'applied-lut' && (
                  <div className="grid grid-cols-3 sm:grid-cols-5 xl:grid-cols-9 gap-1.5">
                    {luts.slice(0, 8).map((lut) => {
                      const isSelected = lut.id === activeLUT.id;
                      const thumbUrl = lutThumbnails[lut.id];
                      const shortTitle = FILMSTRIP_SHORT_NAMES[lut.id] ?? lut.title;

                      return (
                        <button
                          key={lut.id}
                          type="button"
                          onClick={() => handleSelectLUT(lut)}
                          className={`rounded-xl p-1 flex flex-col gap-1 text-center transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#251C47] border-2 border-[#A78BFA] shadow-[0_0_16px_rgba(139,92,246,0.38)]'
                              : 'bg-[#171729] border border-[#282840] hover:border-[#4C3B82]'
                          }`}
                        >
                          <div className="relative w-full h-[50px] rounded-lg overflow-hidden bg-[#0E0E1A]">
                            {thumbUrl && (
                              <img
                                src={thumbUrl}
                                alt={shortTitle}
                                className="w-full h-full object-cover"
                              />
                            )}
                            {isSelected && (
                              <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-[#7C3AED] text-white flex items-center justify-center shadow-md">
                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-medium text-zinc-100 leading-tight line-clamp-2 px-0.5">
                            {shortTitle}
                          </span>
                        </button>
                      );
                    })}

                    {/* "+ Add LUT" Tile at right end of Filmstrip */}
                    <button
                      type="button"
                      onClick={() => lutInputRef.current?.click()}
                      className="rounded-xl bg-[#161628] hover:bg-[#1E1E36] border border-[#2B2B46] hover:border-violet-500 flex flex-col items-center justify-center gap-1 p-1.5 text-zinc-300 hover:text-white transition-colors cursor-pointer min-h-[78px]"
                    >
                      <Plus className="w-4 h-4 text-violet-400" />
                      <span className="text-[11px] font-medium">Add LUT</span>
                    </button>
                  </div>
                )}

                {filmstripTab === 'looks-presets' && (
                  <div className="flex items-center justify-between gap-3 py-2 px-1">
                    <div className="flex items-center gap-2 overflow-x-auto">
                      {savedSnapshots.length === 0 ? (
                        <span className="text-xs text-zinc-400">
                          No saved custom presets yet. Click &quot;Save Preset Snapshot&quot; to store your look in browser storage.
                        </span>
                      ) : (
                        savedSnapshots.map((snap) => (
                          <button
                            key={snap.id}
                            type="button"
                            onClick={() => handleLoadSnapshotDraft(snap)}
                            className="px-3 py-2 rounded-xl bg-[#18182C] hover:bg-[#231C42] border border-[#2E2E4A] text-left shrink-0 cursor-pointer"
                          >
                            <div className="text-xs font-semibold text-white">
                              {snap.name}
                            </div>
                            <div className="text-[11px] text-zinc-400">
                              {snap.updatedAt} · ΔE {snap.meanDeltaE.toFixed(2)}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveSnapshotDraft}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600/30 border border-violet-500/50 text-xs font-semibold text-violet-200 hover:text-white shrink-0 cursor-pointer"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      <span>Save Preset Snapshot</span>
                    </button>
                  </div>
                )}

                {filmstripTab === 'history' && (
                  <div className="flex items-center justify-between gap-3 py-2 px-1 text-xs text-zinc-300">
                    <span>
                      Undo Stack: {historyStack.length} step{historyStack.length === 1 ? '' : 's'} · Active LUT:{' '}
                      <strong className="text-white">{activeLUT.title}</strong> (Mean ΔE{' '}
                      {metrics.meanDeltaE.toFixed(2)})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRefitFromCurrentLUT()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#18182C] border border-[#2D2D48] text-xs text-zinc-200 hover:text-white cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-violet-400" />
                      <span>Reset Sliders to LUT</span>
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* RIGHT SIDEBAR (318px): Basic, Curves, HSL, Color, Effects, Calibration */}
            <aside className="bg-[#121221] border border-[#24243B] rounded-2xl p-3 flex flex-col gap-3 shadow-xl">
              {/* Top 6-Tab Develop Bar */}
              <div
                className="flex items-center justify-between bg-[#171728] border border-[#26263E] p-1 rounded-xl"
                role="tablist"
                aria-label="Lightroom Develop Parameter Panels"
              >
                {(
                  [
                    { id: 'basic', label: 'Basic' },
                    { id: 'curves', label: 'Curves' },
                    { id: 'hsl', label: 'HSL' },
                    { id: 'color', label: 'Color' },
                    { id: 'effects', label: 'Effects' },
                    { id: 'calibration', label: 'Calibration' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={developTab === t.id}
                    onClick={() => setDevelopTab(t.id)}
                    className={`px-2 py-1.5 text-[11px] font-medium rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                      developTab === t.id
                        ? 'bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] text-white font-semibold shadow-[0_0_12px_rgba(139,92,246,0.4)]'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* TAB 1: BASIC (White Balance & Presence + Tone with exact color-gradient sliders) */}
              {developTab === 'basic' && (
                <div className="flex flex-col gap-3">
                  {/* Card 1: White Balance & Presence */}
                  <div className="bg-[#171729] border border-[#272740] rounded-2xl p-3.5 flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={() => setWbSectionOpen((o) => !o)}
                      className="flex items-center justify-between text-xs font-bold text-white w-full cursor-pointer"
                    >
                      <span>White Balance &amp; Presence</span>
                      <ChevronDown
                        className={`w-4 h-4 text-zinc-400 transition-transform ${
                          wbSectionOpen ? '' : '-rotate-90'
                        }`}
                      />
                    </button>

                    {wbSectionOpen && (
                      <div className="flex flex-col gap-3 pt-0.5">
                        {/* WB: As Shot Dropdown */}
                        <div className="grid grid-cols-12 items-center gap-2 text-xs">
                          <label htmlFor="wb-preset-select" className="col-span-4 text-zinc-300">
                            WB:
                          </label>
                          <div className="col-span-8">
                            <select
                              id="wb-preset-select"
                              value={wbMode}
                              onChange={(e) => handleWBModeChange(e.target.value)}
                              className="w-full bg-[#1F1F35] border border-[#323250] rounded-xl px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-violet-500 cursor-pointer"
                            >
                              <option value="As Shot">As Shot</option>
                              <option value="Daylight">Daylight (5500K)</option>
                              <option value="Cloudy">Cloudy (6500K)</option>
                              <option value="Tungsten">Tungsten (3200K)</option>
                              <option value="Custom">Custom Kelvin</option>
                            </select>
                          </div>
                        </div>

                        {(
                          [
                            {
                              key: 'temperature',
                              label: 'Temperature',
                              trackClass: 'track-temp',
                            },
                            {
                              key: 'tint',
                              label: 'Tint',
                              trackClass: 'track-tint',
                            },
                            {
                              key: 'vibrance',
                              label: 'Vibrance',
                              trackClass: 'track-vibrance',
                            },
                            {
                              key: 'saturation',
                              label: 'Saturation',
                              trackClass: 'track-saturation',
                            },
                          ] as const
                        ).map((item) => (
                          <div
                            key={item.key}
                            className="grid grid-cols-12 items-center gap-2 text-xs"
                          >
                            <label
                              htmlFor={`wb-${item.key}`}
                              className="col-span-4 text-zinc-300 truncate"
                            >
                              {item.label}
                            </label>
                            <div className="col-span-6 flex items-center">
                              <input
                                id={`wb-${item.key}`}
                                type="range"
                                min={-100}
                                max={100}
                                step={1}
                                value={xmpParams[item.key]}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  updateXmpParamsWithHistory((prev) => ({
                                    ...prev,
                                    [item.key]: val,
                                  }));
                                }}
                                className={`w-full cinelut-slider ${item.trackClass}`}
                              />
                            </div>
                            <div className="col-span-2">
                              <span className="block w-full text-center py-1 rounded-lg bg-[#202036] border border-[#323250] font-mono text-[11px] text-zinc-100">
                                {formatSignedVal(xmpParams[item.key])}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Card 2: Tone */}
                  <div className="bg-[#171729] border border-[#272740] rounded-2xl p-3.5 flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={() => setToneSectionOpen((o) => !o)}
                      className="flex items-center justify-between text-xs font-bold text-white w-full cursor-pointer"
                    >
                      <span>Tone</span>
                      <ChevronDown
                        className={`w-4 h-4 text-zinc-400 transition-transform ${
                          toneSectionOpen ? '' : '-rotate-90'
                        }`}
                      />
                    </button>

                    {toneSectionOpen && (
                      <div className="flex flex-col gap-3 pt-0.5">
                        {(
                          [
                            {
                              key: 'exposure',
                              label: 'Exposure',
                              min: -4,
                              max: 4,
                              step: 0.02,
                              isFloat: true,
                            },
                            {
                              key: 'contrast',
                              label: 'Contrast',
                              min: -100,
                              max: 100,
                              step: 1,
                              isFloat: false,
                            },
                            {
                              key: 'highlights',
                              label: 'Highlights',
                              min: -100,
                              max: 100,
                              step: 1,
                              isFloat: false,
                            },
                            {
                              key: 'shadows',
                              label: 'Shadows',
                              min: -100,
                              max: 100,
                              step: 1,
                              isFloat: false,
                            },
                            {
                              key: 'whites',
                              label: 'Whites',
                              min: -100,
                              max: 100,
                              step: 1,
                              isFloat: false,
                            },
                            {
                              key: 'blacks',
                              label: 'Blacks',
                              min: -100,
                              max: 100,
                              step: 1,
                              isFloat: false,
                            },
                          ] as const
                        ).map((item) => (
                          <div
                            key={item.key}
                            className="grid grid-cols-12 items-center gap-2 text-xs"
                          >
                            <label
                              htmlFor={`tone-${item.key}`}
                              className="col-span-4 text-zinc-300 truncate"
                            >
                              {item.label}
                            </label>
                            <div className="col-span-6 flex items-center">
                              <input
                                id={`tone-${item.key}`}
                                type="range"
                                min={item.min}
                                max={item.max}
                                step={item.step}
                                value={xmpParams[item.key]}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  updateXmpParamsWithHistory((prev) => ({
                                    ...prev,
                                    [item.key]: val,
                                  }));
                                }}
                                className="w-full cinelut-slider track-tone"
                              />
                            </div>
                            <div className="col-span-2">
                              <span className="block w-full text-center py-1 rounded-lg bg-[#202036] border border-[#323250] font-mono text-[11px] text-zinc-100">
                                {formatSignedVal(xmpParams[item.key], item.isFloat)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: CURVES */}
              {developTab === 'curves' && (
                <ToneCurveEditor
                  params={xmpParams}
                  onUpdateParams={updateXmpParamsWithHistory}
                  onChangePointDensity={(cnt) =>
                    handleRefitFromCurrentLUT(undefined, undefined, cnt)
                  }
                />
              )}

              {/* TAB 3 & 4: HSL & COLOR */}
              {(developTab === 'hsl' || developTab === 'color') && (
                <HSLAndColorWheelsPanel
                  params={xmpParams}
                  onUpdateParams={updateXmpParamsWithHistory}
                />
              )}

              {/* TAB 5: EFFECTS (Clarity, Dehaze, Film Grain, Post-Crop Vignette) */}
              {developTab === 'effects' && (
                <div className="bg-[#171729] border border-[#272740] rounded-2xl p-3.5 flex flex-col gap-3">
                  <div className="text-xs font-bold text-white">
                    Presence, Grain &amp; Optical Vignette
                  </div>
                  {(
                    [
                      { key: 'clarity', label: 'Clarity', min: -100, max: 100 },
                      { key: 'dehaze', label: 'Dehaze', min: -100, max: 100 },
                      { key: 'grainAmount', label: 'Film Grain', min: 0, max: 100 },
                      {
                        key: 'postCropVignette',
                        label: 'Vignette',
                        min: -100,
                        max: 100,
                      },
                    ] as const
                  ).map((item) => (
                    <div
                      key={item.key}
                      className="grid grid-cols-12 items-center gap-2 text-xs"
                    >
                      <label
                        htmlFor={`fx-${item.key}`}
                        className="col-span-4 text-zinc-300"
                      >
                        {item.label}
                      </label>
                      <div className="col-span-6 flex items-center">
                        <input
                          id={`fx-${item.key}`}
                          type="range"
                          min={item.min}
                          max={item.max}
                          value={xmpParams[item.key]}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            updateXmpParamsWithHistory((prev) => ({
                              ...prev,
                              [item.key]: val,
                            }));
                          }}
                          className="w-full cinelut-slider track-tone"
                        />
                      </div>
                      <div className="col-span-2">
                        <span className="block w-full text-center py-1 rounded-lg bg-[#202036] border border-[#323250] font-mono text-[11px] text-zinc-100">
                          {formatSignedVal(xmpParams[item.key])}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 6: CALIBRATION */}
              {developTab === 'calibration' && (
                <div className="bg-[#171729] border border-[#272740] rounded-2xl p-3.5 flex flex-col gap-3">
                  <div className="text-xs font-bold text-white">
                    Camera Calibration Primaries
                  </div>
                  {(
                    [
                      { key: 'shadowTint', label: 'Shadow Tint' },
                      { key: 'redPrimaryHue', label: 'Red Hue' },
                      { key: 'redPrimarySat', label: 'Red Sat' },
                      { key: 'greenPrimaryHue', label: 'Green Hue' },
                      { key: 'greenPrimarySat', label: 'Green Sat' },
                      { key: 'bluePrimaryHue', label: 'Blue Hue' },
                      { key: 'bluePrimarySat', label: 'Blue Sat' },
                    ] as const
                  ).map((item) => (
                    <div
                      key={item.key}
                      className="grid grid-cols-12 items-center gap-2 text-xs"
                    >
                      <label
                        htmlFor={`cal-${item.key}`}
                        className="col-span-4 text-zinc-300 truncate"
                      >
                        {item.label}
                      </label>
                      <div className="col-span-6 flex items-center">
                        <input
                          id={`cal-${item.key}`}
                          type="range"
                          min={-100}
                          max={100}
                          value={xmpParams[item.key]}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            updateXmpParamsWithHistory((prev) => ({
                              ...prev,
                              [item.key]: val,
                            }));
                          }}
                          className="w-full cinelut-slider track-tone"
                        />
                      </div>
                      <div className="col-span-2">
                        <span className="block w-full text-center py-1 rounded-lg bg-[#202036] border border-[#323250] font-mono text-[11px] text-zinc-100">
                          {formatSignedVal(xmpParams[item.key])}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </div>
        )}

        {/* VIEW 2: LUT TO XMP CONVERTER & LIGHTROOM AUTO-INSTALLER */}
        {workspaceTab === 'lut-to-xmp' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-5 bg-[#121221] border border-[#24243B] rounded-2xl p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white">
                    3D LUT (.CUBE / .3DL) → Lightroom (.XMP) Solver
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Configure mathematical solver precision, skin-tone protection, and direct Adobe Lightroom installer scripts.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 bg-[#171729] border border-[#282842] rounded-xl p-4">
                <div className="flex flex-col gap-1">
                  <label htmlFor="solver-preset-name" className="text-xs text-zinc-300">
                    Lightroom Preset Name (crs:Name)
                  </label>
                  <input
                    id="solver-preset-name"
                    type="text"
                    value={xmpParams.presetName}
                    onChange={(e) =>
                      updateXmpParamsWithHistory((p) => ({
                        ...p,
                        presetName: e.target.value,
                      }))
                    }
                    className="bg-[#11111F] border border-[#2D2D48] rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label htmlFor="solver-preset-group" className="text-xs text-zinc-300">
                    Lightroom Preset Folder Group (crs:Group)
                  </label>
                  <input
                    id="solver-preset-group"
                    type="text"
                    value={xmpParams.presetGroup}
                    onChange={(e) =>
                      updateXmpParamsWithHistory((p) => ({
                        ...p,
                        presetGroup: e.target.value,
                      }))
                    }
                    className="bg-[#11111F] border border-[#2D2D48] rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                <div className="flex flex-col gap-1 pt-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-300">Skin-Tone Orange/Red Guard</span>
                    <span className="font-mono text-violet-300">
                      {xmpParams.skinToneProtection}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={xmpParams.skinToneProtection}
                    onChange={(e) =>
                      handleRefitFromCurrentLUT(undefined, Number(e.target.value), undefined)
                    }
                    className="w-full cinelut-slider track-intensity"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleExportSingleXMP}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-amber-500 via-orange-500 to-fuchsia-600 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .XMP File</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const script = generateLightroomInstallerScript(
                        [xmpParams],
                        'windows-ps1'
                      );
                      const blob = new Blob([script.content], {
                        type: 'text/plain;charset=utf-8',
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = script.filename;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-violet-200 bg-violet-600/25 border border-violet-500/50 hover:bg-violet-600/35 cursor-pointer"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Windows Lightroom Auto-Installer (.PS1)</span>
                  </button>
                </div>
              </div>

              {/* Paste Raw .CUBE Form */}
              <form
                onSubmit={handleParseRawCubeSubmit}
                className="bg-[#171729] border border-[#282842] rounded-xl p-4 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">
                    Paste Raw .CUBE 3D LUT Specification
                  </span>
                  <button
                    type="button"
                    onClick={() => {
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
                    }}
                    className="text-xs text-violet-400 hover:text-violet-300 underline cursor-pointer"
                  >
                    Load Sample 2×2×2 .CUBE
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Custom LUT Title"
                  value={rawCubeTitle}
                  onChange={(e) => setRawCubeTitle(e.target.value)}
                  className="bg-[#11111F] border border-[#2D2D48] rounded-xl px-3 py-2 text-xs text-white"
                />
                <textarea
                  rows={5}
                  value={rawCubeInput}
                  onChange={(e) => setRawCubeInput(e.target.value)}
                  placeholder={'TITLE "Custom"\nLUT_3D_SIZE 17\n0.0 0.0 0.0 ...'}
                  className="bg-[#11111F] border border-[#2D2D48] rounded-xl p-2.5 text-xs font-mono text-zinc-200"
                />
                <button
                  type="submit"
                  className="self-end px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] cursor-pointer"
                >
                  Parse .CUBE &amp; Solve XMP
                </button>
              </form>
            </div>

            <div className="lg:col-span-7">
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
            </div>
          </div>
        )}

        {/* VIEW 3: XMP TO LUT REVERSE CONVERTER */}
        {workspaceTab === 'xmp-to-lut' && (
          <div className="bg-[#121221] border border-[#24243B] rounded-2xl p-6 flex flex-col gap-5 max-w-4xl mx-auto w-full">
            <div>
              <h2 className="text-lg font-bold text-white">
                XMP to 3D LUT (.CUBE) Reverse Converter
              </h2>
              <p className="text-xs text-zinc-400 mt-1">
                Convert your current Lightroom Develop grade—or paste any Adobe Lightroom Classic / Camera Raw <code className="text-violet-300">.xmp</code> preset XML—into a standard 3D LUT (<code className="text-violet-300">.cube</code>) compatible with DaVinci Resolve, Premiere Pro, Final Cut, and camera monitors.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#171729] border border-[#282842] rounded-xl p-4 flex flex-col gap-3">
                <div className="text-xs font-bold text-white">
                  1. Source Lightroom XMP Parameters
                </div>
                <p className="text-xs text-zinc-400">
                  Leave blank to bake your active CineLUT Studio grade (<strong className="text-white">{xmpParams.presetName}</strong>), or paste custom <code className="text-zinc-300">.xmp</code> XML below:
                </p>
                <textarea
                  rows={8}
                  value={reverseXmpInput}
                  onChange={(e) => setReverseXmpInput(e.target.value)}
                  placeholder="Optional: Paste <x:xmpmeta ...> Adobe Lightroom .xmp XML content here..."
                  className="bg-[#11111F] border border-[#2D2D48] rounded-xl p-3 text-xs font-mono text-zinc-200"
                />
              </div>

              <div className="bg-[#171729] border border-[#282842] rounded-xl p-4 flex flex-col justify-between gap-4">
                <div className="flex flex-col gap-3">
                  <div className="text-xs font-bold text-white">
                    2. Target 3D LUT (.CUBE) Mesh Configuration
                  </div>

                  <div className="flex flex-col gap-1">
                    <label htmlFor="bake-grid-size" className="text-xs text-zinc-300">
                      3D Cube Grid Resolution (LUT_3D_SIZE)
                    </label>
                    <select
                      id="bake-grid-size"
                      value={reverseBakeSize}
                      onChange={(e) => setReverseBakeSize(Number(e.target.value))}
                      className="bg-[#11111F] border border-[#2D2D48] rounded-xl px-3 py-2 text-xs text-white"
                    >
                      <option value={17}>17×17×17 (4,913 Lattice Points · Real-Time)</option>
                      <option value={33}>33×33×33 (35,937 Lattice Points · Mastering Standard)</option>
                    </select>
                  </div>

                  <div className="bg-[#11111F] border border-[#25253E] rounded-xl p-3 text-xs text-zinc-300 flex flex-col gap-1">
                    <div>
                      Active Preset: <strong className="text-white">{xmpParams.presetName}</strong>
                    </div>
                    <div>
                      Baked Domain: <span className="font-mono text-violet-300">0.000000 → 1.000000 (Rec.709 / sRGB)</span>
                    </div>
                    <div>
                      Includes: Tone Curves, 8-Band HSL, Split Toning, WB &amp; Calibration
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleExportBakedCubeFromXMP}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#6D28D9] via-[#8B5CF6] to-fuchsia-600 hover:brightness-110 shadow-[0_0_20px_rgba(139,92,246,0.4)] cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Generate &amp; Download 3D LUT (.CUBE)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4: BATCH CONVERTER */}
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

        {/* VIEW 5: CURVES & HSL MATRIX */}
        {workspaceTab === 'curves-hsl' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-5 bg-[#121221] border border-[#24243B] rounded-2xl p-5">
              <h2 className="text-sm font-bold text-white mb-3">
                4-Channel RGB Tone Curve Extraction (ToneCurvePV2012)
              </h2>
              <ToneCurveEditor
                params={xmpParams}
                onUpdateParams={updateXmpParamsWithHistory}
                onChangePointDensity={(cnt) =>
                  handleRefitFromCurrentLUT(undefined, undefined, cnt)
                }
              />
            </div>

            <div className="lg:col-span-7 bg-[#121221] border border-[#24243B] rounded-2xl p-5">
              <h2 className="text-sm font-bold text-white mb-3">
                8-Band Adobe Camera Raw HSL Mixer &amp; 3-Way Split Toning
              </h2>
              <HSLAndColorWheelsPanel
                params={xmpParams}
                onUpdateParams={updateXmpParamsWithHistory}
              />
            </div>
          </div>
        )}

        {/* VIEW 6: PRESETS LIBRARY & SAVED LOCAL SNAPSHOTS */}
        {workspaceTab === 'presets' && (
          <div className="bg-[#121221] border border-[#24243B] rounded-2xl p-5 flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-white">
                  Cinema LUT &amp; Saved Lightroom XMP Preset Library ({luts.length} LUTs)
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Click any cinema look to load it into the Grading Studio or save custom local preset snapshots.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <PWAInstallButtonAndModal variant="button" />
                <button
                  type="button"
                  onClick={handleSaveSnapshotDraft}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#6D28D9] to-[#8B5CF6] cursor-pointer"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  <span>Save Current Grade Snapshot</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              {luts.map((lut) => {
                const isSelected = lut.id === activeLUT.id;
                const thumbUrl = lutThumbnails[lut.id];
                return (
                  <div
                    key={lut.id}
                    onClick={() => {
                      handleSelectLUT(lut);
                      setWorkspaceTab('studio');
                    }}
                    className={`rounded-2xl p-2.5 border transition-all cursor-pointer flex flex-col gap-2 ${
                      isSelected
                        ? 'bg-[#251C47] border-2 border-[#A78BFA] shadow-[0_0_18px_rgba(139,92,246,0.35)]'
                        : 'bg-[#171729] border-[#282842] hover:border-violet-500/60'
                    }`}
                  >
                    {thumbUrl && (
                      <img
                        src={thumbUrl}
                        alt={lut.title}
                        className="w-full h-28 object-cover rounded-xl"
                      />
                    )}
                    <div className="flex items-start justify-between gap-2 px-1">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">
                          {lut.title}
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          {lut.category ?? 'Cinema Grade'} · {lut.size}³ .{lut.format}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {savedSnapshots.length > 0 && (
              <div className="pt-4 border-t border-[#24243B] flex flex-col gap-2.5">
                <h3 className="text-xs font-bold text-zinc-200">
                  Saved Browser LocalStorage Snapshots ({savedSnapshots.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {savedSnapshots.map((snap) => (
                    <div
                      key={snap.id}
                      className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[#171729] border border-[#282842]"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          handleLoadSnapshotDraft(snap);
                          setWorkspaceTab('studio');
                        }}
                        className="text-left flex-1 min-w-0 cursor-pointer"
                      >
                        <div className="text-xs font-semibold text-white truncate">
                          {snap.name}
                        </div>
                        <div className="text-[11px] text-zinc-400 font-mono">
                          {snap.updatedAt} · ΔE {snap.meanDeltaE.toFixed(2)}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSnapshotDraft(snap.id)}
                        className="p-1.5 text-zinc-400 hover:text-rose-400 cursor-pointer"
                        aria-label={`Delete snapshot ${snap.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW 7: XMP CODE INSPECTOR */}
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
      </main>
    </div>
  );
}
