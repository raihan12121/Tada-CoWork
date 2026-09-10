import React, { useState } from 'react';
import { 
  Play, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  ShieldAlert, 
  Trash2, 
  Plus, 
  Wrench, 
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import type { Plan, RiskLevel } from '../types';

interface PlanViewProps {
  plan: Plan;
  sessionStatus: string;
  onStartExecution: () => void;
  onDeleteStep?: (stepId: string) => void;
  onAddStep?: (desc: string, tool: string, risk: RiskLevel) => void;
}

export const PlanView: React.FC<PlanViewProps> = ({
  plan,
  sessionStatus,
  onStartExecution,
  onDeleteStep,
  onAddStep
}) => {
  const [newDesc, setNewDesc] = useState('');
  const [newTool, setNewTool] = useState('execute_code');
  const [newRisk, setNewRisk] = useState<RiskLevel>('low');
  const [showAddForm, setShowAddForm] = useState(false);

  const getRiskBadge = (risk: RiskLevel) => {
    switch (risk) {
      case 'high':
        return (
          <span className="inline-flex items-center space-x-1 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[10px] font-semibold px-2 py-0.5 rounded-full">
            <ShieldAlert className="w-3 h-3" />
            <span>High Risk · Approval Gate</span>
          </span>
        );
      case 'medium':
        return (
          <span className="inline-flex items-center space-x-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-semibold px-2 py-0.5 rounded-full">
            <AlertTriangle className="w-3 h-3" />
            <span>Medium Risk</span>
          </span>
        );
      case 'low':
      default:
        return (
          <span className="inline-flex items-center space-x-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-medium px-2 py-0.5 rounded-full">
            <ShieldCheck className="w-3 h-3" />
            <span>Low Risk · Autonomous</span>
          </span>
        );
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'running':
        return <div className="w-3.5 h-3.5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />;
      case 'failed':
        return <AlertTriangle className="w-4 h-4 text-rose-400" />;
      case 'skipped':
        return <span className="text-[10px] text-gray-500 font-mono">[SKIPPED]</span>;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDesc.trim() || !onAddStep) return;
    onAddStep(newDesc.trim(), newTool, newRisk);
    setNewDesc('');
    setShowAddForm(false);
  };

  const canEdit = sessionStatus === 'created';

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5 shadow-lg mb-6">
      {/* Plan Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#30363d] mb-4">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-semibold text-white tracking-wide">Execution Plan</h3>
            <span className="bg-[#21262d] text-gray-300 text-[10px] font-mono px-1.5 py-0.5 rounded">
              v{plan.version}
            </span>
            <span className="text-xs text-gray-400">· {plan.steps.length} steps</span>
          </div>
          {plan.explanation && (
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              {plan.explanation}
            </p>
          )}
        </div>

        {canEdit && (
          <button
            onClick={onStartExecution}
            className="inline-flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 px-4 rounded-lg shadow-md transition"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Start Execution</span>
          </button>
        )}
      </div>

      {/* Reassurance Line (design.md §2.2) */}
      <div className="flex items-center space-x-2 bg-indigo-950/30 border border-indigo-500/20 px-3 py-2 rounded-lg text-indigo-300 text-xs mb-4">
        <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
        <span>Coagent will always ask for your explicit approval before performing irreversible or sensitive actions.</span>
      </div>

      {/* Step List */}
      <div className="space-y-2.5">
        {plan.steps.map((step) => (
          <div
            key={step.id}
            className={`p-3 rounded-lg border transition flex items-start justify-between ${
              step.status === 'running'
                ? 'bg-indigo-950/20 border-indigo-500/50 shadow-sm'
                : step.status === 'completed'
                ? 'bg-[#21262d]/40 border-[#30363d]'
                : 'bg-[#161b22] border-[#30363d]/80'
            }`}
          >
            <div className="flex items-start space-x-3">
              <div className="mt-0.5">{getStatusIcon(step.status)}</div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-semibold text-gray-300">
                    Step {step.step_order}
                  </span>
                  <span className="text-xs text-white font-medium">
                    {step.description}
                  </span>
                </div>

                <div className="flex items-center space-x-2 mt-1.5">
                  <span className="inline-flex items-center space-x-1 text-[10px] text-gray-400 font-mono bg-[#21262d] px-2 py-0.5 rounded">
                    <Wrench className="w-2.5 h-2.5 text-indigo-400" />
                    <span>{step.tool}</span>
                  </span>
                  {getRiskBadge(step.risk_level)}
                </div>

                {step.result_summary && (
                  <div className="text-[11px] text-gray-400 mt-1.5 italic bg-[#0d1117] p-1.5 rounded border border-[#30363d]/50">
                    ↳ {step.result_summary}
                  </div>
                )}
              </div>
            </div>

            {canEdit && onDeleteStep && (
              <button
                onClick={() => onDeleteStep(step.id)}
                className="text-gray-500 hover:text-rose-400 p-1 rounded transition"
                title="Remove step"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add Step Affordance */}
      {canEdit && onAddStep && (
        <div className="mt-4 pt-3 border-t border-[#30363d]/60">
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center space-x-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium py-1 px-2 rounded transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add customized step</span>
            </button>
          ) : (
            <form onSubmit={handleAddSubmit} className="bg-[#21262d] p-3 rounded-lg border border-[#30363d] space-y-2">
              <div className="text-xs font-medium text-white">Add Step</div>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Step description..."
                className="w-full bg-[#161b22] border border-[#30363d] rounded p-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
              <div className="flex items-center space-x-2">
                <select
                  value={newTool}
                  onChange={(e) => setNewTool(e.target.value)}
                  className="bg-[#161b22] border border-[#30363d] rounded p-1.5 text-xs text-gray-300"
                >
                  <option value="execute_code">execute_code</option>
                  <option value="create_document">create_document</option>
                  <option value="write_file">write_file</option>
                  <option value="read_file">read_file</option>
                  <option value="web_search">web_search</option>
                  <option value="web_fetch">web_fetch</option>
                  <option value="delete_file">delete_file</option>
                  <option value="send_email">send_email</option>
                </select>
                <select
                  value={newRisk}
                  onChange={(e) => setNewRisk(e.target.value as RiskLevel)}
                  className="bg-[#161b22] border border-[#30363d] rounded p-1.5 text-xs text-gray-300"
                >
                  <option value="low">Low Risk</option>
                  <option value="medium">Medium Risk</option>
                  <option value="high">High Risk</option>
                </select>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium py-1.5 px-3 rounded"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-xs text-gray-400 hover:text-gray-200 py-1.5 px-2"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
