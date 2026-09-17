import React, { useEffect, useState } from 'react';
import { KeyRound, RefreshCw, Server, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

type Provider = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'lm_studio' | 'offline_heuristic';

export const ProviderSettings: React.FC = () => {
  const [provider, setProvider] = useState<Provider>('offline_heuristic');
  const [apiKey, setApiKey] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [model, setModel] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);

  useEffect(() => { api.getLLMSettings().then((s) => { setProvider(s.provider as Provider); setModel(s.model || ''); setConfigured(s.configured); }).catch(() => setStatus('Unable to load provider settings')); }, []);

  const save = async () => {
    setStatus(null);
    try {
      const s = await api.updateLLMSettings({ provider, api_key: apiKey, endpoint, model });
      setConfigured(s.configured); setApiKey(''); setStatus(`Connected configuration saved for ${s.provider}.`);
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Unable to save provider settings'); }
  };

  const test = async () => { setStatus('Testing AI connection...'); try { await api.testLLMSettings(); setStatus('AI connection succeeded.'); } catch (e) { setStatus(e instanceof Error ? e.message : 'AI connection failed'); } };
  const local = provider === 'ollama' || provider === 'lm_studio';

  return <div className="max-w-3xl mx-auto p-8 w-full">
    <div className="flex items-center gap-3 mb-2"><KeyRound className="w-6 h-6 text-indigo-400" /><h2 className="text-xl font-bold text-white">AI Provider Settings</h2></div>
    <p className="text-sm text-gray-400 mb-6">Connect a hosted model or a local Ollama/LM Studio model. Windows protects saved hosted-provider keys with your user account; keys are never shown back.</p>
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 space-y-4">
      <label className="block text-xs text-gray-300">Provider<select value={provider} onChange={e => setProvider(e.target.value as Provider)} className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded-lg p-2 text-sm text-white"><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="gemini">Google Gemini</option><option value="ollama">Ollama (local)</option><option value="lm_studio">LM Studio (local)</option><option value="offline_heuristic">Offline preview (no AI)</option></select></label>
      {local ? <label className="block text-xs text-gray-300"><Server className="inline w-3 h-3 mr-1" />OpenAI-compatible endpoint<input value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder={provider === 'ollama' ? 'http://127.0.0.1:11434/v1' : 'http://127.0.0.1:1234/v1'} className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded-lg p-2 text-sm text-white" /></label> : provider !== 'offline_heuristic' && <label className="block text-xs text-gray-300">API key<input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Enter provider API key" className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded-lg p-2 text-sm text-white" /></label>}
      {provider !== 'offline_heuristic' && <label className="block text-xs text-gray-300">Model<input value={model} onChange={e => setModel(e.target.value)} placeholder={provider === 'ollama' ? 'llama3.2' : provider === 'lm_studio' ? 'local-model' : 'Provider default'} className="mt-1 w-full bg-[#0d1117] border border-[#30363d] rounded-lg p-2 text-sm text-white" /></label>}
      <div className="flex items-center gap-2"><button onClick={save} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-4 py-2 rounded-lg">Save provider</button><button onClick={test} disabled={!configured || provider === 'offline_heuristic'} className="border border-[#30363d] text-gray-200 text-xs px-4 py-2 rounded-lg disabled:opacity-40"><RefreshCw className="inline w-3 h-3 mr-1" />Test connection</button>{configured && <span className="text-xs text-emerald-400"><CheckCircle2 className="inline w-3 h-3 mr-1" />Configured</span>}</div>
      {status && <div className="text-xs text-gray-300 bg-[#0d1117] rounded-lg p-3"><AlertCircle className="inline w-3 h-3 mr-1 text-amber-400" />{status}</div>}
    </div>
  </div>;
};
