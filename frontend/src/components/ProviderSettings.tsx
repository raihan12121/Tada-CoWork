import React, { useEffect, useState } from 'react';
import { 
  RefreshCw, 
  Server, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Play, 
  Blocks, 
  Globe, 
  Plus,
  ShieldCheck,
  Cpu
} from 'lucide-react';
import { api } from '../services/api';
import type { ProviderAccount } from '../services/api';
import type { McpServer } from '../types';

type Provider = 'openai' | 'openai_codex' | 'anthropic' | 'anthropic_claude' | 'gemini' | 'ollama' | 'lm_studio' | 'offline_heuristic';

export const ProviderSettings: React.FC = () => {
  const [provider, setProvider] = useState<Provider>('offline_heuristic');
  const [apiKey, setApiKey] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [model, setModel] = useState('');
  const [label, setLabel] = useState('Grok xAI Account');
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
    api.listProviderAccounts().then(setAccounts).catch((e) => {
      setStatus(e instanceof Error ? e.message : 'Unable to load accounts');
    });
    api.listMcpServers().then(setMcpServers).catch(() => {});
  }, []);

  const save = async () => { 
    setStatus(null); 
    try { 
      const s = await api.updateLLMSettings({ provider, api_key: apiKey, endpoint, model }); 
      setConfigured(s.configured); 
      setApiKey(''); 
      setStatus(`Connected configuration saved for ${s.provider}.`); 
      refresh(); 
    } catch (e) { 
      setStatus(e instanceof Error ? e.message : 'Unable to save provider settings'); 
    } 
  };

  const addAccount = async () => { 
    setStatus(null); 
    try { 
      await api.createProviderAccount({ 
        provider, 
        label, 
        auth_type: provider === 'openai_codex' || provider === 'anthropic_claude' ? 'oauth' : provider === 'ollama' || provider === 'lm_studio' ? 'local' : 'api_key', 
        secret: apiKey, 
        endpoint, 
        model 
      }); 
      setApiKey(''); 
      setStatus('Provider account added successfully.'); 
      refresh(); 
    } catch (e) { 
      setStatus(e instanceof Error ? e.message : 'Unable to add provider account'); 
    } 
  };

  const select = async (id: string) => { 
    try { 
      await api.selectProviderAccount(id); 
      setStatus('Account selected as active for new tasks.'); 
      refresh(); 
    } catch (e) { 
      setStatus(e instanceof Error ? e.message : 'Unable to select account'); 
    } 
  };

  const test = async (id: string) => { 
    try { 
      await api.testProviderAccount(id); 
      setStatus('AI connection verified successfully.'); 
      refresh(); 
    } catch (e) { 
      setStatus(e instanceof Error ? e.message : 'AI connection test failed'); 
      refresh(); 
    } 
  };

  const remove = async (id: string) => { 
    try { 
      await api.deleteProviderAccount(id); 
      setStatus('Account removed.'); 
      refresh(); 
    } catch (e) { 
      setStatus(e instanceof Error ? e.message : 'Unable to remove account'); 
    } 
  };

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
    <div className="max-w-4xl mx-auto py-8 px-6 w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">AI Accounts & MCP Connectors</h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1 max-w-xl">
            Configure LLM engines (xAI Grok, Anthropic Claude, OpenAI, Local Ollama) and Model Context Protocol (MCP) tool bridges.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Local Encrypted Storage</span>
        </div>
      </div>

      {status && (
        <div className="p-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-xs text-zinc-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>{status}</span>
        </div>
      )}

      {/* Account form */}
      <div className="bg-[#09090c] border border-white/[0.08] rounded-2xl p-5 space-y-4 shadow-xl">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Add Model Provider</h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block text-xs text-zinc-300">
            Account label
            <input 
              value={label} 
              onChange={e => setLabel(e.target.value)} 
              placeholder="e.g. Grok 3 Production" 
              className="mt-1.5 w-full bg-[#121215] border border-white/[0.08] rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-white/30" 
            />
          </label>
          <label className="block text-xs text-zinc-300">
            Provider Engine
            <select 
              value={provider} 
              onChange={e => setProvider(e.target.value as Provider)} 
              className="mt-1.5 w-full bg-[#121215] border border-white/[0.08] rounded-xl p-2.5 text-xs text-white focus:outline-none"
            >
              <option value="openai">OpenAI API (GPT-4o / o1)</option>
              <option value="openai_codex">ChatGPT Subscription via Codex CLI</option>
              <option value="anthropic">Anthropic API (Claude 3.7 Sonnet)</option>
              <option value="anthropic_claude">Claude Subscription via Claude Code CLI</option>
              <option value="gemini">Google Gemini API (Gemini 2.5 Flash / Pro)</option>
              <option value="ollama">Ollama (Local Offline)</option>
              <option value="lm_studio">LM Studio (Local Offline)</option>
              <option value="offline_heuristic">Offline Preview (No External AI)</option>
            </select>
          </label>
        </div>

        {local ? (
          <label className="block text-xs text-zinc-300">
            <Server className="inline w-3.5 h-3.5 mr-1 text-cyan-400" />
            OpenAI-compatible Endpoint URL
            <input 
              value={endpoint} 
              onChange={e => setEndpoint(e.target.value)} 
              placeholder={provider === 'ollama' ? 'http://127.0.0.1:11434/v1' : 'http://127.0.0.1:1234/v1'} 
              className="mt-1.5 w-full bg-[#121215] border border-white/[0.08] rounded-xl p-2.5 text-xs text-white font-mono focus:outline-none focus:border-white/30" 
            />
          </label>
        ) : provider !== 'offline_heuristic' && provider !== 'openai_codex' && provider !== 'anthropic_claude' && (
          <label className="block text-xs text-zinc-300">
            API Secret Key
            <input 
              type="password" 
              value={apiKey} 
              onChange={e => setApiKey(e.target.value)} 
              placeholder="Enter secret API key (stored encrypted locally)" 
              className="mt-1.5 w-full bg-[#121215] border border-white/[0.08] rounded-xl p-2.5 text-xs text-white font-mono focus:outline-none focus:border-white/30" 
            />
          </label>
        )}

        {provider !== 'offline_heuristic' && (
          <label className="block text-xs text-zinc-300">
            Model Identifier
            <input 
              value={model} 
              onChange={e => setModel(e.target.value)} 
              placeholder={provider === 'openai_codex' ? 'Codex default' : local ? 'llama3.2:latest' : 'Provider default'} 
              className="mt-1.5 w-full bg-[#121215] border border-white/[0.08] rounded-xl p-2.5 text-xs text-white font-mono focus:outline-none focus:border-white/30" 
            />
          </label>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button 
            onClick={addAccount} 
            className="bg-white text-black hover:bg-zinc-200 font-semibold text-xs px-4 py-2 rounded-xl transition shadow"
          >
            Add Account
          </button>
          <button 
            onClick={save} 
            className="bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-zinc-300 text-xs px-4 py-2 rounded-xl transition"
          >
            Save Default Settings
          </button>
          {configured && (
            <span className="text-xs text-emerald-400 font-mono flex items-center gap-1 ml-2">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Configured</span>
            </span>
          )}
        </div>
      </div>

      {/* Saved Accounts */}
      <div className="bg-[#09090c] border border-white/[0.08] rounded-2xl p-5 shadow-xl">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">Saved AI Accounts</h3>
        {accounts.length === 0 ? (
          <p className="text-xs text-zinc-600 italic">No AI accounts added yet.</p>
        ) : (
          <div className="space-y-2">
            {accounts.map(account => (
              <div 
                key={account.id} 
                className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border transition ${
                  account.active 
                    ? 'bg-white/[0.06] border-white/[0.15]' 
                    : 'bg-[#121216]/60 border-white/[0.05]'
                }`}
              >
                <div>
                  <div className="text-xs font-semibold text-white flex items-center gap-2">
                    <span>{account.label}</span>
                    <span className="font-mono text-[10px] text-zinc-500 bg-white/[0.05] px-1.5 py-0.2 rounded">
                      {account.provider}
                    </span>
                    {account.active && (
                      <span className="text-[10px] text-cyan-300 bg-cyan-950/60 border border-cyan-800 px-2 py-0.2 rounded-full font-mono">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-500 font-mono mt-1">
                    {account.auth_type} · {account.status}
                    {account.quota_status ? ` · quota: ${account.quota_status}` : ''}
                    {account.last_error ? ` · ${account.last_error}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    title="Set as Active Account" 
                    onClick={() => select(account.id)} 
                    className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.08] transition"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </button>
                  <button 
                    title="Test Connectivity" 
                    onClick={() => test(account.id)} 
                    className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.08] transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    title="Remove Account" 
                    onClick={() => remove(account.id)} 
                    className="p-2 text-zinc-500 hover:text-rose-400 rounded-lg hover:bg-white/[0.08] transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* External MCP Servers Hub */}
      <div className="bg-[#09090c] border border-white/[0.08] rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Blocks className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Model Context Protocol (MCP) Connectors</h3>
          </div>
          <button
            onClick={() => setShowAddMcp(!showAddMcp)}
            className="flex items-center gap-1.5 text-xs text-white bg-white/[0.06] hover:bg-white/[0.12] px-3 py-1.5 rounded-lg border border-white/[0.08] transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Connect MCP Server</span>
          </button>
        </div>
        <p className="text-xs text-zinc-400 mb-4">
          Connect external MCP servers (Notion, Linear, GitHub, Postgres, Jira, custom endpoints). Tools discovered from these servers are automatically available to your agents.
        </p>

        {showAddMcp && (
          <form onSubmit={handleAddMcp} className="bg-black/60 p-4 rounded-xl border border-white/[0.08] mb-4 space-y-3">
            <div className="text-xs font-semibold text-white">Connect External MCP Server</div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Server Name</label>
              <input
                type="text"
                value={mcpName}
                onChange={e => setMcpName(e.target.value)}
                placeholder="e.g. Linear MCP"
                className="w-full bg-[#121215] border border-white/[0.1] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-white/30"
                required
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Server Endpoint URL</label>
              <input
                type="text"
                value={mcpUrl}
                onChange={e => setMcpUrl(e.target.value)}
                placeholder="http://localhost:8080/mcp or https://api.example.com/mcp"
                className="w-full bg-[#121215] border border-white/[0.1] rounded-lg p-2 text-xs text-white font-mono focus:outline-none focus:border-white/30"
                required
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Bearer Token / Auth (optional)</label>
              <input
                type="password"
                value={mcpAuthToken}
                onChange={e => setMcpAuthToken(e.target.value)}
                placeholder="Optional API token"
                className="w-full bg-[#121215] border border-white/[0.1] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-white/30"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddMcp(false)}
                className="text-xs text-zinc-400 hover:text-white px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-white text-black hover:bg-zinc-200 font-semibold text-xs px-4 py-1.5 rounded-lg transition"
              >
                Connect & Discover Tools
              </button>
            </div>
          </form>
        )}

        {mcpServers.length === 0 ? (
          <p className="text-xs text-zinc-600 italic">No external MCP servers connected yet.</p>
        ) : (
          <div className="space-y-2.5">
            {mcpServers.map(s => (
              <div key={s.id} className="bg-[#121216]/50 p-3.5 rounded-xl border border-white/[0.06] flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-xs font-semibold text-white">{s.name}</span>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-mono">
                      {s.status}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {s.tools_count} {s.tools_count === 1 ? 'tool' : 'tools'}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-500 font-mono mt-1 truncate max-w-md">
                    {s.server_url}
                  </div>
                  {s.discovered_tools?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {s.discovered_tools.map(t => (
                        <span key={t.name} className="text-[9px] font-mono bg-white/[0.04] text-zinc-300 px-2 py-0.5 rounded border border-white/[0.06]">
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-3">
                  <button title="Sync tools" onClick={() => handleSyncMcp(s.id)} className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.08] transition">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button title="Disconnect server" onClick={() => handleRemoveMcp(s.id)} className="p-2 text-zinc-500 hover:text-rose-400 rounded-lg hover:bg-white/[0.08] transition">
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
