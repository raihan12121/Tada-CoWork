import React from 'react';
import { Bot, Plus, BrainCircuit, CalendarClock, HardDrive, ShieldCheck, FolderOpen, Clock, Settings, ChevronRight } from 'lucide-react';
import type { Session } from '../types';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  sessions: Session[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
}

const navItems = [
  { id: 'workspace', label: 'Workspace', icon: FolderOpen, color: 'text-indigo-300' },
  { id: 'memory', label: 'Memory', icon: BrainCircuit, color: 'text-violet-300' },
  { id: 'schedules', label: 'Scheduled jobs', icon: CalendarClock, color: 'text-amber-300' },
  { id: 'bridge', label: 'Local bridge', icon: HardDrive, color: 'text-emerald-300' },
  { id: 'audit', label: 'Safety & audit', icon: ShieldCheck, color: 'text-cyan-300' },
];

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, setCurrentTab, sessions, activeSessionId, onSelectSession, onNewSession }) => {
  const statusColor = (status: string) => ({ running: 'bg-emerald-400', waiting_approval: 'bg-amber-400', completed: 'bg-blue-400', failed: 'bg-rose-400' }[status] || 'bg-white/30');
  return <aside className="apple-sidebar w-64 bg-[#161b22] border-r border-[#30363d] flex flex-col h-screen select-none">
    <div className="px-5 py-5 border-b border-white/10">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white"><Bot className="w-5 h-5" /></div>
        <div><h1 className="font-semibold text-[15px] tracking-tight text-white">Coagent</h1><p className="text-[11px] text-gray-400">Your AI work partner</p></div>
      </div>
    </div>
    <div className="p-4"><button onClick={onNewSession} className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white text-xs font-semibold py-2.5 px-3 rounded-xl"><Plus className="w-4 h-4" /><span>New task</span></button></div>
    <nav className="px-3 space-y-1">
      <div className="px-3 pb-2 text-[10px] uppercase tracking-[.14em] text-gray-500 font-semibold">Workspace</div>
      {navItems.map(({ id, label, icon: Icon, color }) => <button key={id} onClick={() => setCurrentTab(id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium ${currentTab === id ? 'bg-white/[.09] text-white' : 'text-gray-400 hover:bg-white/[.05] hover:text-gray-200'}`}><Icon className={`w-4 h-4 ${color}`} /><span>{label}</span>{currentTab === id && <ChevronRight className="w-3 h-3 ml-auto text-gray-500" />}</button>)}
    </nav>
    <div className="flex-1 min-h-0 overflow-y-auto px-3 pt-6 mt-4 border-t border-white/10">
      <div className="flex items-center justify-between px-3 pb-2"><span className="text-[10px] uppercase tracking-[.14em] text-gray-500 font-semibold">Recent tasks</span><span className="text-[10px] text-gray-600">{sessions.length}</span></div>
      <div className="space-y-1">{sessions.length === 0 ? <p className="text-xs text-gray-500 px-3 py-3">Your tasks will appear here.</p> : sessions.map(s => <button key={s.id} onClick={() => { onSelectSession(s.id); setCurrentTab('workspace'); }} className={`w-full text-left px-3 py-2.5 rounded-xl ${activeSessionId === s.id && currentTab === 'workspace' ? 'bg-white/[.09]' : 'hover:bg-white/[.05]'}`}><div className="flex items-center gap-2"><span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor(s.status)}`} /><span className="text-xs text-gray-200 truncate">{s.task}</span></div><div className="flex items-center gap-1.5 mt-1.5 ml-3.5 text-[10px] text-gray-500"><Clock className="w-3 h-3" />{new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}<span>·</span><span className="capitalize">{s.status.replace('_', ' ')}</span></div></button>)}</div>
    </div>
    <div className="px-3 py-3 border-t border-white/10"><button onClick={() => setCurrentTab('settings')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs ${currentTab === 'settings' ? 'bg-white/[.09] text-white' : 'text-gray-400 hover:bg-white/[.05]'}`}><Settings className="w-4 h-4 text-sky-300" /><span>AI accounts</span><span className="ml-auto text-[10px] text-gray-600">⌘,</span></button><div className="flex items-center gap-2 px-3 pt-3 text-[10px] text-gray-500"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Local & private</div></div>
  </aside>;
};
