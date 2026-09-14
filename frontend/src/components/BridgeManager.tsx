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
    return () => { ignore = true; };
  }, [activeSessionId]);

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolder.trim()) return;
    setIsLoading(true);
    try {
      await api.grantFolder(newFolder.trim(), activeSessionId);
      if (activeSessionId) await api.updateSessionPermission(activeSessionId, 'grant', 'folder', newFolder.trim());
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
    await api.toggleBrowser(!status?.allow_browser_control, activeSessionId);
    await loadStatus();
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      <div className="flex items-center justify-between pb-6 border-b border-[#30363d] mb-6">
        <div>
          <div className="flex items-center space-x-2">
            <HardDrive className="w-6 h-6 text-emerald-400" />
            <h2 className="text-xl font-bold text-white tracking-wide">Local Desktop Bridge</h2>
          </div>
          <p className="text-xs text-gray-400 mt-1 max-w-xl">
            The lightweight companion desktop process lets Coagent safely access specific folders and browser control on your computer.
            Never blanket OS access — grants are strictly scoped and instantly revocable.
          </p>
        </div>

        <div className="flex items-center space-x-2 bg-[#161b22] px-3 py-1.5 rounded-lg border border-[#30363d]">
          <span className={`w-2.5 h-2.5 rounded-full ${status?.is_connected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          <span className="text-xs font-medium text-white">
            {status?.is_connected ? 'Bridge Connected' : 'Bridge Offline'}
          </span>
        </div>
      </div>

      {/* Security Rule Card */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 mb-6">
        <div className="flex items-start space-x-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs text-gray-300 space-y-1">
            <h4 className="font-semibold text-white">Scoped Access Security Policy</h4>
            <p className="text-gray-400 leading-relaxed">
              The agent runs inside an isolated sandbox. It communicates through authenticated session tokens to read only files inside your explicitly granted folders.
              Any attempt to access parent directories or out-of-scope paths is immediately blocked and logged to the tamper-evident audit trail.
            </p>
          </div>
        </div>
      </div>

      {/* Add Folder Grant Form */}
      <form onSubmit={handleGrant} className="flex items-center space-x-2 mb-6">
        <input
          type="text"
          value={newFolder}
          onChange={(e) => setNewFolder(e.target.value)}
          placeholder="Enter absolute folder path (e.g. D:/Downloads or C:/Users/Docs/Receipts)..."
          className="flex-1 bg-[#161b22] border border-[#30363d] rounded-lg p-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 font-mono"
        />
        <button
          type="submit"
          disabled={!newFolder.trim() || isLoading}
          className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-semibold py-2.5 px-4 rounded-lg transition"
        >
          <FolderPlus className="w-4 h-4" />
          <span>Grant Scope</span>
        </button>
      </form>

      {/* Granted Folders List */}
      <div className="space-y-2.5 mb-8">
        <div className="text-xs font-semibold uppercase text-gray-500 tracking-wider">
          Currently Granted Folders
        </div>
        {!status?.granted_folders || status.granted_folders.length === 0 ? (
          <div className="p-4 bg-[#161b22] rounded-xl border border-[#30363d] text-xs text-gray-500 italic">
            No folders currently granted. Agent has zero access to local filesystem.
          </div>
        ) : (
          status.granted_folders.map((folder, idx) => (
            <div
              key={idx}
              className="bg-[#161b22] border border-[#30363d] p-3 rounded-lg flex items-center justify-between group"
            >
              <div className="flex items-center space-x-2.5 font-mono text-xs text-white">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{folder}</span>
              </div>
              <button
                onClick={() => handleRevoke(folder)}
                className="text-xs text-rose-400 hover:text-rose-300 font-medium px-2 py-1 rounded hover:bg-rose-950/30 transition flex items-center space-x-1"
                title="Revoke folder access"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Revoke</span>
              </button>
            </div>
          ))
        )}
      </div>

      {/* Scoped Browser Control */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Globe className="w-5 h-5 text-indigo-400" />
          <div>
            <h4 className="text-xs font-semibold text-white">Scoped Browser Automation</h4>
            <p className="text-[11px] text-gray-400">Allows agent to browse research sites with automatic handover at login/checkout.</p>
          </div>
        </div>
        <button
          onClick={handleBrowserToggle}
          className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${status?.allow_browser_control ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 'text-gray-400 bg-gray-500/10 border-gray-500/30'}`}
        >
          {status?.allow_browser_control ? 'Granted' : 'Off'}
        </button>
      </div>
    </div>
  );
};
