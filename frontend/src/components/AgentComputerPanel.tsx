import React, { useState, useEffect, useRef } from 'react';
import { 
  Globe, 
  FolderTree, 
  Terminal, 
  X, 
  RotateCw, 
  Download, 
  FileText, 
  FileSpreadsheet, 
  FileCode, 
  Image, 
  Play,
  ExternalLink,
  Lock,
  HardDrive,
  MousePointerClick,
  ArrowRight,
  Radio
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
  const [browserUrl, setBrowserUrl] = useState('https://www.google.com');
  const [browserTitle, setBrowserTitle] = useState('Google');
  const [isNavigating, setIsNavigating] = useState(false);
  const [liveScreenshot, setLiveScreenshot] = useState<string | null>(null);
  const [isTakeoverActive, setIsTakeoverActive] = useState(false);
  const [clickRipple, setClickRipple] = useState<{ x: number; y: number } | null>(null);
  const [typeInput, setTypeInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Teach Mode / Demonstration Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordedSteps, setRecordedSteps] = useState<Array<{ type: string; details: string; timestamp: string }>>([]);

  // Terminal state
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    `[AnyWork Cloud VM] Initializing dedicated container for @${botName}...`,
    `[AnyWork Cloud VM] Chromium headless instance ready with persistent session cookies.`,
    `[AnyWork Cloud VM] Mounted shared workspace volume at /workspace/shared.`,
    `[AnyWork Cloud VM] Python 3.12 sandbox loaded with data-science & automation libraries.`,
    `$ ready for tasks.`
  ]);
  const [isTerminalRunning, setIsTerminalRunning] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const pollTimerRef = useRef<any>(null);

  // Poll browser status and screenshots when browser tab is open
  useEffect(() => {
    if (!isOpen || activeTab !== 'browser') {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    const fetchBrowserState = async () => {
      try {
        const status = await api.getBrowserStatus();
        if (status.url && status.url !== 'about:blank') {
          setBrowserUrl(status.url);
          if (status.title) setBrowserTitle(status.title);
        }
        const shot = await api.getBrowserScreenshot();
        if (shot.screenshot) {
          setLiveScreenshot(shot.screenshot);
        }
      } catch {
        // Silent catch for initial warm-up
      }
    };

    fetchBrowserState();
    pollTimerRef.current = setInterval(fetchBrowserState, 3000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const handleNavigate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!browserUrl.trim() || isNavigating) return;
    setIsNavigating(true);

    if (isRecording) {
      setRecordedSteps((prev) => [
        ...prev,
        { type: 'navigate', details: `Navigate to ${browserUrl.trim()}`, timestamp: new Date().toLocaleTimeString() }
      ]);
    }

    try {
      const res = await api.navigateBrowser(browserUrl.trim());
      if (res.title) setBrowserTitle(res.title);
      if (res.url) setBrowserUrl(res.url);
      if (res.screenshot) {
        setLiveScreenshot(res.screenshot);
      }
    } catch (err: any) {
      console.error('Navigation error:', err);
    } finally {
      setIsNavigating(false);
    }
  };

  const handleViewportClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Visual ripple
    setClickRipple({ x: clickX, y: clickY });
    setTimeout(() => setClickRipple(null), 600);

    // Map viewport coordinates to 1280x800 Chromium canvas
    const scaleX = 1280 / rect.width;
    const scaleY = 800 / rect.height;
    const mappedX = Math.round(clickX * scaleX);
    const mappedY = Math.round(clickY * scaleY);

    if (isRecording) {
      setRecordedSteps((prev) => [
        ...prev,
        { type: 'click', details: `Click at (${mappedX}, ${mappedY})`, timestamp: new Date().toLocaleTimeString() }
      ]);
    }

    try {
      const res = await api.executeBrowserAction('click', { x: mappedX, y: mappedY });
      if (res.screenshot) {
        setLiveScreenshot(res.screenshot);
      }
    } catch (err) {
      console.error('Click action error:', err);
    }
  };

  const handleSendType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeInput.trim() || isTyping) return;
    setIsTyping(true);
    const textToType = typeInput;
    setTypeInput('');

    if (isRecording) {
      setRecordedSteps((prev) => [
        ...prev,
        { type: 'type', details: `Type "${textToType}"`, timestamp: new Date().toLocaleTimeString() }
      ]);
    }

    try {
      const res = await api.executeBrowserAction('type', { text: textToType });
      if (res.screenshot) {
        setLiveScreenshot(res.screenshot);
      }
    } catch (err) {
      console.error('Type error:', err);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = async (key: string) => {
    try {
      const res = await api.executeBrowserAction('press_key', { key });
      if (res.screenshot) {
        setLiveScreenshot(res.screenshot);
      }
    } catch (err) {
      console.error('Key error:', err);
    }
  };

  const handleRunTerminalCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalInput.trim() || isTerminalRunning) return;
    const cmd = terminalInput.trim();
    setTerminalInput('');
    setTerminalLogs((prev) => [...prev, `$ ${cmd}`]);
    setIsTerminalRunning(true);

    if (isRecording) {
      setRecordedSteps((prev) => [
        ...prev,
        { type: 'terminal', details: `Execute: ${cmd}`, timestamp: new Date().toLocaleTimeString() }
      ]);
    }

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
        if (res.stdout) next.push(res.stdout);
        if (res.stderr) next.push(`Error: ${res.stderr}`);
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
    <div className="w-[430px] border-l border-white/[0.08] bg-[#07070a] flex flex-col h-full select-none shadow-[0_0_50px_rgba(0,0,0,0.9)] transition-all duration-200 z-30">
      {/* Precision Header */}
      <div className="h-14 px-4 border-b border-white/[0.07] flex items-center justify-between bg-black/40 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)] animate-pulse" />
          <span className="text-xs font-semibold text-white tracking-tight">Agent Computer</span>
          <span className="text-[10px] text-zinc-400 font-mono bg-white/[0.06] px-1.5 py-0.5 rounded">@{botName}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Teach Mode Recording Button */}
          <button
            onClick={() => {
              setIsRecording(!isRecording);
              if (!isRecording) setRecordedSteps([]);
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition ${
              isRecording 
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse' 
                : 'bg-white/[0.04] text-zinc-400 hover:text-white border border-white/[0.06]'
            }`}
            title="Teach Mode: Record live user actions to save as a reusable skill"
          >
            <Radio className="w-3 h-3 text-rose-400" />
            <span>{isRecording ? 'Rec...' : 'Teach'}</span>
          </button>

          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-white/[0.06] transition"
            title="Close Agent Computer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
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
            <span>Live Browser</span>
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

      {/* Teach Recording Indicator Banner */}
      {isRecording && (
        <div className="px-3 py-1.5 bg-rose-950/40 border-b border-rose-500/30 flex items-center justify-between text-[11px] text-rose-300">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            <span>Recording Demonstration ({recordedSteps.length} steps)</span>
          </div>
          <button 
            onClick={() => {
              setIsRecording(false);
              alert(`Demonstration recorded with ${recordedSteps.length} actions. Ready to save as custom skill.`);
            }}
            className="text-[10px] font-semibold bg-rose-500/30 hover:bg-rose-500/50 text-white px-2 py-0.5 rounded transition"
          >
            Save Skill
          </button>
        </div>
      )}

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* TAB 1: LIVE CHROMIUM BROWSER */}
        {activeTab === 'browser' && (
          <div className="flex-1 flex flex-col p-3 space-y-2 overflow-hidden">
            {/* Address Bar */}
            <form onSubmit={handleNavigate} className="flex items-center gap-1.5 bg-[#121217] border border-white/[0.08] rounded-xl px-2.5 py-1.5 text-xs shadow-inner">
              <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
              <input
                type="text"
                value={browserUrl}
                onChange={(e) => setBrowserUrl(e.target.value)}
                placeholder="Enter URL..."
                className="bg-transparent text-zinc-200 focus:outline-none flex-1 font-mono text-[11px] truncate tracking-tight"
              />
              <button
                type="submit"
                disabled={isNavigating}
                className="text-zinc-400 hover:text-white p-0.5 rounded transition"
                title="Go"
              >
                {isNavigating ? <RotateCw className="w-3.5 h-3.5 animate-spin text-cyan-400" /> : <ArrowRight className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => window.open(browserUrl, '_blank')}
                className="text-zinc-400 hover:text-cyan-400 p-0.5 rounded transition"
                title="Open in Native Browser Window"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </form>

            {/* Quick Destination Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-[10px]">
              {[
                { name: 'Google', url: 'https://www.google.com' },
                { name: 'GitHub', url: 'https://github.com' },
                { name: 'X / Twitter', url: 'https://x.com' },
                { name: 'Notion', url: 'https://www.notion.so' },
                { name: 'HackerNews', url: 'https://news.ycombinator.com' }
              ].map((site) => (
                <button
                  key={site.name}
                  onClick={() => {
                    setBrowserUrl(site.url);
                    api.navigateBrowser(site.url).then((res) => {
                      if (res.screenshot) setLiveScreenshot(res.screenshot);
                      if (res.title) setBrowserTitle(res.title);
                    });
                  }}
                  className="px-2 py-0.5 bg-white/[0.04] hover:bg-white/[0.09] text-zinc-400 hover:text-white rounded-md border border-white/[0.06] shrink-0 transition"
                >
                  {site.name}
                </button>
              ))}
            </div>

            {/* Viewport: Live Chromium Screencast Canvas & Interactive Takeover */}
            <div className="flex-1 bg-black border border-white/[0.08] rounded-2xl overflow-hidden flex flex-col relative shadow-[inset_0_2px_12px_rgba(0,0,0,0.9)]">
              {/* Window Title Bar */}
              <div className="h-7 bg-[#14141a] border-b border-white/[0.06] px-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500/70" />
                  <span className="w-2 h-2 rounded-full bg-amber-500/70" />
                  <span className="w-2 h-2 rounded-full bg-emerald-500/70" />
                  <span className="text-[10px] text-zinc-300 ml-2 font-mono truncate max-w-[170px]">
                    {browserTitle}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-400 font-mono px-1.5 py-0.2 rounded border border-emerald-500/30">
                    CDP LIVE
                  </span>
                  <button
                    onClick={() => {
                      setIsTakeoverActive(!isTakeoverActive);
                      if (onTakeover) onTakeover();
                    }}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold transition ${
                      isTakeoverActive 
                        ? 'bg-amber-500 text-black shadow-xs' 
                        : 'bg-white/[0.08] text-amber-300 hover:bg-white/[0.15]'
                    }`}
                    title="Interactive Human Takeover"
                  >
                    <MousePointerClick className="w-3 h-3" />
                    <span>{isTakeoverActive ? 'Takeover Active' : 'Takeover'}</span>
                  </button>
                </div>
              </div>

              {/* Live Canvas / Screencast Container */}
              <div
                ref={viewportRef}
                onClick={handleViewportClick}
                className={`relative flex-1 w-full bg-[#0a0a0f] flex items-center justify-center overflow-hidden cursor-crosshair ${
                  isTakeoverActive ? 'ring-2 ring-amber-400/80 ring-inset' : ''
                }`}
              >
                {liveScreenshot ? (
                  <img
                    src={`data:image/jpeg;base64,${liveScreenshot}`}
                    alt="Agent Browser Screencast"
                    className="w-full h-full object-contain pointer-events-none select-none"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-6 space-y-2">
                    <Globe className="w-8 h-8 text-cyan-400 animate-pulse mb-1" />
                    <p className="text-xs font-semibold text-zinc-200">Chromium Agent Computer</p>
                    <p className="text-[11px] text-zinc-500 max-w-[220px]">
                      Ready. Enter a URL above or trigger an autonomous browsing task.
                    </p>
                    <button
                      onClick={() => handleNavigate()}
                      className="mt-2 text-xs font-medium text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 px-3 py-1.5 rounded-lg border border-cyan-500/25 transition"
                    >
                      Launch Browser
                    </button>
                  </div>
                )}

                {/* Click Ripple Indicator */}
                {clickRipple && (
                  <div
                    style={{ left: clickRipple.x - 12, top: clickRipple.y - 12 }}
                    className="absolute w-6 h-6 rounded-full bg-cyan-400/80 border-2 border-white shadow-[0_0_12px_rgba(34,211,238,0.9)] animate-ping pointer-events-none"
                  />
                )}
              </div>

              {/* Takeover Keyboard Bar */}
              {isTakeoverActive && (
                <div className="p-2 bg-[#101015] border-t border-amber-500/30 flex items-center gap-1.5">
                  <form onSubmit={handleSendType} className="flex-1 flex items-center gap-1.5">
                    <input
                      type="text"
                      value={typeInput}
                      onChange={(e) => setTypeInput(e.target.value)}
                      placeholder="Type into active element..."
                      className="bg-black/60 border border-white/[0.1] rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none flex-1 tracking-tight"
                    />
                    <button
                      type="submit"
                      disabled={!typeInput.trim() || isTyping}
                      className="bg-amber-400 text-black text-xs font-semibold px-2.5 py-1 rounded-lg hover:bg-amber-300 transition shrink-0"
                    >
                      Send
                    </button>
                  </form>
                  <button
                    onClick={() => handleKeyPress('Enter')}
                    className="bg-white/[0.08] hover:bg-white/[0.15] text-zinc-200 text-[10px] font-mono px-2 py-1 rounded-md transition"
                  >
                    Enter
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono px-1">
              <span>Persistent Profile: <b>/data/browser_profile</b></span>
              <span className="text-emerald-400">Cookies & Logins Persisted</span>
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

            {/* Quick Command Suggestions */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-1 border-t border-white/[0.06] text-[10px]">
              {['ls -la', 'python --version', 'node --version', 'df -h'].map((cmd) => (
                <button
                  key={cmd}
                  onClick={() => setTerminalInput(cmd)}
                  className="px-2 py-0.5 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-white rounded border border-white/[0.06] shrink-0 transition"
                >
                  {cmd}
                </button>
              ))}
            </div>

            {/* Command Input Bar */}
            <form onSubmit={handleRunTerminalCommand} className="mt-1 pt-1 border-t border-white/[0.08] flex items-center gap-2">
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
