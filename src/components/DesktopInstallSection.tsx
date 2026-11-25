import React, { useState } from 'react';
import { usePWAInstall, useOnlineStatus } from '../utils/usePWAInstall';
import {
  MonitorDown,
  ExternalLink,
  Download,
  CheckCircle2,
  X,
  WifiOff,
  Laptop,
} from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-semibold text-zinc-950 shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Offline Mode Active — Working from cached local PWA studio</span>
    </div>
  );
};

export const PWAInstallButtonAndModal: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isInIframe, install } =
    usePWAInstall();
  const [showModal, setShowModal] = useState(false);
  const [launcherDownloaded, setLauncherDownloaded] = useState<string | null>(
    null
  );

  const appUrl =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const handleInstallClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowModal(true);
  };

  const handleDownloadWindowsDesktopLauncher = () => {
    const batContent = `@echo off
REM ============================================================================
REM ChromaXMP — Standalone Windows Desktop App Launcher
REM Launches ChromaXMP in a native chromeless standalone desktop window
REM ============================================================================
SET APP_URL=${appUrl}

where msedge >nul 2>nul
IF %ERRORLEVEL% EQU 0 (
    start "" msedge --app="%APP_URL%"
    exit /b
)

IF EXIST "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" (
    start "" "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" --app="%APP_URL%"
    exit /b
)

IF EXIST "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" (
    start "" "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" --app="%APP_URL%"
    exit /b
)

start "" "%APP_URL%"
`;
    const blob = new Blob([batContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Launch_ChromaXMP_Desktop_App.bat';
    a.click();
    URL.revokeObjectURL(url);
    setLauncherDownloaded('Launch_ChromaXMP_Desktop_App.bat (Windows PC)');
  };

  const handleDownloadMacDesktopLauncher = () => {
    const shContent = `#!/usr/bin/env bash
# ============================================================================
# ChromaXMP — Standalone macOS Desktop App Launcher
# ============================================================================
APP_URL="${appUrl}"

if [ -d "/Applications/Google Chrome.app" ]; then
  open -n -a "Google Chrome" --args --app="$APP_URL"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
  open -n -a "Microsoft Edge" --args --app="$APP_URL"
else
  open "$APP_URL"
fi
`;
    const blob = new Blob([shContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Launch_ChromaXMP_Desktop_App.command';
    a.click();
    URL.revokeObjectURL(url);
    setLauncherDownloaded('Launch_ChromaXMP_Desktop_App.command (macOS)');
  };

  if (isInstalled) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 rounded-lg whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>Standalone PC App Installed</span>
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <MonitorDown className="w-3.5 h-3.5 text-amber-400" />
        <span>{isInstallable ? 'Install PC App' : 'Install on PC / Desktop'}</span>
      </button>

      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
        >
          <div className="w-full max-w-lg bg-[#11131C] border border-zinc-800 rounded-xl p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <Laptop className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <h2
                    id="pwa-install-dialog-title"
                    className="text-base font-bold text-zinc-100"
                  >
                    Install ChromaXMP as a Standalone PC Application
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Run ChromaXMP in its own native desktop window with offline support and
                    auto-saved local storage.
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close PC Install Dialog"
                onClick={() => setShowModal(false)}
                className="p-1 text-zinc-400 hover:text-zinc-100 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Method 1: Native Browser PWA Installation */}
            <div className="bg-[#090A0F] border border-zinc-800/90 rounded-lg p-3.5 flex flex-col gap-2.5">
              <div className="text-xs font-semibold text-zinc-100">
                01. Install Native Desktop PWA (Chrome, Edge, Brave)
              </div>
              {isInstallable ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-zinc-400">
                    Your browser is ready to install ChromaXMP directly to your Start Menu,
                    Desktop, and Taskbar.
                  </p>
                  <button
                    type="button"
                    onClick={install}
                    className="px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg whitespace-nowrap shrink-0"
                  >
                    Install ChromaXMP Now
                  </button>
                </div>
              ) : isIOS ? (
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Tap the <strong>Share</strong> button in Safari and select{' '}
                  <strong>Add to Home Screen</strong> to launch ChromaXMP as a standalone app.
                </p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {isInIframe
                      ? 'Because ChromaXMP is currently inside a preview frame, open it in a full browser tab first—then click the "Install ChromaXMP" monitor icon on the right side of your Chrome or Edge address bar.'
                      : 'Click the "Install ChromaXMP" monitor icon on the right side of your Chrome or Edge address bar (or open Browser Menu ⋮ → Cast, save, and share → Install page as app).'}
                  </p>
                  <div className="flex items-center gap-2">
                    <a
                      href={appUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open Full Window for 1-Click PWA Install</span>
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Method 2: Instant PC Desktop Launcher Script (.bat / .command) */}
            <div className="bg-[#090A0F] border border-zinc-800/90 rounded-lg p-3.5 flex flex-col gap-2.5">
              <div className="text-xs font-semibold text-zinc-100">
                02. Download Standalone Desktop Shortcut Launcher (Windows / macOS)
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Download a desktop launcher file to your PC. Double-clicking it opens ChromaXMP
                immediately in a dedicated, borderless native desktop window (`--app` mode) without
                browser tabs or address bars.
              </p>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleDownloadWindowsDesktopLauncher}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-100 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400" />
                  <span>Windows PC Launcher (.BAT)</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadMacDesktopLauncher}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-100 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400" />
                  <span>macOS App Launcher (.COMMAND)</span>
                </button>
              </div>

              {launcherDownloaded && (
                <div className="text-xs text-emerald-400 flex items-center gap-1.5 pt-1">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Downloaded {launcherDownloaded} — place it on your Desktop and double-click to
                    launch!
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-1 text-xs text-zinc-500">
              <span>Service Worker &amp; Offline Cache: Active</span>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-3.5 py-1.5 text-xs font-medium text-zinc-300 hover:text-white bg-zinc-800 rounded-lg"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
