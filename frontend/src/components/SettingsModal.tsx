import React from 'react';
import { X, Settings as SettingsIcon } from 'lucide-react';
import { ProviderSettings } from './ProviderSettings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xl flex items-center justify-center p-4 select-none animate-springEnter">
      <div className="bg-[#0c0c10] border border-white/[0.12] rounded-2xl w-full max-w-4xl max-h-[88vh] flex flex-col shadow-[0_32px_96px_rgba(0,0,0,0.95)] overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-white/[0.08] flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-b from-white/15 to-white/5 border border-white/10 flex items-center justify-center text-white shadow-xs">
              <SettingsIcon className="w-4 h-4 text-zinc-300" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-tight">AnyWork Settings & AI Providers</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Configure foundation LLM models (xAI Grok, Claude, OpenAI), cloud sandboxes, and MCP servers.
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 select-text">
          <ProviderSettings />
        </div>
      </div>
    </div>
  );
};
