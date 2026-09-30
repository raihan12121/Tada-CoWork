import React, { useEffect, useState } from 'react';
import { KeyRound, RefreshCw, Server, CheckCircle2, AlertCircle, Trash2, Play, Blocks, Globe, Plus } from 'lucide-react';
import { api } from '../services/api';
import type { ProviderAccount } from '../services/api';
import type { McpServer } from '../types';

type Provider = 'openai' | 'openai_codex' | 'anthropic' | 'anthropic_claude' | 'gemini' | 'ollama' | 'lm_studio' | 'offline_heuristic';

export const ProviderSettings: React.FC = () => {
  const [provider, setProvider] = useState<Provider>('offline_heuristic');
  const [apiKey, setApiKey] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [model, setModel] = useState('');
  const [label, setLabel] = useState('My provider');
  const [accounts, setAccounts] = useState<ProviderAccount[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);

  // MCP Servers
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [mcpName, setMcpName] = useState('');
  const [mcpUrl, setMcpUrl] = useState('');
  const [mcpAuthToken, setMcpAuthToken] = useState('');
  const [showAddMcp, setShowAddMcp] = useState(false);

  const refresh = async () => { 
    try { 
      setAccounts(await api.listProviderAccounts()); 
      setMcpServers(await api.listMcpServers());
    } catch (e) { 
      setStatus(e instanceof Error ? e.message : 'Unable to load accounts'); 
    } 
  };

  useEffect(() => { 
    api.getLLMSettings().then((s) => { 
      setProvider(s.provider as Provider); 
      setModel(s.model || ''); 
      setConfigured(s.configured); 
    }).catch(() => setStatus('Unable to load provider settings')); 
    refresh(); 
  }, []);

  const save = async () => { setStatus(null); try { const s = await api.updateLLMSettings({ provider, api_key: apiKey, endpoint, model }); setConfigured(s.configured); setApiKey(''); setStatus(`Connected configuration saved for ${s.provider}.`); refresh(); } catch (e) { setStatus(e instanceof Error ? e.message : 'Unable to save provider settings'); } };
  const addAccount = async () => { setStatus(null); try { await api.createProviderAccount({ provider, label, auth_type: provider === 'openai_codex' || provider === 'anthropic_claude' ? 'oauth' : provider === 'ollama' || provider === 'lm_studio' ? 'local' : 'api_key', secret: apiKey, endpoint, model }); setApiKey(''); setStatus('Provider account added. Select it below to use it for new tasks.'); refresh(); } catch (e) { setStatus(e instanceof Error ? e.message : 'Unable to add provider account'); } };
  const select = async (id: string) => { try { await api.selectProviderAccount(id); setStatus('Account selected for new tasks.'); refresh(); } catch (e) { setStatus(e instanceof Error ? e.message : 'Unable to select account'); } };
  const test = async (id: string) => { try { await api.testProviderAccount(id); setStatus('AI connection succeeded.'); refresh(); } catch (e) { setStatus(e instanceof Error ? e.message : 'AI connection failed'); refresh(); } };
  const remove = async (id: string) => { try { await api.deleteProviderAccount(id); setStatus('Account removed.'); refresh(); } catch (e) { setStatus(e instanceof Error ? e.message : 'Unable to remove account'); } };

  // MCP handlers
  const handleAddMcp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mcpName.trim() || !mcpUrl.trim()) return;
    try {
      const headers: Record<string, string> = mcpAuthToken.trim() ? { Authorization: `Bearer ${mcpAuthToken.trim()}` } : {};
      await api.registerMcpServer({
        name: mcpName.trim(),
        server_url: mcpUrl.trim(),
        auth_headers: headers
      });
      setMcpName('');
      setMcpUrl('');
      setMcpAuthToken('');
      setShowAddMcp(false);
      setStatus('MCP Server registered and tools discovered successfully.');
      refresh();
    } catch (err: any) {
      setStatus(`Failed to register MCP server: ${err.message}`);
    }
  };

  const handleSyncMcp = async (id: string) => {
    try {
      await api.syncMcpServer(id);
      setStatus('MCP Server tools re-synced.');
      refresh();
    } catch (err: any) {
      setStatus(`Failed to sync MCP server: ${err.message}`);
    }
  };

  const handleRemoveMcp = async (id: string) => {
    try {
      await api.deleteMcpServer(id);
      setStatus('MCP Server unregistered.');
      refresh();
    } catch (err: any) {
      setStatus(`Failed to delete MCP server: ${err.message}`);
    }
  };

  const local = provider === 'ollama' || provider === 'lm_studio';

  return (
    <div className="max-w-3xl mx-auto p-8 w-full space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <KeyRound className="w-6 h-6 text-indigo-400" />
        <h2 className="text-xl font-bold text-white">AI Provider Accounts</h2>
      </div>
      <p className="text-sm text-gray-400 mb-6">
        Add API-key or local-model accounts. Credentials are encrypted and protected locally.
      </p>

      {/* Account form */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 space-y-4">
        <label className="block text-xs text-gray-300">
          Account label
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Personal OpenAI" className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded-lg p-2 text-sm text-white" />
        </label>
        <label className="block text-xs text-gray-300">
          Provider
          <select value={provider} onChange={e => setProvider(e.target.value as Provider)} className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded-lg p-2 text-sm text-white">
            <option value="openai">OpenAI API</option>
            <option value="openai_codex">ChatGPT subscription via Codex CLI</option>
            <option value="anthropic">Anthropic API</option>
            <option value="anthropic_claude">Claude subscription via Claude Code CLI</option>
            <option value="gemini">Google Gemini API</option>
            <option value="ollama">Ollama (local)</option>
            <option value="lm_studio">LM Studio (local)</option>
            <option value="offline_heuristic">Offline preview (no AI)</option>
          </select>
        </label>
        {local ? (
          <label className="block text-xs text-gray-300">
            <Server className="inline w-3 h-3 mr-1" />
            OpenAI-compatible endpoint
            <input value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder={provider === 'ollama' ? 'http://127.0.0.1:11434/v1' : 'http://127.0.0.1:1234/v1'} className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded-lg p-2 text-sm text-white" />
          </label>
        ) : provider !== 'offline_heuristic' && provider !== 'openai_codex' && provider !== 'anthropic_claude' && (
          <label className="block text-xs text-gray-300">
            API key
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Enter provider API key" className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded-lg p-2 text-sm text-white" />
          </label>
        )}
        {provider !== 'offline_heuristic' && (
          <label className="block text-xs text-gray-300">
            Model
            <input value={model} onChange={e => setModel(e.target.value)} placeholder={provider === 'openai_codex' ? 'Codex default' : local ? 'Local model name' : 'Provider default'} className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded-lg p-2 text-sm text-white" />
          </label>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={addAccount} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-4 py-2 rounded-lg transition">Add account</button>
          <button onClick={save} className="border border-[#30363d] text-gray-200 text-xs px-4 py-2 rounded-lg transition">Use legacy provider</button>
          {configured && <span className="text-xs text-emerald-400"><CheckCircle2 className="inline w-3 h-3 mr-1" />Configured</span>}
        </div>
        {status && <div className="text-xs text-gray-300 bg-[#0d1117] rounded-lg p-3"><AlertCircle className="inline w-3 h-3 mr-1 text-amber-400" />{status}</div>}
      </div>

      {/* Saved Accounts */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Saved accounts</h3>
        {accounts.length === 0 ? (
          <p className="text-xs text-gray-500">No accounts added yet.</p>
        ) : (
          <div className="space-y-2">
            {accounts.map(account => (
              <div key={account.id} className="flex items-center justify-between gap-3 bg-[#0d1117] rounded-lg p-3 border border-white/5">
                <div>
                  <div className="text-sm text-white">
                    {account.label} <span className="text-xs text-gray-500">({account.provider})</span>
                    {account.active && <span className="ml-2 text-xs text-emerald-400">active</span>}
                  </div>
                  <div className="text-xs text-gray-500">
                    {account.auth_type === 'api_key' ? 'API key' : account.auth_type} · {account.status}
                    {account.quota_status ? ` · quota: ${account.quota_status}` : ''}
                    {account.last_error ? ` · ${account.last_error}` : ''}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button title="Use account" onClick={() => select(account.id)} className="p-2 text-indigo-300 hover:text-white transition"><Play className="w-3.5 h-3.5" /></button>
                  <button title="Test account" onClick={() => test(account.id)} className="p-2 text-gray-300 hover:text-white transition"><RefreshCw className="w-3.5 h-3.5" /></button>
                  <button title="Remove account" onClick={() => remove(account.id)} className="p-2 text-red-300 hover:text-red-100 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* External MCP Servers Hub */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Blocks className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-semibold text-white">Model Context Protocol (MCP) Servers</h3>
          </div>
          <button
            onClick={() => setShowAddMcp(!showAddMcp)}
            className="flex items-center space-x-1 text-xs text-indigo-300 hover:text-indigo-200 bg-[#21262d] px-2.5 py-1.5 rounded-lg border border-white/10 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Connect MCP Server</span>
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Connect external MCP servers (Notion, Linear, GitHub, Postgres, Jira, custom endpoints). Tools discovered from these servers are automatically made available to your agents.
        </p>

        {showAddMcp && (
          <form onSubmit={handleAddMcp} className="bg-[#0d1117] p-4 rounded-xl border border-indigo-500/30 mb-4 space-y-3">
            <div className="text-xs font-semibold text-white">Connect External MCP Server</div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Server Name</label>
              <input
                type="text"
                value={mcpName}
                onChange={e => setMcpName(e.target.value)}
                placeholder="e.g. Linear MCP"
                className="w-full bg-[#161b22] border border-[#30363d] rounded p-2 text-xs text-white"
                required
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Server Endpoint URL</label>
              <input
                type="text"
                value={mcpUrl}
                onChange={e => setMcpUrl(e.target.value)}
                placeholder="http://localhost:8080/mcp or https://api.example.com/mcp"
                className="w-full bg-[#161b22] border border-[#30363d] rounded p-2 text-xs text-white font-mono"
                required
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Bearer Token / Auth (optional)</label>
              <input
                type="password"
                value={mcpAuthToken}
                onChange={e => setMcpAuthToken(e.target.value)}
                placeholder="Optional API token"
                className="w-full bg-[#161b22] border border-[#30363d] rounded p-2 text-xs text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddMcp(false)}
                className="text-xs text-gray-400 hover:text-white px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-4 py-1.5 rounded transition"
              >
                Connect & Discover
              </button>
            </div>
          </form>
        )}

        {mcpServers.length === 0 ? (
          <p className="text-xs text-gray-500 italic">No external MCP servers connected yet.</p>
        ) : (
          <div className="space-y-3">
            {mcpServers.map(s => (
              <div key={s.id} className="bg-[#0d1117] p-3 rounded-lg border border-white/5 flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <Globe className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-xs font-semibold text-white">{s.name}</span>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20">
                      {s.status}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {s.tools_count} {s.tools_count === 1 ? 'tool' : 'tools'}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-500 font-mono mt-1 truncate max-w-md">
                    {s.server_url}
                  </div>
                  {s.discovered_tools?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {s.discovered_tools.map(t => (
                        <span key={t.name} className="text-[9px] font-mono bg-[#161b22] text-gray-300 px-1.5 py-0.5 rounded border border-white/5">
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-3">
                  <button title="Sync tools" onClick={() => handleSyncMcp(s.id)} className="p-2 text-gray-400 hover:text-white transition">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button title="Disconnect server" onClick={() => handleRemoveMcp(s.id)} className="p-2 text-rose-400 hover:text-rose-200 transition">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

