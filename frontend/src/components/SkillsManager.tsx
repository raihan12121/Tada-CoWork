import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Play, 
  Trash2, 
  Plus, 
  ShieldCheck, 
  AlertCircle,
  Check
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
    loadSkills();
  }, []);

  const loadSkills = async () => {
    try {
      setIsLoading(true);
      const data = await api.listSkills();
      setSkills(data);
    } catch (err: any) {
      console.error('Failed to load skills:', err);
      setErrorMessage(err.message || 'Failed to load skills');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenRunModal = (skill: Skill) => {
    const schema = skill.parameters_schema || {};
    const paramKeys = Object.keys(schema);
    if (paramKeys.length === 0) {
      // Direct execution without prompting for parameters
      executeSkill(skill.id, {});
      return;
    }
    // Initialize default values
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
      setSuccessMessage(`Skill executed successfully! Redirecting to task workspace...`);
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
      <div className="flex items-center justify-between pb-6 border-b border-[#30363d] mb-6">
        <div>
          <div className="flex items-center space-x-2">
            <Sparkles className="w-6 h-6 text-indigo-400" />
            <h2 className="text-xl font-bold text-white tracking-wide">Skills Engine & Swarms</h2>
          </div>
          <p className="text-xs text-gray-400 mt-1 max-w-2xl leading-relaxed">
            Record repeatable routines and teach your AI bot custom skills by demonstration. 
            Skills can be triggered with dynamic parameters, scheduled as background tasks, or coordinated in multi-agent swarms.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>New Skill</span>
        </button>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-500/40 rounded-xl text-xs text-red-300 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{errorMessage}</span>
        </div>
      )}
      {successMessage && (
        <div className="mb-4 p-3 bg-emerald-900/30 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 flex items-center space-x-2">
          <Check className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Teach by Demonstration Banner */}
      <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-xl p-4 mb-6 flex items-start space-x-3">
        <Sparkles className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-xs">
          <div className="font-semibold text-indigo-200">Show & Learn: Teach by Demonstration</div>
          <div className="text-indigo-300/80 mt-0.5 leading-relaxed">
            Perform any workflow once in the Workspace. When your plan completes, click <strong className="text-indigo-200">"Save as Skill"</strong> in the Execution Plan inspector to convert that session into an automated, parameterized recipe here.
          </div>
        </div>
      </div>

      {/* Skills Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-xs text-gray-500">Loading skills...</div>
      ) : skills.length === 0 ? (
        <div className="text-center py-12 bg-[#161b22] rounded-xl border border-[#30363d] text-xs text-gray-500 italic">
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
                className="bg-[#161b22] border border-[#30363d] hover:border-gray-500 rounded-xl p-5 transition flex flex-col justify-between group shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-white group-hover:text-indigo-300 transition">
                        {skill.name}
                      </h4>
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                        {skill.description || 'No description provided.'}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono bg-[#0d1117] text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/20 shrink-0">
                      {stepsCount} {stepsCount === 1 ? 'step' : 'steps'}
                    </span>
                  </div>

                  {/* Parameters preview if any */}
                  {paramKeys.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1 items-center">
                      <span className="text-[10px] text-gray-500 mr-1">Inputs:</span>
                      {paramKeys.map((k) => (
                        <span key={k} className="text-[10px] font-mono bg-[#21262d] text-amber-300 px-1.5 py-0.5 rounded">
                          ${k}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Steps preview list */}
                  <div className="mt-3.5 space-y-1.5 border-t border-[#30363d]/60 pt-3">
                    {skill.steps_definition?.slice(0, 3).map((st, idx) => (
                      <div key={idx} className="flex items-center space-x-2 text-[11px] text-gray-300 truncate">
                        <span className="w-4 h-4 rounded-full bg-[#21262d] text-gray-400 flex items-center justify-center text-[9px] font-mono shrink-0">
                          {idx + 1}
                        </span>
                        <span className="truncate">{st.description || 'Execute step'}</span>
                        <span className="text-[9px] font-mono text-gray-500 ml-auto shrink-0 bg-[#0d1117] px-1 rounded">
                          {st.tool || 'tool'}
                        </span>
                      </div>
                    ))}
                    {stepsCount > 3 && (
                      <div className="text-[10px] text-gray-500 italic pl-6">
                        + {stepsCount - 3} more steps
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action footer */}
                <div className="flex items-center justify-between mt-5 pt-3 border-t border-[#30363d]/40">
                  <div className="flex items-center space-x-1 text-[10px] text-emerald-400">
                    <ShieldCheck className="w-3 h-3" />
                    <span>Safe Execution Sandbox</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleOpenRunModal(skill)}
                      className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-1.5 px-3 rounded-lg shadow-sm transition"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Run</span>
                    </button>
                    <button
                      onClick={() => handleDeleteSkill(skill.id)}
                      className="text-gray-500 hover:text-rose-400 p-1.5 rounded transition"
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
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl max-w-md w-full p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-white mb-1">
              Run Skill: {selectedSkillForRun.name}
            </h3>
            <p className="text-xs text-gray-400 mb-4">
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
                    <label className="text-xs text-gray-300 font-mono block mb-1">
                      {key} {schema?.description && <span className="text-gray-500 font-sans">({schema.description})</span>}
                    </label>
                    <input
                      type="text"
                      value={paramValues[key] || ''}
                      onChange={(e) => setParamValues({ ...paramValues, [key]: e.target.value })}
                      placeholder={`Value for ${key}`}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded p-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                );
              })}

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[#30363d]/60">
                <button
                  type="button"
                  onClick={() => setSelectedSkillForRun(null)}
                  className="text-xs text-gray-400 hover:text-white px-3 py-1.5"
                  disabled={isRunning}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRunning}
                  className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-1.5 rounded transition disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl max-w-lg w-full p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-white mb-2">Create Custom Skill</h3>
            <p className="text-xs text-gray-400 mb-4">
              Define a new automated skill recipe that your agents can invoke anytime.
            </p>

            <form onSubmit={handleManualCreate} className="space-y-3">
              <div>
                <label className="text-xs text-gray-300 block mb-1">Skill Name</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. Competitive Price Intelligence Scan"
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-gray-300 block mb-1">Description</label>
                <textarea
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  placeholder="What this skill accomplishes..."
                  rows={2}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded p-2 text-xs text-white resize-none focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs text-gray-300 block mb-1 flex items-center justify-between">
                  <span>Steps Definition (JSON Array)</span>
                  <span className="text-[10px] text-gray-500 font-mono">{'[{"step_order", "description", "tool", "risk_level"}]'}</span>
                </label>
                <textarea
                  value={createStepsJson}
                  onChange={(e) => setCreateStepsJson(e.target.value)}
                  rows={7}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded p-2 text-xs text-indigo-200 font-mono resize-none focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[#30363d]/60">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="text-xs text-gray-400 hover:text-white px-3 py-1.5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-1.5 rounded transition"
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
