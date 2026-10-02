import React, { useState } from 'react';
import { X, Save, Copy, Trash2, Share2, Brain } from 'lucide-react';
import type { Bot, BotCreate, BotUpdate } from '../types';

interface BotModalProps {
  isOpen: boolean;
  onClose: () => void;
  bot?: Bot | null;
  onSave: (data: BotCreate | BotUpdate) => Promise<void>;
  onDuplicate?: (botId: string) => Promise<void>;
  onDelete?: (botId: string) => Promise<void>;
  onExportTemplate?: (botId: string) => Promise<void>;
}

const AVATAR_OPTIONS = ['👔', '⚡', '💻', '🎬', '📬', '📊', '🤖', '🧠', '🛠️', '🎨', '🚀', '🔍'];
const FOLDER_OPTIONS = ['Leadership', 'Operations', 'Marketing', 'Engineering', 'General'];

export const BotModal: React.FC<BotModalProps> = ({
  isOpen,
  onClose,
  bot,
  onSave,
  onDuplicate,
  onDelete,
  onExportTemplate
}) => {
  const [name, setName] = useState(bot?.name || '');
  const [avatar, setAvatar] = useState(bot?.avatar || '🤖');
  const [roleTag, setRoleTag] = useState(bot?.role_tag || '');
  const [description, setDescription] = useState(bot?.description || '');
  const [folderName, setFolderName] = useState(bot?.folder_name || 'General');
  const [pinned, setPinned] = useState(bot?.pinned || false);
  const [isSaving, setIsSaving] = useState(false);
  const [memoryInput, setMemoryInput] = useState('');
  const [memories, setMemories] = useState<string[]>(bot?.individual_memory || []);

  const [prevBotId, setPrevBotId] = useState<string | null | undefined>(bot?.id);
  if (bot?.id !== prevBotId) {
    setPrevBotId(bot?.id);
    setName(bot?.name || '');
    setAvatar(bot?.avatar || '🤖');
    setRoleTag(bot?.role_tag || '');
    setDescription(bot?.description || '');
    setFolderName(bot?.folder_name || 'General');
    setPinned(bot?.pinned || false);
    setMemories(bot?.individual_memory || []);
  }

  const handleAddMemory = () => {
    if (!memoryInput.trim()) return;
    setMemories((prev) => [...prev, memoryInput.trim()]);
    setMemoryInput('');
  };

  const handleRemoveMemory = (idx: number) => {
    setMemories((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) return;
    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        avatar,
        role_tag: roleTag.trim() || 'Assistant',
        description: description.trim(),
        folder_name: folderName,
        pinned,
        individual_memory: memories
      });
      onClose();
    } catch (err) {
      console.error('Failed to save bot:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xl flex items-center justify-center p-4 select-none animate-springEnter">
      <div className="bg-[#0c0c10] border border-white/[0.12] rounded-2xl w-full max-w-lg shadow-[0_32px_96px_rgba(0,0,0,0.95)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-b from-white/15 to-white/5 border border-white/10 flex items-center justify-center text-sm shadow-xs">
              <span>{avatar}</span>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-white tracking-tight">
                {bot ? `Edit ${bot.name}` : 'Create New Specialist Bot'}
              </h3>
              <p className="text-[11px] text-zinc-400 mt-0.5">Configure persona, skills, and memory.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.06] transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 select-text">
          {/* Avatar & Name */}
          <div className="flex gap-3">
            <div>
              <label className="block text-[11px] text-zinc-400 font-medium mb-1">Avatar</label>
              <select
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                className="bg-[#14141a] border border-white/[0.1] rounded-xl px-2.5 py-2 text-base text-white focus:outline-none"
              >
                {AVATAR_OPTIONS.map((av) => (
                  <option key={av} value={av}>{av}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[11px] text-zinc-400 font-medium mb-1">Specialist Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Klaus, Dev, Motion..."
                className="w-full bg-[#14141a] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/20"
              />
            </div>
          </div>

          {/* Role Tag & Folder */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-zinc-400 font-medium mb-1">Role Title / Tag</label>
              <input
                type="text"
                value={roleTag}
                onChange={(e) => setRoleTag(e.target.value)}
                placeholder="e.g. Chief of Staff, Animator..."
                className="w-full bg-[#14141a] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/20"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 font-medium mb-1">Sidebar Folder</label>
              <select
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                className="w-full bg-[#14141a] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              >
                {FOLDER_OPTIONS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] text-zinc-400 font-medium mb-1">Description & Objective</label>
            <textarea
              rows={2}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this bot specialize in? What workflows should it execute?"
              className="w-full bg-[#14141a] border border-white/[0.1] rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/20 leading-relaxed resize-none"
            />
          </div>

          {/* Pin to top */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="pinnedBot"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="rounded bg-black border-zinc-700 text-cyan-500 focus:ring-0"
            />
            <label htmlFor="pinnedBot" className="text-xs text-zinc-300 font-medium cursor-pointer">
              Pin to top of sidebar for quick access
            </label>
          </div>

          {/* Memory Directives */}
          <div className="pt-2 border-t border-white/[0.08]">
            <div className="flex items-center gap-1.5 mb-2">
              <Brain className="w-3.5 h-3.5 text-purple-400" />
              <label className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">
                Persona Directives & Rules ({memories.length})
              </label>
            </div>

            <div className="flex gap-2 mb-2">
              <input
                type="text"
                placeholder="e.g. Always generate typescript with strict null checks..."
                value={memoryInput}
                onChange={(e) => setMemoryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddMemory();
                  }
                }}
                className="flex-1 bg-[#14141a] border border-white/[0.1] rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddMemory}
                className="px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold text-white rounded-xl border border-white/[0.08] transition"
              >
                Add Rule
              </button>
            </div>

            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {memories.map((mem, i) => (
                <div key={i} className="flex items-center justify-between bg-black/40 border border-white/[0.06] px-2.5 py-1.5 rounded-lg text-xs text-zinc-300">
                  <span className="truncate">{mem}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveMemory(i)}
                    className="text-zinc-500 hover:text-rose-400 ml-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {bot && onDuplicate && (
                <button
                  type="button"
                  onClick={() => onDuplicate(bot.id)}
                  className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition"
                  title="Duplicate Bot"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              )}
              {bot && onExportTemplate && (
                <button
                  type="button"
                  onClick={() => onExportTemplate(bot.id)}
                  className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition"
                  title="Export Template JSON"
                >
                  <Share2 className="w-3.5 h-3.5" />
                </button>
              )}
              {bot && onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(bot.id)}
                  className="p-2 text-zinc-400 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition"
                  title="Delete Bot"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs text-zinc-400 hover:text-white rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="btn-primary text-xs"
              >
                <Save className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>{isSaving ? 'Saving...' : 'Save Specialist'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
