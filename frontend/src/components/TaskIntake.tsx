import React, { useState } from 'react';
import { 
  ArrowUp,
  Paperclip,
  X,
  ShieldCheck,
  FolderSync, 
  FileSpreadsheet, 
  FileText, 
  Search, 
  Mail, 
  Layers,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import type { ProviderAccount } from '../services/api';

interface TaskIntakeProps {
  onSubmitTask: (task: string, files: File[], providerAccountId?: string, allowProviderFailover?: boolean) => void;
  isLoading: boolean;
  providerAccounts: ProviderAccount[];
}

export const TaskIntake: React.FC<TaskIntakeProps> = ({ onSubmitTask, isLoading, providerAccounts }) => {
  const [taskInput, setTaskInput] = useState('');
  const [inputFiles, setInputFiles] = useState<File[]>([]);
  const [providerAccountId, setProviderAccountId] = useState('');
  const [allowProviderFailover, setAllowProviderFailover] = useState(false);

  const templates = [
    {
      icon: <FolderSync className="w-4 h-4 text-emerald-400" />,
      title: "Organize messy folder",
      category: "Files & System",
      prompt: "Organize my Downloads folder — scan files, categorize by project and type, and propose a clean folder structure with a summary report."
    },
    {
      icon: <FileSpreadsheet className="w-4 h-4 text-cyan-400" />,
      title: "Build expense spreadsheet",
      category: "Data & Finance",
      prompt: "Build an expense spreadsheet from raw receipt data — normalize dates, vendors, categories, amounts, and compute total breakdowns with summary charts."
    },
    {
      icon: <Search className="w-4 h-4 text-indigo-400" />,
      title: "Deep competitor research",
      category: "Market Intelligence",
      prompt: "Research top 5 competitors in autonomous AI workplace tools and produce a detailed comparison matrix report with citations and pricing breakdown."
    },
    {
      icon: <FileText className="w-4 h-4 text-purple-400" />,
      title: "Draft executive report",
      category: "Documents",
      prompt: "Turn meeting notes and background data into a clean, 3-section executive briefing document formatted with key findings and next steps."
    },
    {
      icon: <Layers className="w-4 h-4 text-amber-400" />,
      title: "Multi-agent research swarm",
      category: "Swarm Execution",
      prompt: "Deploy a multi-agent swarm to analyze market trends, gather public data, and generate an integrated strategy deliverable."
    },
    {
      icon: <Mail className="w-4 h-4 text-rose-400" />,
      title: "Weekly progress digest",
      category: "Communications",
      prompt: "Aggregate this week's tickets and product progress, format an executive digest, and draft a team announcement email (stop before sending)."
    }
  ];

  const handleRemoveFile = (index: number) => {
    setInputFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskInput.trim() || isLoading) return;
    onSubmitTask(taskInput.trim(), inputFiles, providerAccountId || undefined, allowProviderFailover);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 flex flex-col items-center">
      {/* Grok Hero Section */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.05] border border-white/[0.1] text-zinc-300 text-xs font-medium mb-4 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>Grok Autonomous Work Engine</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          What do you want to build?
        </h1>
        <p className="text-sm text-zinc-400 mt-2.5 max-w-lg mx-auto leading-relaxed">
          Delegate multi-step tasks across web research, spreadsheets, code execution, and files. 
          Verified sandboxes with strict human approval gates.
        </p>
      </div>

      {/* Grok Composer Box */}
      <form onSubmit={handleSubmit} className="w-full mb-8">
        <div className="grok-composer-container p-4">
          <textarea
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Grok to research, analyze data, generate spreadsheets, or automate a multi-step workflow..."
            rows={4}
            className="w-full bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none resize-none leading-relaxed"
            disabled={isLoading}
          />

          {/* Attached Files Chips */}
          {inputFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 pb-1 border-t border-white/[0.06]">
              {inputFiles.map((file, idx) => (
                <span 
                  key={idx} 
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.07] border border-white/[0.1] text-xs text-zinc-200"
                >
                  <Paperclip className="w-3 h-3 text-cyan-400" />
                  <span className="truncate max-w-[180px]">{file.name}</span>
                  <button 
                    type="button" 
                    onClick={() => handleRemoveFile(idx)} 
                    className="text-zinc-400 hover:text-white ml-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Composer Bottom Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-white/[0.06] mt-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* Attach File Button */}
              <label 
                className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs text-zinc-300 transition"
                title="Attach files to provide context"
              >
                <Paperclip className="w-3.5 h-3.5 text-zinc-400" />
                <span>Attach</span>
                {inputFiles.length > 0 && (
                  <span className="bg-cyan-500/20 text-cyan-300 font-mono text-[10px] px-1.5 py-0.2 rounded-full">
                    {inputFiles.length}
                  </span>
                )}
                <input 
                  type="file" 
                  multiple 
                  className="hidden" 
                  disabled={isLoading} 
                  onChange={(e) => setInputFiles((prev) => [...prev, ...Array.from(e.target.files || [])])} 
                />
              </label>

              {/* Provider Account Picker */}
              <select
                value={providerAccountId}
                onChange={(e) => setProviderAccountId(e.target.value)}
                disabled={isLoading}
                className="bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-xs text-zinc-200 rounded-lg py-1.5 px-2.5 focus:outline-none transition max-w-[190px] truncate"
              >
                <option value="" className="bg-[#121215] text-zinc-200">Active AI Account</option>
                {providerAccounts
                  .filter((a) => a.configured && a.status !== 'quota_exhausted')
                  .map((account) => (
                    <option key={account.id} value={account.id} className="bg-[#121215] text-zinc-200">
                      {account.label} ({account.provider})
                    </option>
                  ))}
              </select>

              {/* Failover checkbox */}
              {providerAccountId && (
                <label 
                  className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer select-none"
                  title="Fallback to other configured accounts of the same provider if quota is exceeded"
                >
                  <input 
                    type="checkbox" 
                    checked={allowProviderFailover} 
                    onChange={(e) => setAllowProviderFailover(e.target.checked)} 
                    disabled={isLoading}
                    className="rounded bg-black border-zinc-700 text-white focus:ring-0" 
                  />
                  <span>Failover</span>
                </label>
              )}

              {/* Safety badge */}
              <div className="hidden sm:inline-flex items-center gap-1 text-[11px] text-zinc-500 font-mono">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Approval Gated</span>
              </div>
            </div>

            {/* Submit / Generate Plan Button */}
            <button
              type="submit"
              disabled={!taskInput.trim() || isLoading}
              className="w-8 h-8 rounded-full bg-white hover:bg-zinc-200 disabled:opacity-20 text-black flex items-center justify-center transition shadow-md shrink-0"
              title="Generate execution plan"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin text-black" />
              ) : (
                <ArrowUp className="w-4 h-4 stroke-[2.5]" />
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Quick-Start Templates Grid */}
      <div className="w-full">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-3 px-1">
          Suggested Workflows
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {templates.map((tpl, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setTaskInput(tpl.prompt)}
              className="text-left p-3.5 rounded-xl bg-[#09090c] hover:bg-[#121216] border border-white/[0.08] hover:border-white/[0.18] transition flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="p-1.5 rounded-lg bg-white/[0.05] group-hover:bg-white/[0.1] transition">
                    {tpl.icon}
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500 group-hover:text-zinc-400">
                    {tpl.category}
                  </span>
                </div>
                <h4 className="text-xs font-semibold text-white group-hover:text-cyan-300 transition">
                  {tpl.title}
                </h4>
                <p className="text-[11px] text-zinc-400 line-clamp-2 mt-1 leading-relaxed">
                  {tpl.prompt}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
