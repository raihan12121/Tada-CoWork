import React, { useState } from 'react';
import { 
  Globe, 
  FolderTree, 
  Terminal, 
  X, 
  RotateCw, 
  ShieldAlert, 
  Download, 
  FileText, 
  FileSpreadsheet, 
  FileCode, 
  Image, 
  Play,
  ExternalLink,
  Lock,
  HardDrive
} from 'lucide-react';
import type { Artifact } from '../types';
import { api } from '../services/api';

interface AgentComputerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  botName: string;
  artifacts: Artifact[];
  activeSessionId?: string;
  onTakeover?: () => void;
}

export const AgentComputerPanel: React.FC<AgentComputerPanelProps> = ({
  isOpen,
  onClose,
  botName,
  artifacts,
  activeSessionId,
  onTakeover
}) => {
  const [activeTab, setActiveTab] = useState<'browser' | 'files' | 'terminal'>('browser');
  const [browserUrl, setBrowserUrl] = useState('https://app.anywork.internal/workspace');
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    `[AnyWork Cloud VM] Initializing dedicated container for @${botName}...`,
    `[AnyWork Cloud VM] Chromium headless instance ready with persistent session cookies.`,
    `[AnyWork Cloud VM] Mounted shared workspace volume at /workspace/shared.`,
    `[AnyWork Cloud VM] Python 3.12 sandbox loaded with data-science & automation libraries.`,
    `$ ready for tasks.`
  ]);

  const [isTerminalRunning, setIsTerminalRunning] = useState(false);

  if (!isOpen) return null;

  const handleRunTerminalCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalInput.trim() || isTerminalRunning) return;
    const cmd = terminalInput.trim();
    setTerminalInput('');
    setTerminalLogs((prev) => [...prev, `$ ${cmd}`]);
    setIsTerminalRunning(true);

    try {
      if (!activeSessionId) {
        setTerminalLogs((prev) => [
          ...prev,
          `[Warning] No active session. Start a task or select a bot first to initialize a dedicated sandbox.`
        ]);
        return;
      }
      const res = await api.executeTerminalCommand(activeSessionId, cmd);
      setTerminalLogs((prev) => {
        const next = [...prev];
        if (res.stdout) {
          next.push(res.stdout);
        }
        if (res.stderr) {
          next.push(`Error: ${res.stderr}`);
        }
        next.push(`[Process finished with exit code ${res.exit_code} (${res.execution_time_ms}ms)]`);
        return next;
      });
    } catch (err: any) {
      setTerminalLogs((prev) => [
        ...prev,
        `Execution error: ${err.message || 'Unknown network error'}`
      ]);
    } finally {
      setIsTerminalRunning(false);
    }
  };

  const getFileIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'xlsx':
      case 'csv':
        return <FileSpreadsheet className="w-4 h-4 text-emerald-400" />;
      case 'py':
      case 'js':
      case 'ts':
      case 'json':
        return <FileCode className="w-4 h-4 text-cyan-400" />;
      case 'png':
      case 'jpg':
      case 'svg':
        return <Image className="w-4 h-4 text-purple-400" />;
      default:
        return <FileText className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <div className="w-96 border-l border-white/[0.08] bg-[#07070a] flex flex-col h-full select-none shadow-[0_0_40px_rgba(0,0,0,0.8)] transition-all duration-200 z-30">
      {/* Precision Header */}
      <div className="h-14 px-4 border-b border-white/[0.07] flex items-center justify-between bg-black/40 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)] animate-pulse" />
          <span className="text-xs font-semibold text-white tracking-tight">Agent Computer</span>
          <span className="text-[10px] text-zinc-400 font-mono bg-white/[0.06] px-1.5 py-0.5 rounded">@{botName}</span>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-white/[0.06] transition"
          title="Close Agent Computer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Segmented Obsidian Tabs */}
      <div className="p-2 border-b border-white/[0.06] bg-[#0a0a0e]">
        <div className="flex bg-[#121217] p-1 rounded-xl border border-white/[0.06] gap-1">
          <button
            onClick={() => setActiveTab('browser')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition duration-150 ${
              activeTab === 'browser'
                ? 'bg-white/[0.14] text-white shadow-xs border border-white/10'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Browser</span>
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition duration-150 ${
              activeTab === 'files'
                ? 'bg-white/[0.14] text-white shadow-xs border border-white/10'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span>Files ({artifacts.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('terminal')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition duration-150 ${
              activeTab === 'terminal'
                ? 'bg-white/[0.14] text-white shadow-xs border border-white/10'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Terminal</span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* TAB 1: BROWSER */}
        {activeTab === 'browser' && (
          <div className="flex-1 flex flex-col p-3 space-y-3 overflow-hidden">
            {/* Address Bar */}
            <div className="flex items-center gap-2 bg-[#121217] border border-white/[0.08] rounded-xl px-2.5 py-1.5 text-xs shadow-inner">
              <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
              <input
                type="text"
                value={browserUrl}
                onChange={(e) => setBrowserUrl(e.target.value)}
                className="bg-transparent text-zinc-200 focus:outline-none flex-1 font-mono text-[11px] truncate tracking-tight"
              />
              <button
                onClick={() => window.open(browserUrl, '_blank')}
                className="text-zinc-400 hover:text-cyan-400 p-0.5 rounded transition"
                title="Open in Native Browser Window"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
              <span className="text-[9px] bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-semibold">LIVE</span>
            </div>

            {/* Viewport: Live Preview or Direct Human Takeover */}
            <div className="flex-1 bg-black/60 border border-white/[0.08] rounded-2xl overflow-hidden flex flex-col relative shadow-[inset_0_2px_8px_rgba(0,0,0,0.8)]">
              <div className="h-7 bg-[#14141a] border-b border-white/[0.06] px-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500/70" />
                  <span className="w-2 h-2 rounded-full bg-amber-500/70" />
                  <span className="w-2 h-2 rounded-full bg-emerald-500/70" />
                  <span className="text-[10px] text-zinc-400 ml-2 font-mono">Chromium Sandbox</span>
                </div>
                <button
                  onClick={() => window.open(browserUrl, '_blank')}
                  className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 transition"
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                  <span>Pop out</span>
                </button>
              </div>

              {browserUrl.startsWith('http') && !browserUrl.includes('internal') ? (
                <iframe
                  src={browserUrl}
                  title="Browser Viewport"
                  className="w-full flex-1 border-0 bg-white"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              ) : (
                <div className="flex-1 p-5 flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-3">
                    <Globe className="w-6 h-6 text-cyan-400 animate-pulse" />
                  </div>
                  <h4 className="text-xs font-semibold text-zinc-200">Chromium Agent Sandbox</h4>
                  <p className="text-[11px] text-zinc-400 mt-1 max-w-[240px] leading-relaxed">
                    Browser automation running in isolated container with persistent session cookies.
                  </p>
                  <div className="mt-4 flex flex-col gap-2 w-full max-w-[240px]">
                    <button
                      onClick={onTakeover || (() => window.open(browserUrl, '_blank'))}
                      className="flex items-center justify-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-medium py-2 rounded-xl transition shadow-xs pressable"
                    >
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                      <span>Take Over Browser Session</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-[11px] text-zinc-400">
              <span className="font-semibold text-zinc-200">Session Cookies:</span> Persisted across restarts. Multi-factor logins, 2FA, & CAPTCHAs trigger human takeover alert.
            </div>
          </div>
        )}

        {/* TAB 2: SHARED FILES */}
        {activeTab === 'files' && (
          <div className="flex-1 flex flex-col p-3 overflow-y-auto">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/[0.06]">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold flex items-center gap-1.5">
                <HardDrive className="w-3 h-3 text-cyan-400" />
                <span>Shared Workspace Drive</span>
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">/workspace/shared</span>
            </div>

            {artifacts.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 my-auto">
                <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-3">
                  <FolderTree className="w-6 h-6 text-zinc-500" />
                </div>
                <p className="text-xs font-medium text-zinc-300">No deliverables generated yet</p>
                <p className="text-[11px] text-zinc-500 mt-1 max-w-[200px]">
                  Files created by any specialist bot during autonomous runs appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {artifacts.map((art) => (
                  <div
                    key={art.id}
                    className="p-2.5 rounded-xl bg-[#111116] border border-white/[0.07] hover:border-white/[0.14] hover:bg-[#16161d] transition flex items-center justify-between group shadow-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center shrink-0">
                        {getFileIcon(art.file_type)}
                      </div>
                      <div className="truncate">
                        <p className="text-xs text-zinc-200 font-medium truncate">{art.name}</p>
                        <p className="text-[10px] text-zinc-500 font-mono">
                          {(art.file_size_bytes / 1024).toFixed(1)} KB · v{art.version}
                        </p>
                      </div>
                    </div>
                    {activeSessionId && (
                      <a
                        href={api.getArtifactDownloadUrl(activeSessionId, art.name)}
                        download
                        className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.08] transition pressable"
                        title="Download file"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: TERMINAL */}
        {activeTab === 'terminal' && (
          <div className="flex-1 flex flex-col p-3 bg-[#040406] font-mono text-[11px] overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 text-zinc-400 select-text leading-relaxed">
              {terminalLogs.map((log, i) => (
                <div key={i}>
                  {log.startsWith('$') ? (
                    <span className="text-emerald-400 font-semibold">{log}</span>
                  ) : log.includes('Error') || log.includes('error') ? (
                    <span className="text-rose-400">{log}</span>
                  ) : log.includes('[Process finished') ? (
                    <span className="text-cyan-400 text-[10px]">{log}</span>
                  ) : (
                    <span>{log}</span>
                  )}
                </div>
              ))}
            </div>

            {/* Command Input Bar */}
            <form onSubmit={handleRunTerminalCommand} className="mt-2 pt-2 border-t border-white/[0.08] flex items-center gap-2">
              <span className="text-emerald-400 font-bold">$</span>
              <input
                type="text"
                value={terminalInput}
                disabled={isTerminalRunning}
                onChange={(e) => setTerminalInput(e.target.value)}
                placeholder={isTerminalRunning ? "Executing command in container..." : "run bash command in container..."}
                className="bg-transparent text-white focus:outline-none flex-1 text-[11px] disabled:opacity-50 tracking-tight"
              />
              <button
                type="submit"
                disabled={isTerminalRunning || !terminalInput.trim()}
                className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.08] disabled:opacity-30 disabled:pointer-events-none transition"
                title="Send Command"
              >
                {isTerminalRunning ? (
                  <RotateCw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 text-cyan-400" />
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
