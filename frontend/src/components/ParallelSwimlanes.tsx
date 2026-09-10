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
    <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-3.5 my-3 shadow-md">
      <div className="flex items-center space-x-2 pb-2.5 border-b border-[#30363d]/60 mb-3">
        <GitBranch className="w-4 h-4 text-indigo-400" />
        <span className="text-xs font-semibold text-white tracking-wide">
          Multi-Workstream Parallelism ({steps.length} concurrent sub-agents)
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {steps.map((step, idx) => {
          const isActive = activeStepIds.includes(step.id) || step.status === 'running';
          const isDone = step.status === 'completed';

          return (
            <div
              key={step.id}
              className={`p-2.5 rounded-lg border text-xs transition flex flex-col justify-between ${
                isActive
                  ? 'bg-indigo-950/30 border-indigo-500/60 ring-1 ring-indigo-500/20 shadow'
                  : isDone
                  ? 'bg-[#161b22] border-emerald-500/30'
                  : 'bg-[#161b22]/60 border-[#30363d]'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[10px] text-indigo-400 font-bold">
                    SubAgent-{idx + 1}
                  </span>
                  {isDone ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : isActive ? (
                    <div className="w-3 h-3 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
                  ) : (
                    <Clock className="w-3 h-3 text-gray-500" />
                  )}
                </div>
                <p className="text-[11px] text-white font-medium line-clamp-2">
                  {step.description}
                </p>
              </div>

              <div className="mt-2 pt-1.5 border-t border-white/5 flex items-center justify-between text-[10px] text-gray-400 font-mono">
                <span>{step.tool}</span>
                <span className="capitalize text-gray-500">{step.status}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center space-x-1.5 mt-3 pt-2 border-t border-[#30363d]/50 text-[11px] text-gray-400">
        <Merge className="w-3.5 h-3.5 text-purple-400" />
        <span>Workstreams synchronize and converge at final deliverable merge step</span>
      </div>
    </div>
  );
};
