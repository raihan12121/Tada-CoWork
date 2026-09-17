import React, { useEffect, useState } from 'react';
import { KeyRound, RefreshCw, Server, CheckCircle2, AlertCircle, Trash2, Play } from 'lucide-react';
import { api } from '../services/api';
import type { ProviderAccount } from '../services/api';

type Provider = 'openai' | 'openai_codex' | 'anthropic' | 'gemini' | 'ollama' | 'lm_studio' | 'offline_heuristic';

export const ProviderSettings: React.FC = () => {
  const [provider, setProvider] = useState<Provider>('offline_heuristic');
  const [apiKey, setApiKey] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [model, setModel] = useState('');
  const [label, setLabel] = useState('My provider');
  const [accounts, setAccounts] = useState<ProviderAccount[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);

  const refresh = async () => { try { setAccounts(await api.listProviderAccounts()); } catch (e) { setStatus(e instanceof Error ? e.message : 'Unable to load provider accounts'); } };
  useEffect(() => { api.getLLMSettings().then((s) => { setProvider(s.provider as Provider); setModel(s.model || ''); setConfigured(s.configured); }).catch(() => setStatus('Unable to load provider settings')); refresh(); }, []);
  const save = async () => { setStatus(null); try { const s = await api.updateLLMSettings({ provider, api_key: apiKey, endpoint, model }); setConfigured(s.configured); setApiKey(''); setStatus(`Connected configuration saved for ${s.provider}.`); refresh(); } catch (e) { setStatus(e instanceof Error ? e.message : 'Unable to save provider settings'); } };
  const addAccount = async () => { setStatus(null); try { await api.createProviderAccount({ provider, label, auth_type: provider === 'openai_codex' ? 'oauth' : provider === 'ollama' || provider === 'lm_studio' ? 'local' : 'api_key', secret: apiKey, endpoint, model }); setApiKey(''); setStatus('Provider account added. Select it below to use it for new tasks.'); refresh(); } catch (e) { setStatus(e instanceof Error ? e.message : 'Unable to add provider account'); } };
  const select = async (id: string) => { try { await api.selectProviderAccount(id); setStatus('Account selected for new tasks.'); refresh(); } catch (e) { setStatus(e instanceof Error ? e.message : 'Unable to select account'); } };
  const test = async (id: string) => { try { await api.testProviderAccount(id); setStatus('AI connection succeeded.'); refresh(); } catch (e) { setStatus(e instanceof Error ? e.message : 'AI connection failed'); refresh(); } };
  const remove = async (id: string) => { try { await api.deleteProviderAccount(id); setStatus('Account removed.'); refresh(); } catch (e) { setStatus(e instanceof Error ? e.message : 'Unable to remove account'); } };
  const local = provider === 'ollama' || provider === 'lm_studio';

  return <div className="max-w-3xl mx-auto p-8 w-full">
    <div className="flex items-center gap-3 mb-2"><KeyRound className="w-6 h-6 text-indigo-400" /><h2 className="text-xl font-bold text-white">AI Provider Accounts</h2></div>
    <p className="text-sm text-gray-400 mb-6">Add API-key or local-model accounts. Credentials are protected with Windows DPAPI and are never returned to the interface. Subscription login will be enabled only through provider-approved OAuth or SDK integrations.</p>
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 space-y-4">
      <label className="block text-xs text-gray-300">Account label<input value={label} onChange={e => setLabel(e.target.value)} placeholder="Personal OpenAI" className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded-lg p-2 text-sm text-white" /></label>
      <label className="block text-xs text-gray-300">Provider<select value={provider} onChange={e => setProvider(e.target.value as Provider)} className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded-lg p-2 text-sm text-white"><option value="openai">OpenAI API</option><option value="openai_codex">ChatGPT subscription via Codex CLI</option><option value="anthropic">Anthropic API</option><option value="gemini">Google Gemini API</option><option value="ollama">Ollama (local)</option><option value="lm_studio">LM Studio (local)</option><option value="offline_heuristic">Offline preview (no AI)</option></select></label>
      {local ? <label className="block text-xs text-gray-300"><Server className="inline w-3 h-3 mr-1" />OpenAI-compatible endpoint<input value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder={provider === 'ollama' ? 'http://127.0.0.1:11434/v1' : 'http://127.0.0.1:1234/v1'} className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded-lg p-2 text-sm text-white" /></label> : provider !== 'offline_heuristic' && provider !== 'openai_codex' && <label className="block text-xs text-gray-300">API key<input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Enter provider API key" className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded-lg p-2 text-sm text-white" /></label>}
      {provider !== 'offline_heuristic' && <label className="block text-xs text-gray-300">Model<input value={model} onChange={e => setModel(e.target.value)} placeholder={provider === 'openai_codex' ? 'Codex default' : local ? 'Local model name' : 'Provider default'} className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded-lg p-2 text-sm text-white" /></label>}
      <div className="flex flex-wrap items-center gap-2"><button onClick={addAccount} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-4 py-2 rounded-lg">Add account</button><button onClick={save} className="border border-[#30363d] text-gray-200 text-xs px-4 py-2 rounded-lg">Use legacy provider</button>{configured && <span className="text-xs text-emerald-400"><CheckCircle2 className="inline w-3 h-3 mr-1" />Configured</span>}</div>
      {status && <div className="text-xs text-gray-300 bg-[#0d1117] rounded-lg p-3"><AlertCircle className="inline w-3 h-3 mr-1 text-amber-400" />{status}</div>}
    </div>
    <div className="mt-6 bg-[#161b22] border border-[#30363d] rounded-xl p-5"><h3 className="text-sm font-semibold text-white mb-3">Saved accounts</h3>{accounts.length === 0 ? <p className="text-xs text-gray-500">No accounts added yet.</p> : <div className="space-y-2">{accounts.map(account => <div key={account.id} className="flex items-center justify-between gap-3 bg-[#0d1117] rounded-lg p-3"><div><div className="text-sm text-white">{account.label} <span className="text-xs text-gray-500">({account.provider})</span>{account.active && <span className="ml-2 text-xs text-emerald-400">active</span>}</div><div className="text-xs text-gray-500">{account.auth_type === 'api_key' ? 'API key' : account.auth_type} · {account.status}{account.last_error ? ` · ${account.last_error}` : ''}</div></div><div className="flex gap-1"><button title="Use account" onClick={() => select(account.id)} className="p-2 text-indigo-300 hover:text-white"><Play className="w-3 h-3" /></button><button title="Test account" onClick={() => test(account.id)} className="p-2 text-gray-300 hover:text-white"><RefreshCw className="w-3 h-3" /></button><button title="Remove account" onClick={() => remove(account.id)} className="p-2 text-red-300 hover:text-red-100"><Trash2 className="w-3 h-3" /></button></div></div>)}</div>}</div>
  </div>;
};
