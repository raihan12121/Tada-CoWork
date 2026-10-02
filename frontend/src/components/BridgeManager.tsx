import React, { useState, useEffect } from 'react';
import { 
  HardDrive, 
  FolderPlus, 
  Trash2, 
  ShieldCheck, 
  Globe, 
  CheckCircle2
} from 'lucide-react';
import type { BridgeStatus } from '../types';
import { api } from '../services/api';

export const BridgeManager: React.FC<{ activeSessionId?: string }> = ({ activeSessionId }) => {
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [newFolder, setNewFolder] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [domains, setDomains] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadStatus = async () => {
    try {
      const data = await api.getBridgeStatus(activeSessionId);
      setStatus(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    let ignore = false;
    api.getBridgeStatus(activeSessionId).then((data) => {
      if (!ignore) setStatus(data);
    }).catch(console.error);
    if (activeSessionId) {
      api.getSession(activeSessionId).then((session) => {
        if (!ignore) setDomains(session.granted_domains || []);
      }).catch(console.error);
    } else {
      Promise.resolve().then(() => {
        if (!ignore) setDomains([]);
      });
    }
    return () => { ignore = true; };
  }, [activeSessionId]);

  const handleGrantDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSessionId || !newDomain.trim()) return;
    const value = newDomain.trim().toLowerCase();
    const session = await api.updateSessionPermission(activeSessionId, 'grant', 'domain', value);
    setDomains(session.granted_domains || []);
    setNewDomain('');
  };

  const handleRevokeDomain = async (domain: string) => {
    if (!activeSessionId) return;
    const session = await api.updateSessionPermission(activeSessionId, 'revoke', 'domain', domain);
    setDomains(session.granted_domains || []);
  };

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolder.trim()) return;
    setIsLoading(true);
    try {
      await api.grantFolder(newFolder.trim(), activeSessionId);
      if (activeSessionId) {
        await api.updateSessionPermission(activeSessionId, 'grant', 'folder', newFolder.trim());
        await api.updateSessionPermission(activeSessionId, 'grant', 'scope', 'bridge:files');
      }
      setNewFolder('');
      await loadStatus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevoke = async (folder: string) => {
    await api.revokeFolder(folder, activeSessionId);
    if (activeSessionId) await api.updateSessionPermission(activeSessionId, 'revoke', 'folder', folder);
    await loadStatus();
  };

  const handleBrowserToggle = async () => {
    const enabled = !status?.allow_browser_control;
    await api.toggleBrowser(enabled, activeSessionId);
    if (activeSessionId) await api.updateSessionPermission(activeSessionId, enabled ? 'grant' : 'revoke', 'scope', 'browser:control');
    await loadStatus();
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      <div className="flex flex-wrap items-center justify-between pb-6 border-b border-white/[0.08] mb-6 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Local Desktop Bridge</h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1 max-w-xl">
            Companion native bridge enabling secure access to explicitly granted directories and browser automations. 
            Zero ambient privileges — permissions are strictly scoped and instantly revocable.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-[#09090c] px-3.5 py-1.5 rounded-xl border border-white/[0.08]">
          <span className={`w-2 h-2 rounded-full ${status?.is_connected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-rose-400'}`} />
          <span className="text-xs font-mono text-zinc-200">
            {status?.is_connected ? 'Bridge Connected' : 'Bridge Offline'}
          </span>
        </div>
      </div>

      {/* Security Rule Card */}
      <div className="bg-[#09090c] border border-white/[0.08] rounded-2xl p-4 mb-6 shadow-sm">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs text-zinc-300 space-y-1">
            <h4 className="font-semibold text-white">Scoped Access Security Policy</h4>
            <p className="text-zinc-400 leading-relaxed">
              The agent runs inside an isolated sandbox. It communicates through authenticated session tokens to access only files inside your explicitly granted folders.
              Any attempt to access parent directories or out-of-scope paths is immediately blocked and recorded to the tamper-evident audit log.
            </p>
          </div>
        </div>
      </div>

      {/* Add Folder Grant Form */}
      <form onSubmit={handleGrant} className="flex items-center gap-2 mb-6">
        <input
          type="text"
          value={newFolder}
          onChange={(e) => setNewFolder(e.target.value)}
          placeholder="Enter absolute folder path (e.g. D:/Downloads or C:/Users/Documents)..."
          className="flex-1 bg-[#121215] border border-white/[0.1] rounded-xl p-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/30 font-mono"
        />
        <button
          type="submit"
          disabled={!newFolder.trim() || isLoading}
          className="inline-flex items-center gap-1.5 bg-white text-black hover:bg-zinc-200 disabled:opacity-30 text-xs font-semibold py-2.5 px-4 rounded-xl transition shadow"
        >
          <FolderPlus className="w-4 h-4 stroke-[2.5]" />
          <span>Grant Folder</span>
        </button>
      </form>

      {/* Granted Folders List */}
      <div className="space-y-2 mb-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1 px-1">
          Currently Granted Folders
        </div>
        {!status?.granted_folders || status.granted_folders.length === 0 ? (
          <div className="p-4 bg-[#09090c] rounded-2xl border border-white/[0.08] text-xs text-zinc-600 italic">
            No folders currently granted. Agent has zero access to local filesystem.
          </div>
        ) : (
          status.granted_folders.map((folder, idx) => (
            <div
              key={idx}
              className="bg-[#09090c] border border-white/[0.08] p-3 rounded-xl flex items-center justify-between group shadow-sm"
            >
              <div className="flex items-center gap-2.5 font-mono text-xs text-zinc-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{folder}</span>
              </div>
              <button
                onClick={() => handleRevoke(folder)}
                className="text-xs text-rose-400 hover:text-rose-300 font-medium px-2 py-1 rounded-lg hover:bg-rose-950/40 transition flex items-center gap-1 font-mono"
                title="Revoke folder access"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Revoke</span>
              </button>
            </div>
          ))
        )}
      </div>

      {/* Web Domain Grants */}
      <div className="bg-[#09090c] border border-white/[0.08] rounded-2xl p-4 mb-6 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <Globe className="w-5 h-5 text-cyan-400" />
          <div>
            <h4 className="text-xs font-semibold text-white">Web Domain Grants</h4>
            <p className="text-[11px] text-zinc-400">Web requests for the active session are restricted to these domains.</p>
          </div>
        </div>
        <form onSubmit={handleGrantDomain} className="flex items-center gap-2 mb-3">
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="e.g. github.com, x.com, news.ycombinator.com"
            disabled={!activeSessionId}
            className="flex-1 bg-[#121215] border border-white/[0.1] rounded-xl p-2 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-white/30 disabled:opacity-40"
          />
          <button 
            type="submit" 
            disabled={!activeSessionId || !newDomain.trim()} 
            className="bg-white text-black hover:bg-zinc-200 disabled:opacity-40 text-xs font-semibold px-3.5 py-2 rounded-xl transition"
          >
            Grant Domain
          </button>
        </form>
        <div className="flex flex-wrap gap-2">
          {domains.length === 0 ? (
            <span className="text-xs text-zinc-600 italic">No domains granted for this session.</span>
          ) : (
            domains.map((domain) => (
              <button 
                key={domain} 
                onClick={() => handleRevokeDomain(domain)} 
                className="text-xs font-mono text-cyan-300 bg-white/[0.05] border border-white/[0.08] rounded-lg px-2.5 py-1 hover:bg-rose-950/40 hover:text-rose-300 transition" 
                title="Revoke domain grant"
              >
                {domain} ×
              </button>
            ))
          )}
        </div>
      </div>

      {/* Scoped Browser Control */}
      <div className="bg-[#09090c] border border-white/[0.08] rounded-2xl p-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Globe className="w-5 h-5 text-cyan-400" />
          <div>
            <h4 className="text-xs font-semibold text-white">Scoped Browser Automation</h4>
            <p className="text-[11px] text-zinc-400">Allows agent to browse research sites with automatic handover at login/checkout.</p>
          </div>
        </div>
        <button
          onClick={handleBrowserToggle}
          className={`text-xs font-semibold px-3 py-1 rounded-full border transition ${
            status?.allow_browser_control 
              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' 
              : 'text-zinc-500 bg-white/[0.04] border-white/[0.08]'
          }`}
        >
          {status?.allow_browser_control ? 'Granted' : 'Off'}
        </button>
      </div>
    </div>
  );
};
