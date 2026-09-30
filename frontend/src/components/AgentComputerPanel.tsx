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
  Play 
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

  if (!isOpen) return null;

  const handleRunTerminalCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalInput.trim()) return;
    const cmd = terminalInput.trim();
    setTerminalLogs((prev) => [
      ...prev,
      `$ ${cmd}`,
      `Executing in sandbox container (/workspace)...`,
      `Process completed with exit code 0.`
    ]);
    setTerminalInput('');
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
    <div className="w-96 border-l border-white/[0.08] bg-[#070709] flex flex-col h-full select-none shadow-2xl transition-all duration-200 z-30">
      {/* Header */}
      <div className="h-12 px-3 border-b border-white/[0.08] flex items-center justify-between bg-black/40">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold text-white tracking-tight">Agent Computer</span>
          <span className="text-[10px] text-zinc-500 font-mono">@{botName}</span>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-200 p-1 rounded-md hover:bg-white/[0.06] transition"
          title="Close Agent Computer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/[0.06] bg-[#0c0c10] p-1 gap-1">
        <button
          onClick={() => setActiveTab('browser')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition ${
            activeTab === 'browser'
              ? 'bg-white/[0.12] text-white shadow-xs'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>Browser</span>
        </button>
        <button
          onClick={() => setActiveTab('files')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition ${
            activeTab === 'files'
              ? 'bg-white/[0.12] text-white shadow-xs'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
          }`}
        >
          <FolderTree className="w-3.5 h-3.5" />
          <span>Files ({artifacts.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('terminal')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition ${
            activeTab === 'terminal'
              ? 'bg-white/[0.12] text-white shadow-xs'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Terminal</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* TAB 1: BROWSER */}
        {activeTab === 'browser' && (
          <div className="flex-1 flex flex-col p-3 space-y-3">
            {/* Address Bar */}
            <div className="flex items-center gap-1.5 bg-[#121217] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs">
              <RotateCw className="w-3 h-3 text-zinc-500 hover:text-zinc-300 cursor-pointer" />
              <input
                type="text"
                value={browserUrl}
                onChange={(e) => setBrowserUrl(e.target.value)}
                className="bg-transparent text-zinc-300 focus:outline-none flex-1 font-mono text-[11px]"
              />
              <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1 py-0.5 rounded font-mono">LIVE</span>
            </div>

            {/* Viewport Simulation */}
            <div className="flex-1 bg-black/60 border border-white/[0.08] rounded-xl overflow-hidden flex flex-col relative">
              <div className="h-6 bg-[#16161d] border-b border-white/[0.06] px-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500/80" />
                <span className="w-2 h-2 rounded-full bg-amber-500/80" />
                <span className="w-2 h-2 rounded-full bg-emerald-500/80" />
                <span className="text-[10px] text-zinc-400 ml-2 truncate">Chromium Session — Cloud VM</span>
              </div>
              <div className="flex-1 p-4 flex flex-col items-center justify-center text-center">
                <Globe className="w-10 h-10 text-cyan-400/40 mb-3 animate-pulse" />
                <h4 className="text-xs font-semibold text-zinc-200">Chromium Agent Automation</h4>
                <p className="text-[11px] text-zinc-500 mt-1 max-w-[220px]">
                  Bot navigates web targets with persistent authenticated cookies.
                </p>
                <div className="mt-4 flex flex-col gap-2 w-full max-w-[240px]">
                  <button
                    onClick={onTakeover}
                    className="flex items-center justify-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-medium py-1.5 rounded-lg transition"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                    <span>Human Takeover Mode</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[11px] text-zinc-400">
              <span className="font-semibold text-zinc-200">Session Cookies:</span> Saved across restarts. Sensitive passwords & 2FA automatically pause for takeover.
            </div>
          </div>
        )}

        {/* TAB 2: SHARED FILES */}
        {activeTab === 'files' && (
          <div className="flex-1 flex flex-col p-3 overflow-y-auto">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/[0.06]">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Shared Drive</span>
              <span className="text-[10px] text-zinc-500 font-mono">/sandboxes/shared</span>
            </div>

            {artifacts.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                <FolderTree className="w-8 h-8 text-zinc-600 mb-2" />
                <p className="text-xs text-zinc-500">No deliverables generated yet.</p>
                <p className="text-[11px] text-zinc-600 mt-1">Files created by any bot appear here.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {artifacts.map((art) => (
                  <div
                    key={art.id}
                    className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {getFileIcon(art.file_type)}
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
                        className="text-zinc-500 hover:text-white p-1 rounded hover:bg-white/[0.08] transition"
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
          <div className="flex-1 flex flex-col p-2.5 bg-black font-mono text-[11px] overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 text-zinc-400 select-text">
              {terminalLogs.map((log, i) => (
                <div key={i} className="leading-tight">
                  {log.startsWith('$') ? (
                    <span className="text-emerald-400 font-bold">{log}</span>
                  ) : log.includes('error') || log.includes('Error') ? (
                    <span className="text-rose-400">{log}</span>
                  ) : (
                    <span>{log}</span>
                  )}
                </div>
              ))}
            </div>

            {/* Command Input Bar */}
            <form onSubmit={handleRunTerminalCommand} className="mt-2 pt-2 border-t border-white/[0.08] flex items-center gap-1.5">
              <span className="text-emerald-400 font-bold">$</span>
              <input
                type="text"
                value={terminalInput}
                onChange={(e) => setTerminalInput(e.target.value)}
                placeholder="run bash command in container..."
                className="bg-transparent text-white focus:outline-none flex-1 text-[11px]"
              />
              <button
                type="submit"
                className="text-zinc-400 hover:text-white p-1 rounded hover:bg-white/[0.08]"
                title="Send Command"
              >
                <Play className="w-3 h-3 text-cyan-400" />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
