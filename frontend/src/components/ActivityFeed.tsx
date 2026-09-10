import React, { useState, useEffect, useRef } from 'react';
import { 
  Pause, 
  Play, 
  Square, 
  Terminal, 
  MessageSquareText, 
  CheckCircle, 
  AlertCircle, 
  PackageCheck
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
  const feedEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events, pendingApproval]);

  const isRunning = sessionStatus === 'running';
  const isPaused = sessionStatus === 'paused';

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl flex flex-col h-[520px] shadow-lg">
      {/* Header with View Toggle and Controls */}
      <div className="p-3.5 border-b border-[#30363d] flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="flex bg-[#0d1117] p-0.5 rounded-lg border border-[#30363d]">
            <button
              onClick={() => setViewMode('colleague')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-medium transition ${
                viewMode === 'colleague'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <MessageSquareText className="w-3.5 h-3.5" />
              <span>Colleague View</span>
            </button>
            <button
              onClick={() => setViewMode('technical')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-medium transition ${
                viewMode === 'technical'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Technical Trace</span>
            </button>
          </div>
          
          <div className="flex items-center space-x-1.5 text-xs text-gray-400 pl-2">
            <span className={`w-2 h-2 rounded-full ${
              isRunning ? 'bg-emerald-400 animate-pulse' : isPaused ? 'bg-amber-400' : 'bg-gray-500'
            }`} />
            <span className="capitalize">{sessionStatus.replace('_', ' ')}</span>
          </div>
        </div>

        {/* Execution Controls */}
        <div className="flex items-center space-x-2">
          {isRunning && (
            <button
              onClick={onPause}
              className="flex items-center space-x-1 text-xs text-amber-400 hover:bg-amber-400/10 px-2 py-1 rounded border border-amber-500/30 transition"
              title="Pause execution"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pause</span>
            </button>
          )}

          {isPaused && (
            <button
              onClick={onResume}
              className="flex items-center space-x-1 text-xs text-emerald-400 hover:bg-emerald-400/10 px-2 py-1 rounded border border-emerald-500/30 transition"
              title="Resume execution"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Resume</span>
            </button>
          )}

          {(isRunning || isPaused) && (
            <button
              onClick={onCancel}
              className="flex items-center space-x-1 text-xs text-rose-400 hover:bg-rose-400/10 px-2 py-1 rounded border border-rose-500/30 transition"
              title="Cancel execution"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Cancel</span>
            </button>
          )}
        </div>
      </div>

      {/* Live Event Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 font-sans">
        {events.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-gray-500 italic">
            Waiting for execution to begin...
          </div>
        ) : (
          events.map((evt) => {
            if (viewMode === 'colleague') {
              return (
                <div key={evt.id} className="flex items-start space-x-3 text-xs leading-relaxed animate-fadeIn">
                  <div className="mt-0.5 shrink-0">
                    {evt.event_type === 'done' ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    ) : evt.event_type === 'error' ? (
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                    ) : evt.event_type === 'artifact_created' ? (
                      <PackageCheck className="w-4 h-4 text-purple-400" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={`font-normal ${
                      evt.event_type === 'done' ? 'text-emerald-300 font-semibold' : 'text-gray-200'
                    }`}>
                      {evt.message}
                    </p>
                    <span className="text-[10px] text-gray-500">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              );
            } else {
              // Technical Trace View
              return (
                <div key={evt.id} className="bg-[#0d1117] border border-[#30363d] rounded-lg p-2.5 font-mono text-[11px] text-gray-300 space-y-1">
                  <div className="flex items-center justify-between text-gray-500 text-[10px]">
                    <span className="uppercase font-bold text-indigo-400">[{evt.event_type}]</span>
                    <span>{new Date(evt.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-white font-medium">{evt.message}</div>
                  {evt.technical_details && (
                    <pre className="text-gray-400 text-[10px] overflow-x-auto bg-[#161b22] p-2 rounded mt-1 border border-white/5">
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
