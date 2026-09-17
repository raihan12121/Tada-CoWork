import React from 'react';
import { 
  Bot, 
  PlusCircle, 
  BrainCircuit, 
  CalendarClock, 
  HardDrive, 
  ShieldCheck, 
  FolderOpen,
  Clock
  ,Settings
} from 'lucide-react';
import type { Session } from '../types';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  sessions: Session[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession
}) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-emerald-500';
      case 'waiting_approval': return 'bg-amber-500 animate-pulse';
      case 'completed': return 'bg-blue-500';
      case 'failed': return 'bg-rose-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <aside className="w-64 bg-[#161b22] border-r border-[#30363d] flex flex-col h-screen select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-[#30363d] flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-lg">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-semibold text-sm tracking-wide text-white">Coagent</h1>
            <p className="text-[11px] text-gray-400">Autonomous Work Agent</p>
          </div>
        </div>
      </div>

      {/* New Session Action */}
      <div className="p-3">
        <button
          onClick={onNewSession}
          className="w-full flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium py-2 px-3 rounded-md transition shadow"
        >
          <PlusCircle className="w-4 h-4" />
          <span>New Session</span>
        </button>
        <button onClick={() => setCurrentTab('settings')} className={`w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${currentTab === 'settings' ? 'bg-[#21262d] text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262d]/50'}`}>
          <Settings className="w-4 h-4 text-cyan-400" /><span>AI Provider</span>
        </button>
      </div>

      {/* Main Navigation */}
      <div className="px-3 py-1 space-y-1">
        <button
          onClick={() => setCurrentTab('workspace')}
          className={`w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
            currentTab === 'workspace' ? 'bg-[#21262d] text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262d]/50'
          }`}
        >
          <FolderOpen className="w-4 h-4 text-indigo-400" />
          <span>Active Task</span>
        </button>
        <button
          onClick={() => setCurrentTab('memory')}
          className={`w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
            currentTab === 'memory' ? 'bg-[#21262d] text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262d]/50'
          }`}
        >
          <BrainCircuit className="w-4 h-4 text-purple-400" />
          <span>Memory Manager</span>
        </button>
        <button
          onClick={() => setCurrentTab('schedules')}
          className={`w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
            currentTab === 'schedules' ? 'bg-[#21262d] text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262d]/50'
          }`}
        >
          <CalendarClock className="w-4 h-4 text-amber-400" />
          <span>Scheduled Jobs</span>
        </button>
        <button
          onClick={() => setCurrentTab('bridge')}
          className={`w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
            currentTab === 'bridge' ? 'bg-[#21262d] text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262d]/50'
          }`}
        >
          <HardDrive className="w-4 h-4 text-emerald-400" />
          <span>Local Bridge</span>
        </button>
        <button
          onClick={() => setCurrentTab('audit')}
          className={`w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
            currentTab === 'audit' ? 'bg-[#21262d] text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-[#21262d]/50'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          <span>Audit & Safety</span>
        </button>
      </div>

      {/* Recent Sessions List */}
      <div className="flex-1 overflow-y-auto px-3 py-2 border-t border-[#30363d] mt-2">
        <div className="text-[10px] font-semibold uppercase text-gray-500 tracking-wider mb-2 px-1">
          Recent Sessions
        </div>
        <div className="space-y-1">
          {sessions.length === 0 ? (
            <div className="text-xs text-gray-500 italic p-2">No sessions yet</div>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  onSelectSession(s.id);
                  setCurrentTab('workspace');
                }}
                className={`w-full text-left p-2 rounded-md text-xs transition flex flex-col space-y-1 ${
                  activeSessionId === s.id && currentTab === 'workspace'
                    ? 'bg-[#21262d] text-white border border-[#30363d]'
                    : 'text-gray-400 hover:bg-[#21262d]/40 hover:text-gray-200'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-medium truncate pr-2 text-white">
                    {s.task.slice(0, 24)}...
                  </span>
                  <span className={`w-2 h-2 rounded-full ${getStatusColor(s.status)}`} />
                </div>
                <div className="flex items-center text-[10px] text-gray-500 space-x-1">
                  <Clock className="w-3 h-3" />
                  <span>{new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <span>·</span>
                  <span className="capitalize">{s.status.replace('_', ' ')}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Footer Profile/Isolation Scope */}
      <div className="p-3 border-t border-[#30363d] bg-[#0d1117] flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-[11px] font-mono">Tenant: default</span>
        </div>
        <span className="text-[10px] text-gray-500">v1.0.0</span>
      </div>
    </aside>
  );
};
