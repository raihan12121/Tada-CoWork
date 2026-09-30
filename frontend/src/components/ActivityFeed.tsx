import React, { useState, useEffect, useRef } from 'react';
import { 
  Pause, 
  Play, 
  Square, 
  Terminal, 
  MessageSquareText, 
  CheckCircle2, 
  AlertCircle, 
  PackageCheck,
  Sparkles,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import type { ActivityEvent, ApprovalRequest } from '../types';
import { ApprovalPrompt } from './ApprovalPrompt';

interface ActivityFeedProps {
  events: ActivityEvent[];
  sessionStatus: string;
  pendingApproval?: ApprovalRequest;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onResolveApproval: (decision: 'approved' | 'denied', feedback?: string, alwaysAllow?: boolean) => void;
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  events,
  sessionStatus,
  pendingApproval,
  onPause,
  onResume,
  onCancel,
  onResolveApproval
}) => {
  const [viewMode, setViewMode] = useState<'colleague' | 'technical'>('colleague');
  const [expandedTraceIds, setExpandedTraceIds] = useState<Record<string, boolean>>({});
  const feedEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events, pendingApproval]);

  const isRunning = sessionStatus === 'running';
  const isPaused = sessionStatus === 'paused';

  const toggleExpand = (id: string) => {
    setExpandedTraceIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="bg-[#09090c] border border-white/[0.08] rounded-2xl flex flex-col h-[540px] shadow-2xl overflow-hidden">
      {/* Feed Header */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between bg-black/40">
        <div className="flex items-center gap-3">
          {/* Mode Switcher */}
          <div className="flex bg-[#121216] p-0.5 rounded-lg border border-white/[0.08]">
            <button
              onClick={() => setViewMode('colleague')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
                viewMode === 'colleague'
                  ? 'bg-white text-black shadow-xs'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <MessageSquareText className="w-3.5 h-3.5" />
              <span>Reasoning</span>
            </button>
            <button
              onClick={() => setViewMode('technical')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
                viewMode === 'technical'
                  ? 'bg-white text-black shadow-xs'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Trace Log</span>
            </button>
          </div>
          
          {/* Live Status Indicator */}
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className={`w-2 h-2 rounded-full ${
              isRunning ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-pulse' : isPaused ? 'bg-amber-400' : 'bg-zinc-600'
            }`} />
            <span className="capitalize text-zinc-300 font-medium">
              {sessionStatus.replace('_', ' ')}
            </span>
          </div>
        </div>

        {/* Execution Controls */}
        <div className="flex items-center gap-1.5">
          {isRunning && (
            <button
              onClick={onPause}
              className="flex items-center gap-1.5 text-xs text-amber-300 hover:bg-amber-400/10 px-2.5 py-1 rounded-lg border border-amber-400/20 transition"
              title="Pause execution"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pause</span>
            </button>
          )}

          {isPaused && (
            <button
              onClick={onResume}
              className="flex items-center gap-1.5 text-xs text-emerald-300 hover:bg-emerald-400/10 px-2.5 py-1 rounded-lg border border-emerald-400/20 transition"
              title="Resume execution"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Resume</span>
            </button>
          )}

          {(isRunning || isPaused) && (
            <button
              onClick={onCancel}
              className="flex items-center gap-1.5 text-xs text-rose-400 hover:bg-rose-400/10 px-2.5 py-1 rounded-lg border border-rose-400/20 transition"
              title="Stop execution"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Stop</span>
            </button>
          )}
        </div>
      </div>

      {/* Live Event Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 font-sans">
        {events.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-xs text-zinc-600 italic gap-2">
            <Sparkles className="w-5 h-5 text-zinc-700 animate-pulse" />
            <span>Ready for autonomous agent execution...</span>
          </div>
        ) : (
          events.map((evt) => {
            if (viewMode === 'colleague') {
              const hasDetails = evt.technical_details && Object.keys(evt.technical_details).length > 0;
              const isExpanded = !!expandedTraceIds[evt.id];

              return (
                <div key={evt.id} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] text-xs leading-relaxed animate-fadeIn">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {evt.event_type === 'done' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : evt.event_type === 'error' ? (
                        <AlertCircle className="w-4 h-4 text-rose-400" />
                      ) : evt.event_type === 'artifact_created' ? (
                        <PackageCheck className="w-4 h-4 text-cyan-400" />
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-cyan-400/80 mt-1 shadow-[0_0_6px_rgba(34,211,238,0.6)]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">
                          {evt.event_type.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] text-zinc-600 font-mono">
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className={`mt-0.5 ${
                        evt.event_type === 'done' ? 'text-emerald-300 font-medium' : evt.event_type === 'error' ? 'text-rose-300 font-medium' : 'text-zinc-200'
                      }`}>
                        {evt.message}
                      </p>

                      {hasDetails && (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => toggleExpand(evt.id)}
                            className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 font-mono transition"
                          >
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            <span>{isExpanded ? 'Hide output' : 'View output data'}</span>
                          </button>
                          {isExpanded && (
                            <pre className="mt-1.5 p-2.5 rounded-lg bg-black/60 border border-white/[0.06] font-mono text-[10px] text-zinc-300 overflow-x-auto">
                              {JSON.stringify(evt.technical_details, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            } else {
              // Technical Trace View
              return (
                <div key={evt.id} className="bg-black/70 border border-white/[0.08] rounded-xl p-3 font-mono text-[11px] space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-cyan-400 uppercase tracking-wider">[{evt.event_type}]</span>
                    <span className="text-zinc-500">{new Date(evt.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-zinc-200 font-medium">{evt.message}</div>
                  {evt.technical_details && (
                    <pre className="text-zinc-400 text-[10px] overflow-x-auto bg-[#0a0a0d] p-2.5 rounded-lg mt-1.5 border border-white/[0.06]">
                      {JSON.stringify(evt.technical_details, null, 2)}
                    </pre>
                  )}
                </div>
              );
            }
          })
        )}

        {/* Render Pending Approval Prompt inline in the activity stream */}
        {pendingApproval && (
          <ApprovalPrompt
            approval={pendingApproval}
            onResolve={onResolveApproval}
          />
        )}

        <div ref={feedEndRef} />
      </div>
    </div>
  );
};
