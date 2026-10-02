import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Play, 
  Trash2, 
  Plus, 
  ShieldCheck, 
  AlertCircle,
  Check,
  Zap
} from 'lucide-react';
import type { Skill } from '../types';
import { api } from '../services/api';

interface SkillsManagerProps {
  onSessionCreated: (sessionId: string) => void;
}

export const SkillsManager: React.FC<SkillsManagerProps> = ({ onSessionCreated }) => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Run with parameters modal
  const [selectedSkillForRun, setSelectedSkillForRun] = useState<Skill | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [isRunning, setIsRunning] = useState(false);

  // Manual create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createStepsJson, setCreateStepsJson] = useState('[\n  {\n    "step_order": 1,\n    "description": "Fetch and analyze website data",\n    "tool": "web_search",\n    "risk_level": "low"\n  }\n]');



  useEffect(() => {
    let ignore = false;
    api.listSkills()
      .then((data) => {
        if (!ignore) {
          setSkills(data);
          setIsLoading(false);
        }
      })
      .catch((err: any) => {
        if (!ignore) {
          console.error('Failed to load skills:', err);
          setErrorMessage(err.message || 'Failed to load skills');
          setIsLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  const handleOpenRunModal = (skill: Skill) => {
    const schema = skill.parameters_schema || {};
    const paramKeys = Object.keys(schema);
    if (paramKeys.length === 0) {
      executeSkill(skill.id, {});
      return;
    }
    const initialValues: Record<string, string> = {};
    for (const key of paramKeys) {
      initialValues[key] = schema[key]?.default || '';
    }
    setParamValues(initialValues);
    setSelectedSkillForRun(skill);
  };

  const executeSkill = async (skillId: string, params: Record<string, any>) => {
    try {
      setIsRunning(true);
      setErrorMessage(null);
      const session = await api.runSkill(skillId, params);
      setSuccessMessage(`Skill executed! Redirecting to workspace...`);
      setSelectedSkillForRun(null);
      setTimeout(() => {
        onSessionCreated(session.id);
      }, 500);
    } catch (err: any) {
      console.error('Failed to run skill:', err);
      setErrorMessage(err.message || 'Failed to execute skill');
    } finally {
      setIsRunning(false);
    }
  };

  const handleDeleteSkill = async (skillId: string) => {
    if (!confirm('Are you sure you want to delete this skill?')) return;
    try {
      await api.deleteSkill(skillId);
      setSkills(skills.filter((s) => s.id !== skillId));
      setSuccessMessage('Skill deleted successfully.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error('Failed to delete skill:', err);
      setErrorMessage(err.message || 'Failed to delete skill');
    }
  };

  const handleManualCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;

    try {
      let parsedSteps: any[] = [];
      try {
        parsedSteps = JSON.parse(createStepsJson);
        if (!Array.isArray(parsedSteps)) throw new Error('Steps must be an array of step objects');
      } catch (e: any) {
        setErrorMessage(`Invalid JSON steps definition: ${e.message}`);
        return;
      }

      const newSkill = await api.createSkill({
        name: createName.trim(),
        description: createDesc.trim(),
        parameters_schema: {},
        steps_definition: parsedSteps,
        workspace_id: 'default',
        is_active: true
      });

      setSkills([newSkill, ...skills]);
      setShowCreateModal(false);
      setCreateName('');
      setCreateDesc('');
      setSuccessMessage('New skill created successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error('Failed to create skill:', err);
      setErrorMessage(err.message || 'Failed to create skill');
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-white/[0.08] mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Skills & Swarm Recipes</h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1 max-w-2xl leading-relaxed">
            Record repeatable workflows and teach your AI bot custom skills by demonstration. 
            Deploy skills with dynamic parameters, run them as background automations, or dispatch them into multi-agent swarms.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 bg-white text-black hover:bg-zinc-200 text-xs font-semibold px-3.5 py-2 rounded-xl transition shadow"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>New Skill</span>
        </button>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="mb-4 p-3 bg-rose-950/30 border border-rose-500/40 rounded-xl text-xs text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}
      {successMessage && (
        <div className="mb-4 p-3 bg-emerald-950/30 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Teach by Demonstration Banner */}
      <div className="bg-[#0b0b0e] border border-white/[0.08] rounded-2xl p-4 mb-6 flex items-start gap-3">
        <Zap className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
        <div className="text-xs">
          <div className="font-semibold text-white">Teach by Demonstration</div>
          <div className="text-zinc-400 mt-0.5 leading-relaxed">
            Execute any multi-step task once in the Workspace. When your plan finishes, click <strong className="text-zinc-200">"Save as Skill"</strong> in the Plan inspector to instantly turn it into an automated, parameterized recipe here.
          </div>
        </div>
      </div>

      {/* Skills Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-xs text-zinc-600">Loading skills...</div>
      ) : skills.length === 0 ? (
        <div className="text-center py-12 bg-[#09090c] rounded-2xl border border-white/[0.08] text-xs text-zinc-600 italic">
          No skills registered yet. Run any task in the workspace and click "Save as Skill" to add it here, or click "New Skill" above.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {skills.map((skill) => {
            const paramKeys = Object.keys(skill.parameters_schema || {});
            const stepsCount = skill.steps_definition?.length || 0;

            return (
              <div
                key={skill.id}
                className="bg-[#09090c] border border-white/[0.08] hover:border-white/[0.18] rounded-2xl p-5 transition flex flex-col justify-between group shadow-lg"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-white group-hover:text-cyan-300 transition">
                        {skill.name}
                      </h4>
                      <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                        {skill.description || 'No description provided.'}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono bg-white/[0.05] text-zinc-400 px-2 py-0.5 rounded-full border border-white/[0.08] shrink-0">
                      {stepsCount} {stepsCount === 1 ? 'step' : 'steps'}
                    </span>
                  </div>

                  {/* Parameters preview */}
                  {paramKeys.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1 items-center">
                      <span className="text-[10px] text-zinc-500 mr-1">Inputs:</span>
                      {paramKeys.map((k) => (
                        <span key={k} className="text-[10px] font-mono bg-white/[0.06] text-amber-300 px-1.5 py-0.5 rounded">
                          ${k}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Steps preview list */}
                  <div className="mt-3.5 space-y-1.5 border-t border-white/[0.06] pt-3">
                    {skill.steps_definition?.slice(0, 3).map((st, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-[11px] text-zinc-300 truncate">
                        <span className="w-4 h-4 rounded-full bg-white/[0.08] text-zinc-400 flex items-center justify-center text-[9px] font-mono shrink-0">
                          {idx + 1}
                        </span>
                        <span className="truncate">{st.description || 'Execute step'}</span>
                        <span className="text-[9px] font-mono text-zinc-500 ml-auto shrink-0 bg-black/60 px-1.5 py-0.2 rounded border border-white/[0.04]">
                          {st.tool || 'tool'}
                        </span>
                      </div>
                    ))}
                    {stepsCount > 3 && (
                      <div className="text-[10px] text-zinc-600 italic pl-6">
                        + {stepsCount - 3} more steps
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action footer */}
                <div className="flex items-center justify-between mt-5 pt-3 border-t border-white/[0.06]">
                  <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-mono">
                    <ShieldCheck className="w-3 h-3" />
                    <span>Safe Sandbox</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenRunModal(skill)}
                      className="inline-flex items-center gap-1.5 bg-white text-black hover:bg-zinc-200 text-xs font-semibold py-1.5 px-3 rounded-lg shadow-sm transition"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Run</span>
                    </button>
                    <button
                      onClick={() => handleDeleteSkill(skill.id)}
                      className="text-zinc-500 hover:text-rose-400 p-1.5 rounded-lg transition"
                      title="Delete skill"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Parameter Input Modal */}
      {selectedSkillForRun && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0e0e12] border border-white/[0.12] rounded-2xl max-w-md w-full p-5 shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-1">
              Run Skill: {selectedSkillForRun.name}
            </h3>
            <p className="text-xs text-zinc-400 mb-4">
              Provide dynamic parameters for this execution run.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                executeSkill(selectedSkillForRun.id, paramValues);
              }}
              className="space-y-3"
            >
              {Object.keys(selectedSkillForRun.parameters_schema || {}).map((key) => {
                const schema = selectedSkillForRun.parameters_schema[key];
                return (
                  <div key={key}>
                    <label className="text-xs text-zinc-300 font-mono block mb-1">
                      {key} {schema?.description && <span className="text-zinc-500 font-sans">({schema.description})</span>}
                    </label>
                    <input
                      type="text"
                      value={paramValues[key] || ''}
                      onChange={(e) => setParamValues({ ...paramValues, [key]: e.target.value })}
                      placeholder={`Value for ${key}`}
                      className="w-full bg-[#16161b] border border-white/[0.1] rounded-lg p-2 text-xs text-white font-mono focus:outline-none focus:border-white/30"
                    />
                  </div>
                );
              })}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setSelectedSkillForRun(null)}
                  className="text-xs text-zinc-400 hover:text-white px-3 py-1.5"
                  disabled={isRunning}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRunning}
                  className="inline-flex items-center gap-1.5 bg-white text-black hover:bg-zinc-200 text-xs font-semibold px-4 py-1.5 rounded-lg transition disabled:opacity-50"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>{isRunning ? 'Launching...' : 'Run Skill'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Skill Creation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0e0e12] border border-white/[0.12] rounded-2xl max-w-lg w-full p-5 shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-2">Create Custom Skill</h3>
            <p className="text-xs text-zinc-400 mb-4">
              Define a new automated skill recipe that your agents can invoke anytime.
            </p>

            <form onSubmit={handleManualCreate} className="space-y-3">
              <div>
                <label className="text-xs text-zinc-300 block mb-1">Skill Name</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. Competitive Price Intelligence Scan"
                  className="w-full bg-[#16161b] border border-white/[0.1] rounded-lg p-2 text-xs text-white focus:outline-none focus:border-white/30"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-zinc-300 block mb-1">Description</label>
                <textarea
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  placeholder="What this skill accomplishes..."
                  rows={2}
                  className="w-full bg-[#16161b] border border-white/[0.1] rounded-lg p-2 text-xs text-white resize-none focus:outline-none focus:border-white/30"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-300 block mb-1 flex items-center justify-between">
                  <span>Steps Definition (JSON Array)</span>
                  <span className="text-[10px] text-zinc-500 font-mono">{'[{"step_order", "description", "tool", "risk_level"}]'}</span>
                </label>
                <textarea
                  value={createStepsJson}
                  onChange={(e) => setCreateStepsJson(e.target.value)}
                  rows={7}
                  className="w-full bg-black/70 border border-white/[0.1] rounded-lg p-2.5 text-xs text-cyan-200 font-mono resize-none focus:outline-none focus:border-white/30"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="text-xs text-zinc-400 hover:text-white px-3 py-1.5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-white text-black hover:bg-zinc-200 text-xs font-semibold px-4 py-1.5 rounded-lg transition"
                >
                  Save Skill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
