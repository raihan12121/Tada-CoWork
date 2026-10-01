import React, { useState } from 'react';
import { 
  ShieldAlert, 
  AlertTriangle, 
  Check, 
  X, 
  ExternalLink,
  Lock,
  FileDiff
} from 'lucide-react';
import type { ApprovalRequest } from '../types';

interface ApprovalPromptProps {
  approval: ApprovalRequest;
  onResolve: (decision: 'approved' | 'denied', feedback?: string, alwaysAllow?: boolean) => void;
}

export const ApprovalPrompt: React.FC<ApprovalPromptProps> = ({ approval, onResolve }) => {
  const [feedback, setFeedback] = useState('');
  const [alwaysAllow, setAlwaysAllow] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isHighRisk = approval.risk_level === 'high';

  const handleDecision = async (decision: 'approved' | 'denied') => {
    setIsSubmitting(true);
    try {
      await onResolve(decision, feedback.trim() || undefined, alwaysAllow);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`my-4 rounded-2xl border p-5 shadow-[0_20px_50px_rgba(0,0,0,0.85)] transition-all animate-springEnter ${
      isHighRisk 
        ? 'bg-gradient-to-b from-rose-950/25 to-[#0e0c0f] border-rose-500/40' 
        : 'bg-gradient-to-b from-amber-950/25 to-[#0e0d0c] border-amber-500/40'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          {isHighRisk ? (
            <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/25 text-rose-400 flex items-center justify-center shadow-xs">
              <ShieldAlert className="w-5 h-5" />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 text-amber-400 flex items-center justify-center shadow-xs">
              <AlertTriangle className="w-5 h-5" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold text-white tracking-tight">
                {isHighRisk ? 'High-Risk Action Approval Required' : 'Action Confirmation Required'}
              </h4>
              <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full ${
                isHighRisk ? 'bg-rose-500 text-white' : 'bg-amber-400 text-black'
              }`}>
                {approval.risk_level} Risk
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5 font-mono">
              Action: <span className="font-semibold text-zinc-200">{approval.action_type}</span>
            </p>
          </div>
        </div>

        {approval.takeover_mode && (
          <div className="flex items-center gap-1.5 bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs px-2.5 py-1 rounded-lg">
            <Lock className="w-3.5 h-3.5" />
            <span className="font-semibold">Takeover Mode</span>
          </div>
        )}
      </div>

      {/* Body / Consequence */}
      <div className="py-3 space-y-2.5 text-xs">
        <div>
          <span className="text-zinc-500 font-mono text-[11px]">Target Affected:</span>
          <p className="font-mono text-zinc-200 bg-black/60 p-2.5 rounded-xl mt-1 border border-white/[0.08]">
            {approval.target}
          </p>
        </div>

        <div>
          <span className="text-zinc-500 font-mono text-[11px]">Consequence Assessment:</span>
          <p className="text-zinc-300 mt-1 leading-relaxed">
            {approval.consequence}
          </p>
        </div>

        {approval.diff && (
          <div>
            <div className="flex items-center gap-1.5 text-zinc-400 mb-1 font-mono text-[11px]">
              <FileDiff className="w-3.5 h-3.5 text-cyan-400" />
              <span>Proposed Changes Diff:</span>
            </div>
            <pre className="text-[11px] font-mono text-zinc-300 bg-black/80 p-3 rounded-xl border border-white/[0.08] overflow-x-auto leading-normal">
              {approval.diff}
            </pre>
          </div>
        )}

        {/* Takeover Mode Link if external browser interaction is requested */}
        {approval.takeover_mode && approval.takeover_url && (
          <div className="bg-cyan-950/25 border border-cyan-500/30 p-3 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-white font-medium">External Login / Checkout Required</p>
              <p className="text-zinc-400 text-[11px] mt-0.5">Control the browser directly to complete payment or login safely.</p>
            </div>
            <a
              href={approval.takeover_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 bg-cyan-400 hover:bg-cyan-300 text-black text-xs font-semibold py-1.5 px-3 rounded-lg transition shadow-xs pressable"
            >
              <span>Launch Takeover</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </div>

      {/* Feedback input for denial or instructions */}
      <div className="pt-2 border-t border-white/[0.08]">
        <input
          type="text"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Optional redirect instruction (e.g. 'Don't delete, move to backup folder instead')..."
          className="w-full bg-[#121216] border border-white/[0.1] rounded-xl p-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/30 mb-3"
          disabled={isSubmitting}
        />

        {/* Pre-approval checkbox: allowed ONLY for medium risk */}
        {!isHighRisk && (
          <label className="flex items-center gap-2 text-xs text-zinc-400 mb-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={alwaysAllow}
              onChange={(e) => setAlwaysAllow(e.target.checked)}
              className="rounded bg-black border-zinc-700 text-cyan-500 focus:ring-0"
              disabled={isSubmitting}
            />
            <span>Pre-approve all medium-risk {approval.action_type} actions for this session</span>
          </label>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => handleDecision('denied')}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 bg-white/[0.05] hover:bg-rose-950/60 hover:text-rose-300 text-zinc-300 text-xs font-medium py-1.5 px-4 rounded-xl border border-white/[0.08] transition disabled:opacity-50 pressable"
          >
            <X className="w-4 h-4 text-rose-400" />
            <span>Deny Action</span>
          </button>
          <button
            type="button"
            onClick={() => handleDecision('approved')}
            disabled={isSubmitting}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold py-1.5 px-5 rounded-xl shadow-md transition disabled:opacity-50 pressable ${
              isHighRisk 
                ? 'bg-rose-500 hover:bg-rose-600 text-white' 
                : 'bg-white hover:bg-zinc-200 text-black'
            }`}
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>Approve & Execute</span>
          </button>
        </div>
      </div>
    </div>
  );
};
