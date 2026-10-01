import React, { useState, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  Search, 
  Plus, 
  Play, 
  CheckCircle2, 
  Layers, 
  ShieldAlert, 
  Zap, 
  FileSpreadsheet, 
  Globe, 
  Film, 
  SearchCode,
  Trash2
} from 'lucide-react';
import { api } from '../services/api';

interface SkillItem {
  id: string;
  name: string;
  command: string;
  description: string;
  category: string;
  stepsCount: number;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  requiresApproval: boolean;
}

const DEFAULT_SKILLS: SkillItem[] = [
  {
    id: 'inbox-triage',
    name: 'Autonomous Inbox Triage',
    command: 'inbox-triage',
    description: 'Scans unread emails, categorizes priority clients, and prepares one-click draft replies.',
    category: 'Productivity',
    stepsCount: 3,
    icon: Zap,
    iconColor: 'text-red-400',
    requiresApproval: true
  },
  {
    id: 'build-spreadsheet',
    name: 'Financial Model & Spreadsheet',
    command: 'build-spreadsheet',
    description: 'Synthesizes financial data into structured multi-tab Excel workbooks with formulas.',
    category: 'Analysis',
    stepsCount: 4,
    icon: FileSpreadsheet,
    iconColor: 'text-emerald-400',
    requiresApproval: false
  },
  {
    id: 'deep-research',
    name: 'Competitor & Market Research',
    command: 'deep-research',
    description: 'Crawls industry sources, benchmarks features and pricing, and compiles citations.',
    category: 'Research',
    stepsCount: 5,
    icon: Globe,
    iconColor: 'text-blue-400',
    requiresApproval: false
  },
  {
    id: 'video-render',
    name: 'Motion Storyboard & Video',
    command: 'video-render',
    description: 'Drafts animation script, configures keyframe timings, and renders media preview.',
    category: 'Creative',
    stepsCount: 3,
    icon: Film,
    iconColor: 'text-purple-400',
    requiresApproval: false
  },
  {
    id: 'code-review',
    name: 'Pull Request Code Audit',
    command: 'code-review',
    description: 'Inspects git diffs, analyzes code complexity, flags security risks, and verifies unit tests.',
    category: 'Engineering',
    stepsCount: 4,
    icon: SearchCode,
    iconColor: 'text-amber-400',
    requiresApproval: true
  }
];

interface SkillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTriggerSkill?: (skillCommand: string) => void;
}

export const SkillsModal: React.FC<SkillsModalProps> = ({
  isOpen,
  onClose,
  onTriggerSkill
}) => {
  const [skills, setSkills] = useState<SkillItem[]>(DEFAULT_SKILLS);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'catalog' | 'teach'>('catalog');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    api.listSkills().then((fetched) => {
      if (fetched && fetched.length > 0) {
        const customItems: SkillItem[] = fetched.map((s) => ({
          id: s.id,
          name: s.name,
          command: s.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
          description: s.description || 'Custom taught workforce workflow',
          category: 'Custom',
          stepsCount: (s.steps_definition || []).length || 3,
          icon: Sparkles,
          iconColor: 'text-cyan-400',
          requiresApproval: false
        }));
        setSkills(() => {
          const cmds = new Set(customItems.map((c) => c.command));
          return [...customItems, ...DEFAULT_SKILLS.filter((d) => !cmds.has(d.command))];
        });
      }
    }).catch(console.error);
  }, [isOpen]);

  // Teach a Task Builder Form
  const [newSkillName, setNewSkillName] = useState('');
  const [newCommand, setNewCommand] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [builderSteps, setBuilderSteps] = useState<Array<{ type: string; details: string }>>([
    { type: 'browser', details: 'Open target website and extract structured table data' },
    { type: 'terminal', details: 'Run Python script to transform records into standard JSON' },
    { type: 'artifact', details: 'Export final report as downloadable summary' }
  ]);
  const [requiresApproval, setRequiresApproval] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  if (!isOpen) return null;

  const handleRun = (cmd: string) => {
    if (onTriggerSkill) {
      onTriggerSkill(cmd);
      onClose();
    }
  };

  const handleSaveTaughtTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkillName.trim() || !newCommand.trim()) return;

    try {
      const cleanCmd = newCommand.trim().replace(/^\//, '');
      const created = await api.createSkill({
        name: newSkillName.trim(),
        description: newDescription.trim() || 'Custom taught autonomous task',
        steps_definition: builderSteps
      });

      const newSkill: SkillItem = {
        id: created.id,
        name: created.name,
        command: cleanCmd,
        description: created.description,
        category: 'Custom',
        stepsCount: builderSteps.length,
        icon: Sparkles,
        iconColor: 'text-cyan-400',
        requiresApproval
      };

      setSkills([newSkill, ...skills]);
      setActiveTab('catalog');
      setNewSkillName('');
      setNewCommand('');
      setNewDescription('');
      showToast(`Skill "/${cleanCmd}" successfully registered.`);
    } catch (err) {
      console.error(err);
      showToast('Failed to save skill to database.');
    }
  };

  const filteredSkills = skills.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.command.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xl flex items-center justify-center p-4 select-none animate-springEnter">
      <div className="bg-[#0c0c10] border border-white/[0.12] rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-[0_32px_96px_rgba(0,0,0,0.95)] overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-white/[0.08] flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-b from-white/15 to-white/5 border border-white/10 flex items-center justify-center text-white shadow-xs">
              <Sparkles className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-tight">Capabilities & Skills</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Extend bot autonomous capabilities with reusable slash commands and interactive task definitions.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.06] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Segmented Tabs & Search */}
        <div className="px-5 py-3 border-b border-white/[0.06] bg-black/20 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex bg-[#14141a] p-1 rounded-xl border border-white/[0.06] gap-1">
            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition duration-150 ${
                activeTab === 'catalog'
                  ? 'bg-white/[0.14] text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Skills Catalog ({skills.length})
            </button>
            <button
              onClick={() => setActiveTab('teach')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition duration-150 ${
                activeTab === 'teach'
                  ? 'bg-white/[0.14] text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Teach a Task (Workflow Builder)
            </button>
          </div>

          {activeTab === 'catalog' && (
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search skills..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#14141a] border border-white/[0.08] rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 select-text">
          {toast && (
            <div className="mb-4 px-4 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>{toast}</span>
            </div>
          )}

          {activeTab === 'catalog' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredSkills.map((sk) => {
                const Icon = sk.icon;
                return (
                  <div
                    key={sk.id}
                    className="p-4 rounded-xl bg-[#111116] border border-white/[0.07] hover:border-white/[0.14] transition flex flex-col justify-between group shadow-xs"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-b from-white/10 to-white/5 border border-white/10 flex items-center justify-center text-zinc-200 shrink-0">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-white tracking-tight">{sk.name}</h4>
                            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded">
                              /{sk.command}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleRun(sk.command)}
                          className="flex items-center gap-1.5 bg-white text-black hover:bg-zinc-200 text-xs font-semibold py-1.5 px-3 rounded-lg transition shadow-xs pressable"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Run</span>
                        </button>
                      </div>

                      <p className="text-xs text-zinc-400 mt-3 leading-relaxed">{sk.description}</p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                      <span className="flex items-center gap-1.5">
                        <Layers className="w-3 h-3" />
                        <span>{sk.stepsCount} steps</span>
                      </span>

                      {sk.requiresApproval && (
                        <span className="flex items-center gap-1 text-amber-400/90 font-medium">
                          <ShieldAlert className="w-3 h-3" />
                          <span>Requires Approval</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Teach a Task Builder Form */
            <form onSubmit={handleSaveTaughtTask} className="max-w-2xl mx-auto space-y-4">
              <div className="p-4 rounded-xl bg-[#111116] border border-white/[0.08] space-y-3">
                <h3 className="text-xs font-semibold text-white">Task Definition & Slash Trigger</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Workflow Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Daily Stripe Reconciliation"
                      value={newSkillName}
                      onChange={(e) => setNewSkillName(e.target.value)}
                      className="w-full bg-[#14141a] border border-white/[0.1] rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Slash Command Trigger</label>
                    <div className="flex items-center bg-[#14141a] border border-white/[0.1] rounded-xl px-3 py-1.5">
                      <span className="text-zinc-500 text-xs font-mono mr-1">/</span>
                      <input
                        type="text"
                        required
                        placeholder="stripe-recon"
                        value={newCommand}
                        onChange={(e) => setNewCommand(e.target.value)}
                        className="bg-transparent text-xs text-white focus:outline-none flex-1 font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Description & Objective</label>
                  <input
                    type="text"
                    placeholder="What should the bot achieve when this command is triggered?"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="w-full bg-[#14141a] border border-white/[0.1] rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Step Sequence Builder */}
              <div className="p-4 rounded-xl bg-[#111116] border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-white">Execution Steps Sequence</h3>
                  <button
                    type="button"
                    onClick={() => setBuilderSteps([...builderSteps, { type: 'terminal', details: 'Process intermediate results' }])}
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Step</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {builderSteps.map((st, i) => (
                    <div key={i} className="flex items-center gap-2 bg-[#14141a] border border-white/[0.06] p-2.5 rounded-xl">
                      <span className="text-[10px] font-mono font-bold text-zinc-500 w-5 text-center">0{i+1}</span>
                      <select
                        value={st.type}
                        onChange={(e) => {
                          const updated = [...builderSteps];
                          updated[i].type = e.target.value;
                          setBuilderSteps(updated);
                        }}
                        className="bg-black/60 border border-white/[0.08] text-xs text-zinc-300 rounded-lg px-2 py-1 focus:outline-none"
                      >
                        <option value="browser">Browser</option>
                        <option value="terminal">Terminal</option>
                        <option value="artifact">Artifact</option>
                        <option value="api">API Call</option>
                      </select>
                      <input
                        type="text"
                        value={st.details}
                        onChange={(e) => {
                          const updated = [...builderSteps];
                          updated[i].details = e.target.value;
                          setBuilderSteps(updated);
                        }}
                        className="bg-transparent text-xs text-zinc-200 focus:outline-none flex-1 px-2"
                      />
                      {builderSteps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setBuilderSteps(builderSteps.filter((_, idx) => idx !== i))}
                          className="text-zinc-500 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requiresApproval}
                    onChange={(e) => setRequiresApproval(e.target.checked)}
                    className="rounded bg-black border-zinc-700 text-cyan-500"
                  />
                  <span>Require human approval before executing this skill</span>
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('catalog')}
                    className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary text-xs">
                    Save Taught Skill
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
