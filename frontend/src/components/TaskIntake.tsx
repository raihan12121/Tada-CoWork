import React, { useState } from 'react';
import { 
  Sparkles, 
  FolderSync, 
  FileSpreadsheet, 
  FileText, 
  Search, 
  Mail, 
  ArrowRight,
  ShieldAlert
} from 'lucide-react';

interface TaskIntakeProps {
  onSubmitTask: (task: string, files: File[]) => void;
  isLoading: boolean;
}

export const TaskIntake: React.FC<TaskIntakeProps> = ({ onSubmitTask, isLoading }) => {
  const [taskInput, setTaskInput] = useState('');
  const [inputFiles, setInputFiles] = useState<File[]>([]);

  const templates = [
    {
      icon: <FolderSync className="w-4 h-4 text-emerald-400" />,
      title: "Organize messy folder",
      prompt: "Organize my Downloads folder — scan files, categorize by type/project, and propose a clean folder structure with a summary report."
    },
    {
      icon: <FileSpreadsheet className="w-4 h-4 text-amber-400" />,
      title: "Build expense spreadsheet",
      prompt: "Build an expense spreadsheet from raw receipt data — normalize dates, vendors, categories, amounts, and compute total breakdowns."
    },
    {
      icon: <FileText className="w-4 h-4 text-blue-400" />,
      title: "Draft executive report",
      prompt: "Turn meeting notes and background data into a clean, 3-section executive briefing document formatted with key findings and next steps."
    },
    {
      icon: <Search className="w-4 h-4 text-purple-400" />,
      title: "Competitor research & comparison",
      prompt: "Research top 5 competitors in autonomous AI workplace tools and produce a detailed comparison matrix report with citations."
    },
    {
      icon: <Mail className="w-4 h-4 text-rose-400" />,
      title: "Weekly team digest",
      prompt: "Aggregate this week's tickets and product progress, format an executive digest, and draft a team announcement email (stop before sending)."
    }
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskInput.trim() || isLoading) return;
    onSubmitTask(taskInput.trim(), inputFiles);
  };

  return (
    <div className="max-w-3xl mx-auto py-12 px-6">
      {/* Title & Philosophy */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center space-x-2 bg-indigo-950/60 border border-indigo-500/30 px-3 py-1 rounded-full text-indigo-300 text-xs font-medium mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Coagent Autonomous Work Engine</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
          What knowledge work can I handle today?
        </h2>
        <p className="text-sm text-gray-400 mt-2 max-w-xl mx-auto">
          Delegate multi-step, multi-tool tasks across files, spreadsheets, web research, and documents.
          Coagent plans before acting and always asks before consequential actions.
        </p>
      </div>

      {/* Task Input Box */}
      <form onSubmit={handleSubmit} className="relative mb-8">
        <div className="relative rounded-xl bg-[#161b22] border border-[#30363d] focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition shadow-xl p-3">
          <textarea
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            placeholder="Describe your task in plain language (e.g. 'Research competitors and compile an Excel comparison spreadsheet')..."
            rows={4}
            className="w-full bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none resize-none"
            disabled={isLoading}
          />
          <div className="flex items-center justify-between pt-2 border-t border-[#30363d]/60 mt-2">
            <div className="flex items-center space-x-2 text-xs text-gray-400">
              <ShieldAlert className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-[11px]">Approval gates active for high-risk actions</span>
            </div>
            <label className="cursor-pointer text-[11px] text-indigo-300 hover:text-indigo-200 mr-3">
              Attach inputs{inputFiles.length ? ` (${inputFiles.length})` : ''}
              <input type="file" multiple className="hidden" disabled={isLoading} onChange={(e) => setInputFiles(Array.from(e.target.files || []))} />
            </label>
            <button
              type="submit"
              disabled={!taskInput.trim() || isLoading}
              className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-medium py-1.5 px-3 rounded-lg transition"
            >
              <span>{isLoading ? 'Planning...' : 'Generate Plan'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </form>

      {/* Quick-Start Template Cards */}
      <div>
        <div className="text-[11px] font-semibold uppercase text-gray-500 tracking-wider mb-3">
          Quick-Start Templates
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {templates.map((tpl, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setTaskInput(tpl.prompt)}
              className="text-left p-3 rounded-lg bg-[#161b22] hover:bg-[#21262d] border border-[#30363d] hover:border-gray-600 transition flex items-start space-x-3 group"
            >
              <div className="p-2 rounded-md bg-[#21262d] group-hover:bg-[#30363d] transition">
                {tpl.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-medium text-white group-hover:text-indigo-300 transition">
                  {tpl.title}
                </h4>
                <p className="text-[11px] text-gray-400 line-clamp-2 mt-0.5">
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
