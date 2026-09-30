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
  if (!isOpen) return null;

  const [name, setName] = useState(bot?.name || '');
  const [avatar, setAvatar] = useState(bot?.avatar || '🤖');
  const [roleTag, setRoleTag] = useState(bot?.role_tag || '');
  const [description, setDescription] = useState(bot?.description || '');
  const [folderName, setFolderName] = useState(bot?.folder_name || 'General');
  const [pinned, setPinned] = useState(bot?.pinned || false);
  const [isSaving, setIsSaving] = useState(false);
  const [memoryInput, setMemoryInput] = useState('');
  const [memories, setMemories] = useState<string[]>(bot?.individual_memory || []);

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

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0b0b10] border border-white/[0.1] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-2">
            <span className="text-xl">{avatar}</span>
            <div>
              <h3 className="text-sm font-bold text-white">
                {bot ? `Edit ${bot.name}` : 'Create New Bot'}
              </h3>
              <p className="text-[11px] text-zinc-400">Configure persona, skills, and memory.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Avatar & Name */}
          <div className="flex gap-3">
            <div>
              <label className="block text-[11px] text-zinc-400 font-medium mb-1">Avatar</label>
              <select
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                className="bg-[#14141c] border border-white/[0.1] rounded-xl px-2 py-2 text-lg text-white focus:outline-none"
              >
                {AVATAR_OPTIONS.map((av) => (
                  <option key={av} value={av}>{av}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[11px] text-zinc-400 font-medium mb-1">Bot Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Klaus, Dev, Motion..."
                className="w-full bg-[#14141c] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/20"
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
                className="w-full bg-[#14141c] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/20"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 font-medium mb-1">Sidebar Folder</label>
              <select
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                className="w-full bg-[#14141c] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              >
                {FOLDER_OPTIONS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Pinned Checkbox */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="pinnedBot"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="rounded bg-[#14141c] border-white/20 text-cyan-400 focus:ring-0"
            />
            <label htmlFor="pinnedBot" className="text-xs text-zinc-300 font-medium cursor-pointer">
              Pin to top of sidebar
            </label>
          </div>

          {/* System Instructions / Prompt */}
          <div>
            <label className="block text-[11px] text-zinc-400 font-medium mb-1">
              Job Description & System Instructions
            </label>
            <textarea
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the bot's job, responsibilities, tone, and what tasks it should handle or delegate..."
              className="w-full bg-[#14141c] border border-white/[0.1] rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/20 resize-none font-mono"
            />
          </div>

          {/* Individual Memory */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] text-zinc-400 font-medium flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-cyan-400" />
                <span>Individual Bot Memory</span>
              </label>
              <span className="text-[10px] text-zinc-500">Private to this bot</span>
            </div>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={memoryInput}
                onChange={(e) => setMemoryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddMemory();
                  }
                }}
                placeholder="Add a permanent rule or fact..."
                className="flex-1 bg-[#14141c] border border-white/[0.1] rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddMemory}
                className="bg-white/[0.1] hover:bg-white/[0.2] text-xs font-semibold px-3 py-1.5 rounded-xl text-white transition"
              >
                Add
              </button>
            </div>
            <div className="space-y-1 max-h-24 overflow-y-auto">
              {memories.map((m, i) => (
                <div key={i} className="flex items-center justify-between bg-white/[0.03] border border-white/[0.06] px-2.5 py-1.5 rounded-lg text-xs text-zinc-300">
                  <span className="truncate flex-1">{m}</span>
                  <button type="button" onClick={() => handleRemoveMemory(i)} className="text-zinc-500 hover:text-rose-400 ml-2">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions for existing bot */}
          {bot && (
            <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between">
              <div className="flex gap-2">
                {onDuplicate && (
                  <button
                    type="button"
                    onClick={() => onDuplicate(bot.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs text-zinc-300 transition"
                    title="Duplicate bot configuration"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Duplicate</span>
                  </button>
                )}
                {onExportTemplate && (
                  <button
                    type="button"
                    onClick={() => onExportTemplate(bot.id)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs text-zinc-300 transition"
                    title="Share as template"
                  >
                    <Share2 className="w-3 h-3" />
                    <span>Template</span>
                  </button>
                )}
              </div>
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(bot.id)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs transition"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Delete</span>
                </button>
              )}
            </div>
          )}

          {/* Submit */}
          <div className="pt-3 border-t border-white/[0.08] flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white rounded-xl hover:bg-white/[0.06] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 bg-white text-black hover:bg-zinc-200 px-4 py-2 text-xs font-bold rounded-xl transition shadow-md disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Saving...' : 'Save Bot'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
