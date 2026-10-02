import React, { useState, useEffect } from 'react';
import { 
  X, 
  BrainCircuit, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Search
} from 'lucide-react';
import type { Bot, MemoryItem } from '../types';
import { api } from '../services/api';

interface MemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  bots: Bot[];
  initialBotId?: string | null;
  onBotUpdated?: (updatedBot: Bot) => void;
}

export const MemoryModal: React.FC<MemoryModalProps> = ({
  isOpen,
  onClose,
  bots,
  initialBotId,
  onBotUpdated
}) => {
  const [activeTab, setActiveTab] = useState<'global' | 'individual'>(
    initialBotId ? 'individual' : 'global'
  );
  const [selectedBotId, setSelectedBotId] = useState<string>(
    initialBotId || bots[0]?.id || ''
  );

  // Global Memory state
  const [globalMemories, setGlobalMemories] = useState<MemoryItem[]>([]);
  const [isMemoryEnabled, setIsMemoryEnabled] = useState(true);
  const [newGlobalContent, setNewGlobalContent] = useState('');
  const [newGlobalType, setNewGlobalType] = useState<'fact' | 'preference' | 'summary'>('fact');
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // Individual Bot Memory state
  const [newBotMemory, setNewBotMemory] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };



  useEffect(() => {
    if (!isOpen) return;
    let ignore = false;
    Promise.all([api.listMemories(), api.getMemoryStatus()])
      .then(([items, status]) => {
        if (!ignore) {
          setGlobalMemories(items);
          setIsMemoryEnabled(status.enabled);
        }
      })
      .catch((err) => {
        console.error('Failed to load global memories:', err);
      });
    return () => {
      ignore = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const currentBot = bots.find((b) => b.id === selectedBotId) || bots[0] || null;

  // Toggle Global Memory
  const handleToggleGlobalMemory = async () => {
    const nextState = !isMemoryEnabled;
    try {
      await api.toggleMemory(nextState);
      setIsMemoryEnabled(nextState);
      showToast(`Global memory ${nextState ? 'enabled' : 'disabled'}`);
    } catch (err) {
      console.error(err);
      showToast('Failed to toggle memory.');
    }
  };

  // Add Global Memory
  const handleAddGlobalMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGlobalContent.trim()) return;

    try {
      const created = await api.createMemory(
        newGlobalType,
        newGlobalContent.trim()
      );
      setGlobalMemories([created, ...globalMemories]);
      setNewGlobalContent('');
      showToast('Added to Global Workspace Memory');
    } catch (err) {
      console.error(err);
      showToast('Failed to add memory item.');
    }
  };

  // Delete Global Memory
  const handleDeleteGlobalMemory = async (id: string) => {
    try {
      await api.deleteMemory(id);
      setGlobalMemories((prev) => prev.filter((m) => m.id !== id));
      showToast('Memory item removed.');
    } catch (err) {
      console.error(err);
      showToast('Failed to delete memory.');
    }
  };

  // Add Individual Bot Memory
  const handleAddBotMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBot || !newBotMemory.trim()) return;

    try {
      const updatedMemories = [...(currentBot.individual_memory || []), newBotMemory.trim()];
      const updated = await api.updateBot(currentBot.id, {
        individual_memory: updatedMemories
      });
      if (onBotUpdated) onBotUpdated(updated);
      setNewBotMemory('');
      showToast(`Directives saved for @${currentBot.name}`);
    } catch (err) {
      console.error(err);
      showToast('Failed to update bot memory.');
    }
  };

  // Remove Individual Bot Memory
  const handleRemoveBotMemory = async (idx: number) => {
    if (!currentBot) return;

    try {
      const updatedMemories = (currentBot.individual_memory || []).filter((_, i) => i !== idx);
      const updated = await api.updateBot(currentBot.id, {
        individual_memory: updatedMemories
      });
      if (onBotUpdated) onBotUpdated(updated);
      showToast('Directive removed.');
    } catch (err) {
      console.error(err);
      showToast('Failed to remove directive.');
    }
  };

  const filteredGlobal = globalMemories.filter((m) =>
    m.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xl flex items-center justify-center p-4 select-none animate-springEnter">
      <div className="bg-[#0c0c10] border border-white/[0.12] rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-[0_32px_96px_rgba(0,0,0,0.95)] overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-white/[0.08] flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-b from-white/15 to-white/5 border border-white/10 flex items-center justify-center text-white shadow-xs">
              <BrainCircuit className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-tight">Context & Memory</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Dual workspace memory: Organization facts shared across all bots vs specialist persona directives.
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

        {/* Tabs & Quick Controls */}
        <div className="px-5 py-3 border-b border-white/[0.06] bg-black/20 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex bg-[#14141a] p-1 rounded-xl border border-white/[0.06] gap-1">
            <button
              onClick={() => setActiveTab('global')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition duration-150 ${
                activeTab === 'global'
                  ? 'bg-white/[0.14] text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Global Workspace Memory ({globalMemories.length})
            </button>
            <button
              onClick={() => setActiveTab('individual')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition duration-150 ${
                activeTab === 'individual'
                  ? 'bg-white/[0.14] text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Specialist Bot Directives
            </button>
          </div>

          {activeTab === 'global' && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-400 font-medium">Auto-Recall Context:</span>
              <button
                onClick={handleToggleGlobalMemory}
                className={`w-10 h-5 flex items-center rounded-full p-0.5 transition ${
                  isMemoryEnabled ? 'bg-purple-500 justify-end' : 'bg-zinc-800 justify-start'
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-white shadow-md" />
              </button>
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 select-text">
          {toast && (
            <div className="mb-4 px-4 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>{toast}</span>
            </div>
          )}

          {activeTab === 'global' ? (
            <div className="space-y-4">
              {/* Add Memory Form */}
              <form onSubmit={handleAddGlobalMemory} className="bg-[#111116] border border-white/[0.08] p-3.5 rounded-xl space-y-3">
                <span className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider block">
                  Add Global Organization Fact or Preference
                </span>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={newGlobalType}
                    onChange={(e: any) => setNewGlobalType(e.target.value)}
                    className="bg-[#14141a] border border-white/[0.08] text-xs text-zinc-200 rounded-xl px-2.5 py-1.5 focus:outline-none"
                  >
                    <option value="fact">Company Fact</option>
                    <option value="preference">Workflow Preference</option>
                    <option value="summary">Project Context</option>
                  </select>

                  <input
                    type="text"
                    required
                    placeholder="e.g. 'Always export financial reports in USD' or 'Our primary staging domain is staging.acme.com'..."
                    value={newGlobalContent}
                    onChange={(e) => setNewGlobalContent(e.target.value)}
                    className="flex-1 bg-[#14141a] border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none"
                  />

                  <button type="submit" className="btn-primary text-xs shrink-0">
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Remember</span>
                  </button>
                </div>
              </form>

              {/* Memory Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Filter remembered workspace facts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#111116] border border-white/[0.07] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none"
                />
              </div>

              {/* Memory Items List */}
              <div className="space-y-2">
                {filteredGlobal.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500 text-xs">
                    No memories found. Add organizational facts above to persist across all bot sessions.
                  </div>
                ) : (
                  filteredGlobal.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl bg-[#111116] border border-white/[0.06] hover:border-white/[0.12] flex items-start justify-between gap-3 group transition shadow-xs"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span className="text-[10px] font-mono uppercase bg-white/[0.06] text-zinc-400 px-2 py-0.5 rounded border border-white/[0.06] shrink-0 mt-0.5">
                          {item.type}
                        </span>
                        <p className="text-xs text-zinc-200 leading-relaxed">{item.content}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteGlobalMemory(item.id)}
                        className="text-zinc-500 hover:text-rose-400 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition"
                        title="Delete memory item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            /* Specialist Bot Directives */
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">Select Specialist Bot:</span>
                <select
                  value={selectedBotId}
                  onChange={(e) => setSelectedBotId(e.target.value)}
                  className="bg-[#14141a] border border-white/[0.08] text-xs text-zinc-200 rounded-xl px-2.5 py-1.5 focus:outline-none"
                >
                  {bots.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.avatar} @{b.name} ({b.role_tag})
                    </option>
                  ))}
                </select>
              </div>

              {currentBot && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-[#111116] border border-white/[0.08] space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{currentBot.avatar}</span>
                      <h4 className="text-xs font-semibold text-white">Directives for @{currentBot.name}</h4>
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">{currentBot.description}</p>
                  </div>

                  {/* Add directive */}
                  <form onSubmit={handleAddBotMemory} className="flex gap-2">
                    <input
                      type="text"
                      required
                      placeholder={`Add custom rule or directive specifically for @${currentBot.name}...`}
                      value={newBotMemory}
                      onChange={(e) => setNewBotMemory(e.target.value)}
                      className="flex-1 bg-[#14141a] border border-white/[0.08] rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none"
                    />
                    <button type="submit" className="btn-primary text-xs shrink-0">
                      <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Add Rule</span>
                    </button>
                  </form>

                  {/* Directive List */}
                  <div className="space-y-2">
                    {(currentBot.individual_memory || []).length === 0 ? (
                      <p className="text-xs text-zinc-500 italic py-4 text-center">
                        No custom directives configured for @{currentBot.name}.
                      </p>
                    ) : (
                      currentBot.individual_memory?.map((mem, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-[#111116] border border-white/[0.06] hover:border-white/[0.12] flex items-center justify-between gap-3 group transition"
                        >
                          <span className="text-xs text-zinc-200">{mem}</span>
                          <button
                            onClick={() => handleRemoveBotMemory(idx)}
                            className="text-zinc-500 hover:text-rose-400 p-1 opacity-0 group-hover:opacity-100 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
