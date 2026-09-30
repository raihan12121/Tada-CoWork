import React, { useState } from 'react';
import { 
  Play, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  ShieldAlert, 
  Trash2, 
  Plus, 
  ArrowUp,
  ArrowDown,
  Wrench, 
  ShieldCheck,
  Sparkles,
  BookmarkPlus,
  Check
} from 'lucide-react';
import type { Plan, RiskLevel } from '../types';
import { ParallelSwimlanes } from './ParallelSwimlanes';
import { api } from '../services/api';

interface PlanViewProps {
  plan: Plan;
  sessionStatus: string;
  onStartExecution: () => void;
  onDeleteStep?: (stepId: string) => void;
  onAddStep?: (desc: string, tool: string, risk: RiskLevel) => void;
  onReorderSteps?: (stepIds: string[]) => void;
}

export const PlanView: React.FC<PlanViewProps> = ({
  plan,
  sessionStatus,
  onStartExecution,
  onDeleteStep,
  onAddStep,
  onReorderSteps
}) => {
  const [newDesc, setNewDesc] = useState('');
  const [newTool, setNewTool] = useState('execute_code');
  const [newRisk, setNewRisk] = useState<RiskLevel>('low');
  const [showAddForm, setShowAddForm] = useState(false);

  // Teach by Demonstration: Save as Skill
  const [showSaveSkillModal, setShowSaveSkillModal] = useState(false);
  const [skillName, setSkillName] = useState('');
  const [skillDesc, setSkillDesc] = useState('');
  const [isSavingSkill, setIsSavingSkill] = useState(false);
  const [skillSavedSuccess, setSkillSavedSuccess] = useState(false);


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

  const canEdit = sessionStatus === 'created' || sessionStatus === 'paused';
  const moveStep = (index: number, direction: -1 | 1) => {
    if (!onReorderSteps) return;
    const next = [...plan.steps];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onReorderSteps(next.map((step) => step.id));
  };

  const handleSaveAsSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillName.trim() || !plan.session_id) return;
    try {
      setIsSavingSkill(true);
      await api.createSkillFromSession(plan.session_id, skillName.trim(), skillDesc.trim());
      setSkillSavedSuccess(true);
      setShowSaveSkillModal(false);
      setTimeout(() => setSkillSavedSuccess(false), 4000);
    } catch (err) {
      console.error('Failed to save skill:', err);
    } finally {
      setIsSavingSkill(false);
    }
  };

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
            {skillSavedSuccess && (
              <span className="inline-flex items-center space-x-1 bg-emerald-500/20 text-emerald-300 text-[10px] px-2 py-0.5 rounded font-medium">
                <Check className="w-3 h-3" />
                <span>Saved as Skill!</span>
              </span>
            )}
          </div>
          {plan.explanation && (
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              {plan.explanation}
            </p>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {plan.steps.length > 0 && (
            <button
              onClick={() => {
                setSkillName(plan.explanation ? plan.explanation.slice(0, 40) : 'Custom Skill');
                setShowSaveSkillModal(true);
              }}
              className="inline-flex items-center space-x-1.5 bg-[#21262d] hover:bg-[#30363d] border border-white/10 text-gray-200 text-xs font-medium py-2 px-3 rounded-lg shadow-sm transition"
              title="Save this plan as a reusable skill"
            >
              <BookmarkPlus className="w-3.5 h-3.5 text-indigo-400" />
              <span>Save as Skill</span>
            </button>
          )}

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
      </div>

      {/* Reassurance Line (design.md §2.2) */}
      <div className="flex items-center space-x-2 bg-indigo-950/30 border border-indigo-500/20 px-3 py-2 rounded-lg text-indigo-300 text-xs mb-4">
        <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
        <span>Coagent will always ask for your explicit approval before performing irreversible or sensitive actions.</span>
      </div>

      {/* Multi-Workstream Parallel Swimlanes (Phase 6) */}
      <ParallelSwimlanes
        steps={plan.steps}
        activeStepIds={plan.steps.filter(s => s.status === 'running').map(s => s.id)}
      />

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

            {canEdit && (onDeleteStep || onReorderSteps) && (
              <div className="flex items-center gap-0.5">
                {onReorderSteps && (
                  <>
                    <button onClick={() => moveStep(plan.steps.indexOf(step), -1)} disabled={plan.steps.indexOf(step) === 0} className="text-gray-500 hover:text-indigo-300 disabled:opacity-20 p-1 rounded transition" title="Move step up"><ArrowUp className="w-3.5 h-3.5" /></button>
                    <button onClick={() => moveStep(plan.steps.indexOf(step), 1)} disabled={plan.steps.indexOf(step) === plan.steps.length - 1} className="text-gray-500 hover:text-indigo-300 disabled:opacity-20 p-1 rounded transition" title="Move step down"><ArrowDown className="w-3.5 h-3.5" /></button>
                  </>
                )}
                {onDeleteStep && <button onClick={() => onDeleteStep(step.id)} className="text-gray-500 hover:text-rose-400 p-1 rounded transition" title="Remove step"><Trash2 className="w-3.5 h-3.5" /></button>}
              </div>
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
                  <option value="create_file">create_file</option>
                  <option value="move_file">move_file</option>
                  <option value="bridge_list_files">bridge_list_files</option>
                  <option value="bridge_read_file">bridge_read_file</option>
                  <option value="bridge_move_file">bridge_move_file</option>
                  <option value="read_file">read_file</option>
                  <option value="web_search">web_search</option>
                  <option value="web_fetch">web_fetch</option>
                  <option value="delete_file">delete_file</option>
                  <option value="send_email">send_email</option>
                  <option value="browser_automation">browser_automation</option>
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

      {/* Save as Skill Modal */}
      {showSaveSkillModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl max-w-md w-full p-5 shadow-2xl">
            <div className="flex items-center space-x-2 text-indigo-400 mb-2">
              <BookmarkPlus className="w-5 h-5" />
              <h3 className="text-sm font-semibold text-white">Save Plan as Reusable Skill</h3>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Turn this demonstrated task into an automated, parameterized skill that you or your agent swarm can trigger anytime.
            </p>
            <form onSubmit={handleSaveAsSkill} className="space-y-3">
              <div>
                <label className="text-xs text-gray-300 block mb-1">Skill Name</label>
                <input
                  type="text"
                  value={skillName}
                  onChange={(e) => setSkillName(e.target.value)}
                  placeholder="e.g. Weekly Research & Summary"
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-300 block mb-1">Description</label>
                <textarea
                  value={skillDesc}
                  onChange={(e) => setSkillDesc(e.target.value)}
                  placeholder="What this skill accomplishes..."
                  rows={2}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded p-2 text-xs text-white resize-none focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#30363d]/60">
                <button
                  type="button"
                  onClick={() => setShowSaveSkillModal(false)}
                  className="text-xs text-gray-400 hover:text-white px-3 py-1.5"
                  disabled={isSavingSkill}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingSkill}
                  className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-1.5 rounded transition disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isSavingSkill ? 'Saving...' : 'Save Skill'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

