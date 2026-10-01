import React, { useState, useEffect } from 'react';
import { 
  X, 
  Search, 
  CheckCircle2, 
  Shield, 
  Key, 
  Mail, 
  Calendar, 
  MessageSquare, 
  CheckSquare, 
  FileText, 
  GitBranch, 
  Webhook, 
  Database,
  Sparkles
} from 'lucide-react';
import type { Bot } from '../types';
import { api } from '../services/api';

export interface Connector {
  id: string;
  name: string;
  category: 'productivity' | 'communication' | 'engineering' | 'crm';
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  connected: boolean;
  permissions: string[];
  allowedBots: string[];
}

interface ConnectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  bots: Bot[];
}

const DEFAULT_CONNECTORS: Connector[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    category: 'productivity',
    description: 'Autonomous inbox zero triage, drafting email responses, and thread labeling.',
    icon: Mail,
    connected: true,
    permissions: ['gmail.readonly', 'gmail.compose', 'gmail.modify'],
    allowedBots: ['all']
  },
  {
    id: 'calendar',
    name: 'Google Calendar',
    category: 'productivity',
    description: 'Reads schedule availability, books meetings, and handles conflict resolution.',
    icon: Calendar,
    connected: true,
    permissions: ['calendar.events.readonly', 'calendar.events.write'],
    allowedBots: ['all']
  },
  {
    id: 'slack',
    name: 'Slack',
    category: 'communication',
    description: 'Listens to team channels, joins threads on mention, and sends direct status alerts.',
    icon: MessageSquare,
    connected: true,
    permissions: ['channels:read', 'chat:write', 'reactions:write'],
    allowedBots: ['all']
  },
  {
    id: 'clickup',
    name: 'ClickUp',
    category: 'productivity',
    description: 'Syncs sprint task statuses, auto-generates acceptance criteria, and manages boards.',
    icon: CheckSquare,
    connected: false,
    permissions: ['tasks:read', 'tasks:write', 'lists:read'],
    allowedBots: []
  },
  {
    id: 'notion',
    name: 'Notion',
    category: 'productivity',
    description: 'Maintains corporate wikis, meeting notes, database records, and research summaries.',
    icon: FileText,
    connected: false,
    permissions: ['pages:read', 'pages:write', 'databases:read'],
    allowedBots: []
  },
  {
    id: 'github',
    name: 'GitHub',
    category: 'engineering',
    description: 'Analyzes pull requests, triggers CI runs, reviews code diffs, and opens issues.',
    icon: GitBranch,
    connected: true,
    permissions: ['repo:status', 'pull_requests:write', 'issues:write'],
    allowedBots: ['all']
  },
  {
    id: 'composio',
    name: 'Composio & Webhooks',
    category: 'engineering',
    description: 'Universal connector for 250+ enterprise SaaS apps, custom APIs, and event webhooks.',
    icon: Webhook,
    connected: true,
    permissions: ['webhook:deliver', 'tools:execute'],
    allowedBots: ['all']
  },
  {
    id: 'hubspot',
    name: 'HubSpot CRM',
    category: 'crm',
    description: 'Enriches lead profiles, synchronizes deal stages, and logs client correspondence.',
    icon: Database,
    connected: false,
    permissions: ['contacts:read', 'deals:write'],
    allowedBots: []
  }
];

export const ConnectionsModal: React.FC<ConnectionsModalProps> = ({ isOpen, onClose, bots }) => {
  const [connectors, setConnectors] = useState<Connector[]>(DEFAULT_CONNECTORS);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [configuringConnector, setConfiguringConnector] = useState<Connector | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    api.listConnectors().then((remoteConnectors) => {
      if (remoteConnectors && remoteConnectors.length > 0) {
        setConnectors((prev) =>
          prev.map((c) => {
            const match = remoteConnectors.find((r) => r.id === c.id);
            if (match) {
              return {
                ...c,
                connected: match.connected,
                permissions: match.permissions,
                allowedBots: match.allowed_bots
              };
            }
            return c;
          })
        );
      }
    }).catch(console.error);
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleConnection = async (id: string) => {
    const current = connectors.find((c) => c.id === id);
    if (!current) return;
    const nextState = !current.connected;

    const updated = connectors.map((c) => {
      if (c.id === id) {
        return {
          ...c,
          connected: nextState,
          allowedBots: nextState ? ['all'] : []
        };
      }
      return c;
    });
    setConnectors(updated);
    if (configuringConnector && configuringConnector.id === id) {
      setConfiguringConnector((prev) => prev ? { ...prev, connected: nextState } : null);
    }

    try {
      await api.configureConnector(id, {
        connected: nextState,
        permissions: current.permissions,
        allowed_bots: nextState ? ['all'] : []
      });
      setStatusMessage(`${current.name} ${nextState ? 'enabled' : 'disconnected'}.`);
      setTimeout(() => setStatusMessage(null), 2500);
    } catch (err: any) {
      console.error('Failed to configure connector:', err);
      setStatusMessage(`Error saving ${current.name} state.`);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const handleTestConnection = async (c: Connector) => {
    setStatusMessage(`Testing connection with ${c.name}...`);
    try {
      const res = await api.testConnector(c.id);
      setStatusMessage(`Verified ${res.connector} (${res.latency_ms}ms latency). Connected!`);
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err: any) {
      setStatusMessage(`Test failed: ${err.message || 'Unable to reach service'}`);
      setTimeout(() => setStatusMessage(null), 3500);
    }
  };

  const filtered = connectors.filter((c) => {
    const matchesCat = selectedCategory === 'all' || c.category === selectedCategory;
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          c.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xl flex items-center justify-center p-4 select-none animate-springEnter">
      <div className="bg-[#0c0c10] border border-white/[0.12] rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-[0_32px_96px_rgba(0,0,0,0.95)] overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-white/[0.08] flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-b from-white/15 to-white/5 border border-white/10 flex items-center justify-center text-white shadow-xs">
              <Sparkles className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-tight">Connections & Plugins</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Manage external API integrations, enterprise plugins, and bot access permissions.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.06] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="px-5 py-3 border-b border-white/[0.06] bg-black/20 flex flex-col sm:flex-row items-center gap-3 justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search plugins & tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#14141a] border border-white/[0.08] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/20 transition"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto">
            {['all', 'productivity', 'communication', 'engineering', 'crm'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition ${
                  selectedCategory === cat
                    ? 'bg-white text-black font-semibold shadow-xs'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Modal Body: Connectors Grid */}
        <div className="flex-1 overflow-y-auto p-5 select-text">
          {statusMessage && (
            <div className="mb-4 px-4 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filtered.map((connector) => {
              const Icon = connector.icon;
              return (
                <div
                  key={connector.id}
                  className="bg-[#111116] border border-white/[0.07] hover:border-white/[0.14] rounded-2xl p-4 flex flex-col justify-between transition group shadow-xs"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-b from-white/10 to-white/5 border border-white/10 flex items-center justify-center text-zinc-200">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-xs font-semibold text-white tracking-tight">{connector.name}</h3>
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1 border ${
                              connector.connected 
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' 
                                : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${connector.connected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]' : 'bg-zinc-500'}`} />
                              {connector.connected ? 'Connected' : 'Disconnected'}
                            </span>
                          </div>
                          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">
                            {connector.category}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => toggleConnection(connector.id)}
                        className={`text-xs px-3 py-1.5 rounded-xl font-medium transition pressable ${
                          connector.connected
                            ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20'
                            : 'bg-white text-black hover:bg-zinc-200 font-semibold shadow-xs'
                        }`}
                      >
                        {connector.connected ? 'Disconnect' : 'Connect'}
                      </button>
                    </div>

                    <p className="text-xs text-zinc-400 mt-3 leading-relaxed">
                      {connector.description}
                    </p>

                    {/* Permissions list */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {connector.permissions.map((perm) => (
                        <span key={perm} className="text-[10px] font-mono text-zinc-400 bg-white/[0.04] px-2 py-0.5 rounded-md border border-white/[0.06]">
                          {perm}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Footer Configuration row */}
                  <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500 flex items-center gap-1.5">
                      <Shield className="w-3 h-3 text-zinc-400" />
                      {connector.connected ? 'Active across authorized agents' : 'Inactive'}
                    </span>

                    <button
                      onClick={() => {
                        setConfiguringConnector(connector);
                        setApiKeyInput('');
                      }}
                      className="text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1 transition"
                    >
                      <Key className="w-3 h-3" />
                      <span>Configure Permissions</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Slide-over Connector Config Drawer */}
      {configuringConnector && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-springEnter">
          <div className="bg-[#0f0f14] border border-white/[0.12] rounded-2xl w-full max-w-lg p-5 shadow-[0_24px_64px_rgba(0,0,0,0.9)] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-white">
                  {React.createElement(configuringConnector.icon, { className: 'w-4 h-4' })}
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-white">Configure {configuringConnector.name}</h3>
                  <p className="text-[10px] text-zinc-400">Vault credentials & agent authorization</p>
                </div>
              </div>
              <button
                onClick={() => setConfiguringConnector(null)}
                className="text-zinc-500 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  API Key / OAuth Token (AES-256 Encrypted)
                </label>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="w-full bg-[#14141a] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/30 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
                  Allowed Specialist Bots
                </label>
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {bots.map((b) => (
                    <label key={b.id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white/[0.04] cursor-pointer text-xs text-zinc-300">
                      <input
                        type="checkbox"
                        checked={configuringConnector.allowedBots.includes('all') || configuringConnector.allowedBots.includes(b.id)}
                        onChange={() => {
                          const has = configuringConnector.allowedBots.includes(b.id);
                          const next = has
                            ? configuringConnector.allowedBots.filter(x => x !== b.id)
                            : [...configuringConnector.allowedBots.filter(x => x !== 'all'), b.id];
                          setConfiguringConnector({ ...configuringConnector, allowedBots: next });
                        }}
                        className="rounded bg-black border-zinc-700 text-cyan-500 focus:ring-0"
                      />
                      <span>{b.avatar}</span>
                      <span className="font-medium text-zinc-200">{b.name}</span>
                      <span className="text-[10px] text-zinc-500 ml-auto font-mono">{b.role_tag}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleTestConnection(configuringConnector)}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-medium py-1.5 px-3 rounded-lg hover:bg-cyan-500/10 transition"
              >
                Test Live Latency
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfiguringConnector(null)}
                  className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/[0.06] transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await toggleConnection(configuringConnector.id);
                    setConfiguringConnector(null);
                  }}
                  className="btn-primary text-xs"
                >
                  Save Config
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
