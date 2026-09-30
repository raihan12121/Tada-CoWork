import React from 'react';
import { GitBranch, Merge, CheckCircle2, Clock } from 'lucide-react';
import type { Step } from '../types';

interface ParallelSwimlanesProps {
  steps: Step[];
  activeStepIds: string[];
}

export const ParallelSwimlanes: React.FC<ParallelSwimlanesProps> = ({ steps, activeStepIds }) => {
  if (steps.length <= 1) return null;

  return (
    <div className="bg-[#0b0b0e] border border-white/[0.08] rounded-xl p-3.5 my-3 shadow-lg">
      <div className="flex items-center gap-2 pb-2.5 border-b border-white/[0.06] mb-3">
        <GitBranch className="w-4 h-4 text-cyan-400" />
        <span className="text-xs font-semibold text-white tracking-wide">
          Multi-Agent Concurrent Workstreams ({steps.length} sub-agents)
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {steps.map((step, idx) => {
          const isActive = activeStepIds.includes(step.id) || step.status === 'running';
          const isDone = step.status === 'completed';

          return (
            <div
              key={step.id}
              className={`p-3 rounded-xl border text-xs transition flex flex-col justify-between ${
                isActive
                  ? 'bg-cyan-950/20 border-cyan-500/50 shadow-[0_0_12px_rgba(34,211,238,0.1)]'
                  : isDone
                  ? 'bg-[#121216]/60 border-emerald-500/30'
                  : 'bg-[#101014]/40 border-white/[0.06]'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[10px] text-cyan-400 font-semibold">
                    Agent-{idx + 1}
                  </span>
                  {isDone ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : isActive ? (
                    <div className="w-3 h-3 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
                  ) : (
                    <Clock className="w-3 h-3 text-zinc-600" />
                  )}
                </div>
                <p className="text-[11px] text-zinc-200 font-medium line-clamp-2">
                  {step.description}
                </p>
              </div>

              <div className="mt-2.5 pt-2 border-t border-white/[0.04] flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                <span className="bg-white/[0.04] px-1.5 py-0.5 rounded text-zinc-300">{step.tool}</span>
                <span className="capitalize text-zinc-500">{step.status}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-2 mt-3 pt-2.5 border-t border-white/[0.06] text-[11px] text-zinc-500">
        <Merge className="w-3.5 h-3.5 text-purple-400" />
        <span>Sub-agents converge into unified deliverable workspace</span>
      </div>
    </div>
  );
};
