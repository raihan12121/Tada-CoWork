import React, { useState } from 'react';
import { 
  Terminal, 
  Globe, 
  Search, 
  FileText, 
  Zap, 
  CheckCircle2, 
  RotateCw, 
  ChevronDown, 
  ChevronRight,
  Code2
} from 'lucide-react';

interface ToolCallCardProps {
  tool: string;
  params?: any;
  result?: any;
  status: 'running' | 'completed' | 'failed';
  message: string;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({
  tool,
  params,
  result,
  status,
  message
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getToolMeta = (toolName: string) => {
    switch (toolName) {
      case 'browser_automation':
        return { label: 'CDP Browser', icon: Globe, color: 'text-cyan-400', border: 'border-cyan-500/25', bg: 'bg-cyan-500/10' };
      case 'execute_code':
        return { label: 'Python Sandbox', icon: Terminal, color: 'text-emerald-400', border: 'border-emerald-500/25', bg: 'bg-emerald-500/10' };
      case 'web_search':
      case 'web_fetch':
        return { label: 'Web Intelligence', icon: Search, color: 'text-blue-400', border: 'border-blue-500/25', bg: 'bg-blue-500/10' };
      case 'create_document':
      case 'read_file':
      case 'write_file':
      case 'move_file':
      case 'delete_file':
        return { label: 'Workspace Filesystem', icon: FileText, color: 'text-amber-400', border: 'border-amber-500/25', bg: 'bg-amber-500/10' };
      case 'swarm_delegate':
        return { label: 'Agent Swarm', icon: Zap, color: 'text-purple-400', border: 'border-purple-500/25', bg: 'bg-purple-500/10' };
      default:
        return { label: toolName, icon: Code2, color: 'text-zinc-300', border: 'border-white/10', bg: 'bg-white/5' };
    }
  };

  const meta = getToolMeta(tool);
  const Icon = meta.icon;

  return (
    <div className="my-2 max-w-2xl mx-auto rounded-xl bg-[#0b0b10] border border-white/[0.08] overflow-hidden shadow-xs transition-all duration-200">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3.5 py-2.5 flex items-center justify-between text-left hover:bg-white/[0.04] transition group select-none"
      >
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          <div className={`p-1.5 rounded-lg border ${meta.border} ${meta.bg} ${meta.color} shrink-0`}>
            <Icon className="w-3.5 h-3.5" />
          </div>

          <div className="truncate">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-white tracking-tight">
                {meta.label}
              </span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/[0.05] border border-white/[0.08] text-zinc-400">
                {tool}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 truncate mt-0.5">
              {message}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {status === 'running' ? (
            <span className="flex items-center gap-1 text-[10px] text-cyan-400 font-mono bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20">
              <RotateCw className="w-3 h-3 animate-spin" />
              <span>Running</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3" />
              <span>Completed</span>
            </span>
          )}

          <div className="text-zinc-500 group-hover:text-zinc-300 transition">
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </div>
        </div>
      </button>

      {/* Expanded Parameters & Output Drawer */}
      {isExpanded && (
        <div className="p-3.5 pt-2 border-t border-white/[0.06] bg-black/50 text-[11px] font-mono space-y-2.5 animate-slideDownFade select-text">
          {params && Object.keys(params).length > 0 && (
            <div>
              <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">
                Input Parameters
              </span>
              <pre className="p-2.5 rounded-lg bg-[#08080c] border border-white/[0.06] text-zinc-300 overflow-x-auto max-h-40">
                {JSON.stringify(params, null, 2)}
              </pre>
            </div>
          )}

          {result && (
            <div>
              <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">
                Execution Result
              </span>
              <pre className="p-2.5 rounded-lg bg-[#08080c] border border-white/[0.06] text-emerald-300 overflow-x-auto max-h-48">
                {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
