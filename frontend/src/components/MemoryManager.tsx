import React, { useState, useEffect } from 'react';
import { 
  BrainCircuit, 
  Trash2, 
  Plus, 
  Power,
  ShieldCheck
} from 'lucide-react';
import type { MemoryItem } from '../types';
import { api } from '../services/api';

export const MemoryManager: React.FC = () => {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [isEnabled, setIsEnabled] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState<'preference' | 'fact' | 'summary'>('preference');
  const [newKey, setNewKey] = useState('');

  const loadMemories = async () => {
    try {
      const items = await api.listMemories();
      setMemories(items);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadMemories();
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

  const filteredMemories = filterType === 'all' 
    ? memories 
    : memories.filter(m => m.type === filterType);

  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      {/* Header with Title and Global Toggle */}
      <div className="flex items-center justify-between pb-6 border-b border-[#30363d] mb-6">
        <div>
          <div className="flex items-center space-x-2">
            <BrainCircuit className="w-6 h-6 text-purple-400" />
            <h2 className="text-xl font-bold text-white tracking-wide">Memory Manager</h2>
          </div>
          <p className="text-xs text-gray-400 mt-1 max-w-xl">
            Coagent remembers your verified preferences and domain facts across sessions so future tasks require less setup.
            Items are strictly isolated to this workspace.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleToggle}
            className={`flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${
              isEnabled 
                ? 'bg-purple-950/40 border-purple-500/50 text-purple-300' 
                : 'bg-[#21262d] border-[#30363d] text-gray-400'
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{isEnabled ? 'Long-Term Memory: ON' : 'Memory: OFF'}</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center space-x-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Memory</span>
          </button>
        </div>
      </div>

      {/* Tenant Isolation Banner */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3 text-xs text-gray-300 flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Tenant boundary: Memory stored here is scoped strictly to workspace <strong>'default'</strong>.</span>
        </div>
        <span className="text-[11px] text-gray-500 font-mono">Zero Cross-Tenant Leakage</span>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center space-x-2 mb-4">
        {['all', 'preference', 'fact', 'summary'].map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`text-xs capitalize px-3 py-1 rounded-md transition ${
              filterType === type 
                ? 'bg-[#21262d] text-white font-medium border border-gray-600' 
                : 'text-gray-400 hover:text-white hover:bg-[#21262d]/50'
            }`}
          >
            {type}s
          </button>
        ))}
      </div>

      {/* Memory List */}
      <div className="space-y-2.5">
        {filteredMemories.length === 0 ? (
          <div className="text-center py-12 bg-[#161b22] rounded-xl border border-[#30363d] text-xs text-gray-500 italic">
            No memories remembered for this category yet.
          </div>
        ) : (
          filteredMemories.map((mem) => (
            <div
              key={mem.id}
              className="bg-[#161b22] border border-[#30363d] hover:border-gray-500 p-4 rounded-xl transition flex items-start justify-between group"
            >
              <div className="space-y-1.5 flex-1 pr-4">
                <div className="flex items-center space-x-2">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    mem.type === 'preference' ? 'bg-indigo-500/20 text-indigo-300' :
                    mem.type === 'fact' ? 'bg-emerald-500/20 text-emerald-300' :
                    'bg-amber-500/20 text-amber-300'
                  }`}>
                    {mem.type}
                  </span>
                  {mem.key && (
                    <span className="text-[11px] font-mono text-gray-400">
                      key: {mem.key}
                    </span>
                  )}
                </div>
                <p className="text-xs text-white leading-relaxed">{mem.content}</p>
                <div className="text-[10px] text-gray-500">
                  Recorded on {new Date(mem.created_at).toLocaleDateString()}
                </div>
              </div>

              <button
                onClick={() => handleDelete(mem.id)}
                className="text-gray-500 hover:text-rose-400 p-1.5 rounded transition"
                title="Delete memory item"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Create Memory Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl max-w-md w-full p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-white mb-3">Add Long-Term Memory</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Memory Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as any)}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded p-2 text-xs text-white"
                >
                  <option value="preference">Preference (Format/Style/Workflow)</option>
                  <option value="fact">Fact (Durable contextual information)</option>
                  <option value="summary">Summary (Past task recollection)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Identifier Key (Optional)</label>
                <input
                  type="text"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="e.g. report_style or fiscal_year"
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded p-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Content</label>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="What should Coagent remember? (e.g. 'I prefer spreadsheets with formula totals and dark headers')"
                  rows={3}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded p-2 text-xs text-white resize-none"
                  required
                />
              </div>
              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="text-xs text-gray-400 hover:text-white px-3 py-1.5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-1.5 rounded"
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
