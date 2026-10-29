import React, { useState } from 'react';
import { BrainCircuit, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';

interface ThinkingCardProps {
  thought: string;
  narration?: string;
  isStreaming?: boolean;
}

export const ThinkingCard: React.FC<ThinkingCardProps> = ({
  thought,
  narration,
  isStreaming = false
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!thought && !narration) return null;

  return (
    <div className="my-2 max-w-2xl mx-auto rounded-xl bg-[#0c0c12] border border-white/[0.08] overflow-hidden shadow-sm transition-all duration-200">
      {/* Header bar */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3.5 py-2 flex items-center justify-between text-left bg-white/[0.02] hover:bg-white/[0.05] transition group select-none"
      >
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-400">
            {isStreaming ? (
              <BrainCircuit className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-zinc-300 group-hover:text-white transition">
                {isStreaming ? 'Thinking...' : 'Reasoning Process'}
              </span>
              {isStreaming && (
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)] animate-ping" />
              )}
            </div>
            {narration && (
              <p className="text-[10px] text-zinc-500 truncate max-w-md mt-0.5">
                {narration}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-zinc-500 group-hover:text-zinc-300 text-[10px] font-mono">
          <span>{isExpanded ? 'Hide' : 'Inspect'}</span>
          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </div>
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="p-3.5 pt-2 border-t border-white/[0.06] bg-black/40 text-[11px] text-zinc-300 font-mono leading-relaxed select-text space-y-2 animate-slideDownFade">
          <div className="p-2.5 rounded-lg bg-[#08080c] border border-white/[0.06] whitespace-pre-wrap max-h-60 overflow-y-auto">
            {thought}
          </div>
        </div>
      )}
    </div>
  );
};
