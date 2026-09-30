import React, { useState } from 'react';
import { X, Hash, Plus, Check } from 'lucide-react';
import type { Bot, ChannelCreate } from '../types';

interface ChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  bots: Bot[];
  onCreateChannel: (data: ChannelCreate) => Promise<void>;
}

export const ChannelModal: React.FC<ChannelModalProps> = ({
  isOpen,
  onClose,
  bots,
  onCreateChannel
}) => {
  if (!isOpen) return null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedBotIds, setSelectedBotIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleBot = (id: string) => {
    setSelectedBotIds((prev) =>
      prev.includes(id) ? prev.filter((bId) => bId !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      await onCreateChannel({
        name: name.trim().toLowerCase().replace(/\s+/g, '-'),
        description: description.trim() || undefined,
        bot_ids: selectedBotIds
      });
      onClose();
    } catch (err) {
      console.error('Failed to create channel:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0b0b10] border border-white/[0.1] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-2">
            <Hash className="w-5 h-5 text-cyan-400" />
            <div>
              <h3 className="text-sm font-bold text-white">Create Group Channel</h3>
              <p className="text-[11px] text-zinc-400">Multi-agent collaboration chatroom.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] text-zinc-400 font-medium mb-1">Channel Name</label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-zinc-500 text-sm font-mono">#</span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. leadership, marketing-war-room..."
                className="w-full bg-[#14141c] border border-white/[0.1] rounded-xl pl-7 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-zinc-400 font-medium mb-1">Description / Topic</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What will agents collaborate on here?"
              className="w-full bg-[#14141c] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/20"
            />
          </div>

          <div>
            <label className="block text-[11px] text-zinc-400 font-medium mb-2">
              Select Participating Agents ({selectedBotIds.length})
            </label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {bots.map((bot) => {
                const isSelected = selectedBotIds.includes(bot.id);
                return (
                  <button
                    key={bot.id}
                    type="button"
                    onClick={() => toggleBot(bot.id)}
                    className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition border ${
                      isSelected
                        ? 'bg-cyan-500/10 border-cyan-500/30 text-white'
                        : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">{bot.avatar}</span>
                      <div>
                        <p className="text-xs font-semibold text-zinc-200">{bot.name}</p>
                        <p className="text-[10px] text-zinc-500">{bot.role_tag}</p>
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-cyan-400" />}
                  </button>
                );
              })}
            </div>
          </div>

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
              disabled={isSubmitting}
              className="flex items-center gap-1.5 bg-white text-black hover:bg-zinc-200 px-4 py-2 text-xs font-bold rounded-xl transition shadow-md disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Creating...' : 'Create Channel'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
