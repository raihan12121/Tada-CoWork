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
  BookmarkPlus,
  Check,
  Zap
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
          <span className="inline-flex items-center gap-1 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[10px] font-semibold px-2 py-0.5 rounded-full font-mono">
            <ShieldAlert className="w-3 h-3" />
            <span>High Risk · Approval Gate</span>
          </span>
        );
      case 'medium':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-semibold px-2 py-0.5 rounded-full font-mono">
            <AlertTriangle className="w-3 h-3" />
            <span>Medium Risk</span>
          </span>
        );
      case 'low':
      default:
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-medium px-2 py-0.5 rounded-full font-mono">
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
        return <div className="w-3.5 h-3.5 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />;
      case 'failed':
        return <AlertTriangle className="w-4 h-4 text-rose-400" />;
      case 'skipped':
        return <span className="text-[10px] text-zinc-500 font-mono">[SKIPPED]</span>;
      default:
        return <Clock className="w-4 h-4 text-zinc-600" />;
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
    <div className="bg-[#09090c] border border-white/[0.08] rounded-2xl p-5 shadow-2xl mb-5">
      {/* Plan Header */}
      <div className="flex flex-wrap items-center justify-between pb-4 border-b border-white/[0.06] mb-4 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white tracking-tight">Execution Plan</h3>
            <span className="bg-white/[0.06] text-zinc-400 text-[10px] font-mono px-2 py-0.5 rounded-full border border-white/[0.08]">
              v{plan.version}
            </span>
            <span className="text-xs text-zinc-500 font-mono">· {plan.steps.length} steps</span>
            {skillSavedSuccess && (
              <span className="inline-flex items-center gap-1 bg-emerald-500/20 text-emerald-300 text-[10px] px-2 py-0.5 rounded-full font-medium">
                <Check className="w-3 h-3" />
                <span>Saved as Skill!</span>
              </span>
            )}
          </div>
          {plan.explanation && (
            <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
              {plan.explanation}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {plan.steps.length > 0 && (
            <button
              onClick={() => {
                setSkillName(plan.explanation ? plan.explanation.slice(0, 40) : 'Custom Skill');
                setShowSaveSkillModal(true);
              }}
              className="inline-flex items-center gap-1.5 bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-zinc-300 text-xs font-medium py-1.5 px-3 rounded-lg transition"
              title="Save this plan as a reusable skill"
            >
              <BookmarkPlus className="w-3.5 h-3.5 text-cyan-400" />
              <span>Save as Skill</span>
            </button>
          )}

          {canEdit && (
            <button
              onClick={onStartExecution}
              className="inline-flex items-center gap-1.5 bg-white text-black hover:bg-zinc-200 text-xs font-semibold py-1.5 px-3.5 rounded-lg shadow transition"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Run Plan</span>
            </button>
          )}
        </div>
      </div>

      {/* Safety Reassurance Notice */}
      <div className="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] px-3.5 py-2.5 rounded-xl text-zinc-300 text-xs mb-4">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        <span className="text-zinc-400">
          Autonomous execution with sandboxing. Irreversible operations require explicit human confirmation.
        </span>
      </div>

      {/* Multi-Workstream Parallel Swimlanes */}
      <ParallelSwimlanes
        steps={plan.steps}
        activeStepIds={plan.steps.filter((s) => s.status === 'running').map((s) => s.id)}
      />

      {/* Step List */}
      <div className="space-y-2">
        {plan.steps.map((step) => (
          <div
            key={step.id}
            className={`p-3 rounded-xl border transition flex items-start justify-between ${
              step.status === 'running'
                ? 'bg-cyan-950/20 border-cyan-500/40 shadow-sm'
                : step.status === 'completed'
                ? 'bg-white/[0.02] border-white/[0.05]'
                : 'bg-[#0e0e12]/80 border-white/[0.06]'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{getStatusIcon(step.status)}</div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-zinc-500">
                    #{step.step_order}
                  </span>
                  <span className="text-xs text-zinc-100 font-medium">
                    {step.description}
                  </span>
                </div>

                <div className="flex items-center gap-2 mt-1.5">
                  <span className="inline-flex items-center gap-1 text-[10px] text-zinc-400 font-mono bg-white/[0.05] border border-white/[0.08] px-2 py-0.5 rounded">
                    <Wrench className="w-2.5 h-2.5 text-cyan-400" />
                    <span>{step.tool}</span>
                  </span>
                  {getRiskBadge(step.risk_level)}
                </div>

                {step.result_summary && (
                  <div className="text-[11px] text-zinc-400 mt-2 font-mono bg-black/60 p-2 rounded-lg border border-white/[0.06]">
                    ↳ {step.result_summary}
                  </div>
                )}
              </div>
            </div>

            {canEdit && (onDeleteStep || onReorderSteps) && (
              <div className="flex items-center gap-0.5">
                {onReorderSteps && (
                  <>
                    <button 
                      onClick={() => moveStep(plan.steps.indexOf(step), -1)} 
                      disabled={plan.steps.indexOf(step) === 0} 
                      className="text-zinc-500 hover:text-white disabled:opacity-20 p-1 rounded transition" 
                      title="Move up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => moveStep(plan.steps.indexOf(step), 1)} 
                      disabled={plan.steps.indexOf(step) === plan.steps.length - 1} 
                      className="text-zinc-500 hover:text-white disabled:opacity-20 p-1 rounded transition" 
                      title="Move down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
                {onDeleteStep && (
                  <button 
                    onClick={() => onDeleteStep(step.id)} 
                    className="text-zinc-500 hover:text-rose-400 p-1 rounded transition ml-1" 
                    title="Remove step"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Step Affordance */}
      {canEdit && onAddStep && (
        <div className="mt-4 pt-3 border-t border-white/[0.06]">
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white font-medium py-1 px-2 rounded-lg hover:bg-white/[0.05] transition"
            >
              <Plus className="w-3.5 h-3.5 text-cyan-400" />
              <span>Add custom step</span>
            </button>
          ) : (
            <form onSubmit={handleAddSubmit} className="bg-black/60 p-3 rounded-xl border border-white/[0.08] space-y-2.5">
              <div className="text-xs font-semibold text-white">Add Execution Step</div>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Describe step purpose..."
                className="w-full bg-[#121215] border border-white/[0.1] rounded-lg p-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/30"
              />
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={newTool}
                  onChange={(e) => setNewTool(e.target.value)}
                  className="bg-[#121215] border border-white/[0.1] rounded-lg p-1.5 text-xs text-zinc-300"
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
                  className="bg-[#121215] border border-white/[0.1] rounded-lg p-1.5 text-xs text-zinc-300"
                >
                  <option value="low">Low Risk</option>
                  <option value="medium">Medium Risk</option>
                  <option value="high">High Risk</option>
                </select>
                <button
                  type="submit"
                  className="bg-white text-black font-semibold text-xs py-1.5 px-3 rounded-lg hover:bg-zinc-200 transition"
                >
                  Add Step
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-xs text-zinc-400 hover:text-white py-1.5 px-2.5"
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0e0e12] border border-white/[0.12] rounded-2xl max-w-md w-full p-5 shadow-2xl">
            <div className="flex items-center gap-2 text-white mb-2">
              <BookmarkPlus className="w-5 h-5 text-cyan-400" />
              <h3 className="text-sm font-bold">Save Plan as Reusable Skill</h3>
            </div>
            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              Convert this demonstrated task into an automated, parameterized skill that you or your agent swarm can trigger anytime.
            </p>
            <form onSubmit={handleSaveAsSkill} className="space-y-3">
              <div>
                <label className="text-xs text-zinc-300 block mb-1">Skill Name</label>
                <input
                  type="text"
                  value={skillName}
                  onChange={(e) => setSkillName(e.target.value)}
                  placeholder="e.g. Weekly Research & Summary"
                  className="w-full bg-[#16161b] border border-white/[0.1] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-white/30"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-zinc-300 block mb-1">Description</label>
                <textarea
                  value={skillDesc}
                  onChange={(e) => setSkillDesc(e.target.value)}
                  placeholder="What this skill accomplishes..."
                  rows={2}
                  className="w-full bg-[#16161b] border border-white/[0.1] rounded-lg p-2 text-xs text-white resize-none focus:outline-none focus:border-white/30"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setShowSaveSkillModal(false)}
                  className="text-xs text-zinc-400 hover:text-white px-3 py-1.5"
                  disabled={isSavingSkill}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingSkill}
                  className="inline-flex items-center gap-1.5 bg-white text-black hover:bg-zinc-200 text-xs font-semibold px-4 py-1.5 rounded-lg transition disabled:opacity-50"
                >
                  <Zap className="w-3.5 h-3.5" />
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
