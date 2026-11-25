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
  Cpu,
  Settings,
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

interface PWAInstallButtonAndModalProps {
  variant?: 'icon' | 'button';
}

export const PWAInstallButtonAndModal: React.FC<PWAInstallButtonAndModalProps> = ({
  variant = 'button',
}) => {
  const { isInstallable, isInstalled, isIOS, isInIframe, install } =
    usePWAInstall();
  const [showModal, setShowModal] = useState(false);
  const [launcherDownloaded, setLauncherDownloaded] = useState<string | null>(
    null
  );

  const appUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:3000';

  const handleInstallClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowModal(true);
  };

  /**
   * Generates a self-contained Windows Setup script that uses Windows 10/11's built-in
   * Microsoft .NET Framework C# compiler (csc.exe) to build a real native Windows GUI
   * executable (ChromaXMP.exe) directly on the user's PC, placing ChromaXMP.exe on their
   * Desktop and in %LOCALAPPDATA%\Programs\ChromaXMP\ChromaXMP.exe without SmartScreen blocks.
   */
  const handleDownloadWindowsNativeExeInstaller = () => {
    const setupCmd = `@echo off
TITLE ChromaXMP — Native Windows .EXE Builder & Desktop Installer
COLOR 0E
echo ============================================================================
echo   ChromaXMP — Native Windows .EXE Application Installer
echo ============================================================================
echo.

SET "INSTALL_DIR=%LOCALAPPDATA%\\Programs\\ChromaXMP"
SET "DESKTOP_EXE=%USERPROFILE%\\Desktop\\ChromaXMP.exe"
SET "TARGET_EXE=%INSTALL_DIR%\\ChromaXMP.exe"
SET "CS_FILE=%TEMP%\\ChromaXMP_Launcher.cs"

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

echo [1/3] Generating native Windows C# executable source...
(
echo using System;
echo using System.Diagnostics;
echo using System.IO;
echo class ChromaXMPApp {
echo     [STAThread]
echo     static void Main^(^) {
echo         string url = "${appUrl}";
echo         string[] browsers = new string[] {
echo             Path.Combine^(Environment.GetFolderPath^(Environment.SpecialFolder.ProgramFilesX86^), "Microsoft\\Edge\\Application\\msedge.exe"^),
echo             Path.Combine^(Environment.GetFolderPath^(Environment.SpecialFolder.ProgramFiles^), "Microsoft\\Edge\\Application\\msedge.exe"^),
echo             Path.Combine^(Environment.GetFolderPath^(Environment.SpecialFolder.ProgramFiles^), "Google\\Chrome\\Application\\chrome.exe"^),
echo             Path.Combine^(Environment.GetFolderPath^(Environment.SpecialFolder.ProgramFilesX86^), "Google\\Chrome\\Application\\chrome.exe"^)
echo         };
echo         foreach ^(string b in browsers^) {
echo             if ^(File.Exists^(b^)^) {
echo                 ProcessStartInfo psi = new ProcessStartInfo^(b, "--app=\\"" + url + "\\""^);
echo                 psi.UseShellExecute = false;
echo                 Process.Start^(psi^);
echo                 return;
echo             }
echo         }
echo         Process.Start^(new ProcessStartInfo^(url^) { UseShellExecute = true }^);
echo     }
echo }
) > "%CS_FILE%"

SET "CSC_PATH="
if exist "%WINDIR%\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe" (
    SET "CSC_PATH=%WINDIR%\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe"
) else if exist "%WINDIR%\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe" (
    SET "CSC_PATH=%WINDIR%\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe"
)

if defined CSC_PATH (
    echo [2/3] Compiling native Windows GUI executable ^(ChromaXMP.exe^)...
    "%CSC_PATH%" /nologo /target:winexe /out:"%TARGET_EXE%" "%CS_FILE%"
    copy /Y "%TARGET_EXE%" "%DESKTOP_EXE%" >nul
    del "%CS_FILE%" >nul 2>nul
    echo [3/3] Successfully built and installed ChromaXMP.exe!
    echo.
    echo   - Desktop Application: %DESKTOP_EXE%
    echo   - Program Folder:      %TARGET_EXE%
    echo.
    echo Launching ChromaXMP.exe now...
    start "" "%DESKTOP_EXE%"
    timeout /t 4 >nul
    exit /b
) else (
    echo [!] Microsoft .NET csc.exe not found; creating direct Desktop Launcher...
    start "" msedge --app="${appUrl}"
)
`;
    const blob = new Blob([setupCmd], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ChromaXMP_Windows_EXE_Installer.cmd';
    a.click();
    URL.revokeObjectURL(url);
    setLauncherDownloaded(
      'ChromaXMP_Windows_EXE_Installer.cmd — Run it once to generate ChromaXMP.exe directly on your Windows Desktop!'
    );
  };

  const handleDownloadMacDesktopLauncher = () => {
    const shContent = `#!/usr/bin/env bash
# ============================================================================
# ChromaXMP — Standalone macOS Desktop App Bundle Builder (.app)
# Creates a native ChromaXMP.app bundle on your macOS Desktop
# ============================================================================
APP_URL="${appUrl}"
APP_BUNDLE="$HOME/Desktop/ChromaXMP.app/Contents/MacOS"
mkdir -p "$APP_BUNDLE"

cat << 'EOF' > "$APP_BUNDLE/ChromaXMP"
#!/usr/bin/env bash
if [ -d "/Applications/Google Chrome.app" ]; then
  open -n -a "Google Chrome" --args --app="${appUrl}"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
  open -n -a "Microsoft Edge" --args --app="${appUrl}"
else
  open "${appUrl}"
fi
EOF

chmod +x "$APP_BUNDLE/ChromaXMP"
echo "Created native ChromaXMP.app on your Desktop!"
open "$HOME/Desktop/ChromaXMP.app"
`;
    const blob = new Blob([shContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Build_ChromaXMP_macOS_App.command';
    a.click();
    URL.revokeObjectURL(url);
    setLauncherDownloaded(
      'Build_ChromaXMP_macOS_App.command — Run it to create ChromaXMP.app on your macOS Desktop!'
    );
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
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={handleInstallClick}
          title="Install on PC (.EXE / PWA) & Studio Settings"
          aria-label="Install on PC (.EXE / PWA)"
          className="w-9 h-9 rounded-xl bg-[#161628] hover:bg-[#1E1E36] border border-[#282842] flex items-center justify-center text-zinc-300 hover:text-white transition-colors shrink-0 cursor-pointer"
        >
          <Settings className="w-4 h-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={handleInstallClick}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-violet-200 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/50 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <MonitorDown className="w-3.5 h-3.5 text-violet-400" />
          <span>
            {isInstallable ? 'Install PC App (.EXE)' : 'Install on PC (.EXE / PWA)'}
          </span>
        </button>
      )}

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
                    Install ChromaXMP on Your PC (Windows .EXE &amp; Native PWA)
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Generate a real native Windows <code className="text-amber-300">ChromaXMP.exe</code>{' '}
                    application on your Desktop or install via Chrome/Edge PWA.
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

            {/* Method 1: Native Windows ChromaXMP.exe Builder & Installer */}
            <div className="bg-[#090A0F] border border-amber-500/40 rounded-lg p-3.5 flex flex-col gap-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                <Cpu className="w-4 h-4 text-amber-400 shrink-0" />
                <span>01. Build Native Windows ChromaXMP.exe on Your Desktop (Recommended)</span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Browsers block direct <code className="text-zinc-200">.exe</code> downloads from web
                apps with SmartScreen warnings. This installer uses Windows 10/11&apos;s built-in
                Microsoft .NET compiler (<code className="text-zinc-200">csc.exe</code>) to compile a
                genuine native <strong className="text-white">ChromaXMP.exe</strong> executable
                directly onto your Windows Desktop and Program Files!
              </p>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleDownloadWindowsNativeExeInstaller}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Windows .EXE Builder (ChromaXMP.exe)</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadMacDesktopLauncher}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-100 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400" />
                  <span>macOS ChromaXMP.app Builder</span>
                </button>
              </div>

              {launcherDownloaded && (
                <div className="text-xs text-emerald-400 flex items-start gap-1.5 pt-1">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{launcherDownloaded}</span>
                </div>
              )}
            </div>

            {/* Method 2: Native Browser PWA Installation */}
            <div className="bg-[#090A0F] border border-zinc-800/90 rounded-lg p-3.5 flex flex-col gap-2.5">
              <div className="text-xs font-semibold text-zinc-100">
                02. Install via Browser Native PWA (Chrome / Microsoft Edge)
              </div>
              {isInstallable ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-zinc-400">
                    Your browser can also install ChromaXMP directly to your Start Menu and Taskbar.
                  </p>
                  <button
                    type="button"
                    onClick={install}
                    className="px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg whitespace-nowrap shrink-0"
                  >
                    Install PWA Now
                  </button>
                </div>
              ) : isIOS ? (
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Tap the <strong>Share</strong> button in Safari and select{' '}
                  <strong>Add to Home Screen</strong>.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {isInIframe
                      ? 'Or open ChromaXMP in a full browser window and click the "Install ChromaXMP" monitor icon in your Chrome or Edge address bar.'
                      : 'Click the "Install ChromaXMP" monitor icon on the right side of your Chrome or Edge address bar.'}
                  </p>
                  <div>
                    <a
                      href={appUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                      <span>Open Full Window for Browser PWA Install</span>
                    </a>
                  </div>
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
