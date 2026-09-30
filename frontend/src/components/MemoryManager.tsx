import React, { useState, useEffect } from 'react';
import { 
  BrainCircuit, 
  Trash2, 
  Plus, 
  Power,
  ShieldCheck,
  Pencil,
  Download
} from 'lucide-react';
import type { MemoryItem } from '../types';
import { api } from '../services/api';

export const MemoryManager: React.FC = () => {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [isEnabled, setIsEnabled] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState<'preference' | 'fact' | 'summary'>('preference');
  const [newKey, setNewKey] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');

  useEffect(() => {
    let ignore = false;
    api.listMemories().then((items) => {
      if (!ignore) setMemories(items);
    }).catch(console.error);
    api.getMemoryStatus().then((status) => setIsEnabled(status.enabled)).catch(console.error);
    return () => { ignore = true; };
  }, []);

  const handleToggle = async () => {
    const nextState = !isEnabled;
    setIsEnabled(nextState);
    await api.toggleMemory(nextState);
  };

  const handleDelete = async (id: string) => {
    await api.deleteMemory(id);
    setMemories(memories.filter(m => m.id !== id));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    const item = await api.createMemory(newType, newContent.trim(), newKey.trim() || undefined);
    setMemories([item, ...memories]);
    setNewContent('');
    setNewKey('');
    setShowAddModal(false);
  };

  const handleEdit = async (id: string) => {
    if (!editingContent.trim()) return;
    const updated = await api.updateMemory(id, editingContent.trim());
    setMemories(memories.map((memory) => memory.id === id ? updated : memory));
    setEditingId(null);
    setEditingContent('');
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(memories, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'coagent-memory.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const filteredMemories = filterType === 'all' 
    ? memories 
    : memories.filter(m => m.type === filterType);

  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between pb-6 border-b border-white/[0.08] mb-6 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Persistent Memory & Context</h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1 max-w-xl">
            Retain verified user preferences, domain knowledge, and past workflow summaries across sessions. 
            Cryptographically isolated per workspace.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleToggle}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition ${
              isEnabled 
                ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300' 
                : 'bg-white/[0.04] border-white/[0.08] text-zinc-400'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{isEnabled ? 'Memory: Active' : 'Memory: Offline'}</span>
          </button>

          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 text-xs font-medium px-3 py-1.5 rounded-xl border border-white/[0.08] transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            disabled={!isEnabled}
            className="flex items-center gap-1.5 bg-white text-black hover:bg-zinc-200 text-xs font-semibold px-3.5 py-1.5 rounded-xl transition disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Add Memory</span>
          </button>
        </div>
      </div>

      {!isEnabled && (
        <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-200 mb-6">
          Enable memory before recording new facts. Existing records remain accessible and deletable while offline.
        </div>
      )}

      {/* Tenant Isolation Banner */}
      <div className="bg-[#09090c] border border-white/[0.08] rounded-xl p-3 text-xs text-zinc-300 flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Workspace isolation: Storage is strictly scoped to tenant <strong>'default'</strong>.</span>
        </div>
        <span className="text-[10px] text-zinc-500 font-mono">Zero Cross-Tenant Leakage</span>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 mb-4">
        {['all', 'preference', 'fact', 'summary'].map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`text-xs capitalize px-3 py-1 rounded-lg transition ${
              filterType === type 
                ? 'bg-white text-black font-semibold shadow-xs' 
                : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            {type}s
          </button>
        ))}
      </div>

      {/* Memory List */}
      <div className="space-y-2">
        {filteredMemories.length === 0 ? (
          <div className="text-center py-12 bg-[#09090c] rounded-2xl border border-white/[0.08] text-xs text-zinc-600 italic">
            No memories remembered for this category yet.
          </div>
        ) : (
          filteredMemories.map((mem) => (
            <div
              key={mem.id}
              className="bg-[#09090c] border border-white/[0.08] hover:border-white/[0.18] p-4 rounded-xl transition flex items-start justify-between group shadow-sm"
            >
              <div className="space-y-1.5 flex-1 pr-4">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full ${
                    mem.type === 'preference' ? 'bg-cyan-500/20 text-cyan-300' :
                    mem.type === 'fact' ? 'bg-emerald-500/20 text-emerald-300' :
                    'bg-amber-500/20 text-amber-300'
                  }`}>
                    {mem.type}
                  </span>
                  {mem.key && (
                    <span className="text-[11px] font-mono text-zinc-500">
                      key: {mem.key}
                    </span>
                  )}
                </div>
                {editingId === mem.id ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      value={editingContent}
                      onChange={(event) => setEditingContent(event.target.value)}
                      className="flex-1 bg-[#121215] border border-white/[0.12] rounded-lg p-2 text-xs text-white focus:outline-none"
                      autoFocus
                    />
                    <button onClick={() => handleEdit(mem.id)} className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1">Save</button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-zinc-400 hover:text-white px-2 py-1">Cancel</button>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-200 leading-relaxed">{mem.content}</p>
                )}
                <div className="text-[10px] text-zinc-500 font-mono">
                  Recorded on {new Date(mem.created_at).toLocaleDateString()}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setEditingId(mem.id); setEditingContent(mem.content); }}
                  className="text-zinc-500 hover:text-white p-1.5 rounded-lg transition"
                  title="Edit memory item"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(mem.id)}
                  className="text-zinc-500 hover:text-rose-400 p-1.5 rounded-lg transition"
                  title="Delete memory item"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Memory Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0e0e12] border border-white/[0.12] rounded-2xl max-w-md w-full p-5 shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-3">Add Durable Memory</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Memory Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as any)}
                  className="w-full bg-[#16161b] border border-white/[0.1] rounded-lg p-2 text-xs text-white focus:outline-none"
                >
                  <option value="preference">Preference (Format/Style/Workflow)</option>
                  <option value="fact">Fact (Durable contextual information)</option>
                  <option value="summary">Summary (Past task recollection)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Identifier Key (Optional)</label>
                <input
                  type="text"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="e.g. report_style or fiscal_year"
                  className="w-full bg-[#16161b] border border-white/[0.1] rounded-lg p-2 text-xs text-white focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Content</label>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="What should Coagent remember? (e.g. 'I prefer spreadsheets with formula totals and dark headers')"
                  rows={3}
                  className="w-full bg-[#16161b] border border-white/[0.1] rounded-lg p-2 text-xs text-white resize-none focus:outline-none"
                  required
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="text-xs text-zinc-400 hover:text-white px-3 py-1.5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-white text-black hover:bg-zinc-200 text-xs font-semibold px-4 py-1.5 rounded-lg transition"
                >
                  Save Memory
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
