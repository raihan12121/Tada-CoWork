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
    <div className={`my-4 rounded-xl border p-5 shadow-2xl transition ${
      isHighRisk 
        ? 'bg-rose-950/20 border-rose-500/60 ring-1 ring-rose-500/30' 
        : 'bg-amber-950/20 border-amber-500/60 ring-1 ring-amber-500/30'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div className="flex items-center space-x-2">
          {isHighRisk ? (
            <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
          ) : (
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
          )}
          <div>
            <div className="flex items-center space-x-2">
              <h4 className="text-sm font-bold text-white tracking-wide">
                {isHighRisk ? 'High-Risk Action Approval Required' : 'Confirmation Required'}
              </h4>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                isHighRisk ? 'bg-rose-500 text-white' : 'bg-amber-500 text-black'
              }`}>
                {approval.risk_level} Risk
              </span>
            </div>
            <p className="text-xs text-gray-300 mt-0.5 font-mono">
              Action: <span className="font-semibold text-white">{approval.action_type}</span>
            </p>
          </div>
        </div>

        {approval.takeover_mode && (
          <div className="flex items-center space-x-1.5 bg-blue-500/20 border border-blue-500/40 text-blue-300 text-xs px-2.5 py-1 rounded-md">
            <Lock className="w-3.5 h-3.5" />
            <span className="font-semibold">Takeover Mode</span>
          </div>
        )}
      </div>

      {/* Body / Consequence */}
      <div className="py-3 space-y-2.5 text-xs">
        <div>
          <span className="text-gray-400">Target Affected:</span>
          <p className="font-mono text-white bg-[#0d1117] p-2 rounded mt-1 border border-white/10">
            {approval.target}
          </p>
        </div>

        <div>
          <span className="text-gray-400">Consequence Details:</span>
          <p className="text-gray-200 mt-1 leading-relaxed">
            {approval.consequence}
          </p>
        </div>

        {approval.diff && (
          <div>
            <div className="flex items-center space-x-1 text-gray-400 mb-1">
              <FileDiff className="w-3.5 h-3.5 text-indigo-400" />
              <span>Proposed Changes Diff:</span>
            </div>
            <pre className="text-[11px] font-mono text-gray-300 bg-[#0d1117] p-2.5 rounded border border-white/10 overflow-x-auto">
              {approval.diff}
            </pre>
          </div>
        )}

        {/* Takeover Mode Link if external browser interaction is requested */}
        {approval.takeover_mode && approval.takeover_url && (
          <div className="bg-blue-950/40 border border-blue-500/30 p-3 rounded-lg flex items-center justify-between">
            <div>
              <p className="text-white font-medium">External Login / Checkout Required</p>
              <p className="text-gray-400 text-[11px]">You take control of the browser session to complete payment or login safely.</p>
            </div>
            <a
              href={approval.takeover_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-1.5 px-3 rounded transition"
            >
              <span>Launch Takeover</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </div>

      {/* Feedback input for denial or instructions */}
      <div className="pt-2 border-t border-white/10">
        <input
          type="text"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Optional feedback or redirect instruction (e.g. 'Don't delete, move to archive instead')..."
          className="w-full bg-[#0d1117] border border-[#30363d] rounded p-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 mb-3"
          disabled={isSubmitting}
        />

        {/* Pre-approval checkbox: allowed ONLY for medium risk per rules.md §2.1 */}
        {!isHighRisk && (
          <label className="flex items-center space-x-2 text-xs text-gray-300 mb-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={alwaysAllow}
              onChange={(e) => setAlwaysAllow(e.target.checked)}
              className="rounded bg-[#0d1117] border-gray-600 text-indigo-600 focus:ring-0"
              disabled={isSubmitting}
            />
            <span>Pre-approve all medium-risk {approval.action_type} actions for this session</span>
          </label>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={() => handleDecision('denied')}
            disabled={isSubmitting}
            className="inline-flex items-center space-x-1.5 bg-[#21262d] hover:bg-rose-900/50 hover:text-rose-300 text-gray-300 text-xs font-semibold py-2 px-4 rounded-lg border border-[#30363d] transition disabled:opacity-50"
          >
            <X className="w-4 h-4 text-rose-400" />
            <span>Deny Action</span>
          </button>
          <button
            type="button"
            onClick={() => handleDecision('approved')}
            disabled={isSubmitting}
            className={`inline-flex items-center space-x-1.5 text-white text-xs font-semibold py-2 px-5 rounded-lg shadow-lg transition disabled:opacity-50 ${
              isHighRisk ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>Approve & Continue</span>
          </button>
        </div>
      </div>
    </div>
  );
};
