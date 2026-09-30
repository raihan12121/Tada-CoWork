import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  BrainCircuit, 
  CalendarClock, 
  HardDrive, 
  ShieldCheck, 
  Clock, 
  Settings, 
  ChevronRight, 
  Zap, 
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  TerminalSquare
} from 'lucide-react';
import type { Session } from '../types';
import { api } from '../services/api';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  sessions: Session[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
}

const navItems = [
  { id: 'workspace', label: 'Workspace', icon: TerminalSquare },
  { id: 'skills', label: 'Skills & Swarms', icon: Sparkles },
  { id: 'memory', label: 'Memory', icon: BrainCircuit },
  { id: 'schedules', label: 'Automations', icon: CalendarClock },
  { id: 'bridge', label: 'Local Bridge', icon: HardDrive },
  { id: 'audit', label: 'Safety & Audit', icon: ShieldCheck },
];

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentTab, 
  setCurrentTab, 
  sessions, 
  activeSessionId, 
  onSelectSession, 
  onNewSession 
}) => {
  const [planTier, setPlanTier] = useState<any>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    api.getPlanTierStatus()
      .then(setPlanTier)
      .catch((err) => console.error('Failed to load plan tier status:', err));
  }, [sessions.length]);

  const statusDot = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-pulse';
      case 'waiting_approval':
        return 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]';
      case 'completed':
        return 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]';
      case 'failed':
        return 'bg-rose-400 shadow-[0_0_6px_rgba(244,63,94,0.6)]';
      default:
        return 'bg-zinc-600';
    }
  };

  const usagePercent = planTier?.monthly_task_limit === -1 
    ? 15 
    : Math.min(100, Math.round(((planTier?.tasks_used_this_month || 0) / (planTier?.monthly_task_limit || 1)) * 100));

  return (
    <aside 
      className={`h-screen bg-[#070709] border-r border-white/[0.08] flex flex-col select-none transition-all duration-200 z-20 ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-14 px-3 flex items-center justify-between border-b border-white/[0.06]">
        {!isCollapsed ? (
          <div className="flex items-center gap-2.5 pl-1.5">
            {/* Grok geometric angular emblem */}
            <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-black font-black text-sm tracking-tighter shadow-md">
              <span className="transform -skew-x-12">/</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm tracking-tight text-white">Grok</span>
                <span className="text-[10px] font-mono text-zinc-400 bg-white/[0.08] px-1.5 py-0.5 rounded">Build</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full flex justify-center">
            <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-black font-black text-sm">
              <span className="transform -skew-x-12">/</span>
            </div>
          </div>
        )}

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-zinc-500 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-white/[0.06] transition"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {/* New Task Pill */}
      <div className="p-3">
        <button
          onClick={onNewSession}
          className={`w-full flex items-center justify-center gap-2 bg-white text-black hover:bg-zinc-200 font-semibold text-xs py-2 rounded-xl transition shadow-sm ${
            isCollapsed ? 'px-0' : 'px-3'
          }`}
          title="New Task"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          {!isCollapsed && (
            <>
              <span>New Task</span>
              <span className="ml-auto text-[10px] text-zinc-500 font-mono">⌘K</span>
            </>
          )}
        </button>
      </div>

      {/* Main Navigation */}
      <nav className="px-2 space-y-0.5">
        {!isCollapsed && (
          <div className="px-2 pb-1 text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">
            Navigation
          </div>
        )}
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = currentTab === id;
          return (
            <button
              key={id}
              onClick={() => setCurrentTab(id)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition ${
                isActive
                  ? 'bg-white/[0.1] text-white shadow-xs'
                  : 'text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200'
              } ${isCollapsed ? 'justify-center' : ''}`}
              title={isCollapsed ? label : undefined}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
              {!isCollapsed && <span>{label}</span>}
              {!isCollapsed && isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto text-zinc-500" />}
            </button>
          );
        })}
      </nav>

      {/* Recent History Stream */}
      {!isCollapsed && (
        <div className="flex-1 min-h-0 overflow-y-auto px-2 pt-4 mt-3 border-t border-white/[0.06]">
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">
              Recent Tasks
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">{sessions.length}</span>
          </div>
          <div className="space-y-1">
            {sessions.length === 0 ? (
              <p className="text-xs text-zinc-600 px-2 py-4 italic text-center">No tasks recorded yet.</p>
            ) : (
              sessions.map((s) => {
                const isSelected = activeSessionId === s.id && currentTab === 'workspace';
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      onSelectSession(s.id);
                      setCurrentTab('workspace');
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg transition group ${
                      isSelected
                        ? 'bg-white/[0.09] text-white border border-white/[0.08]'
                        : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(s.status)}`} />
                      <span className="text-xs font-medium truncate flex-1">{s.task}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 ml-3.5 text-[10px] text-zinc-500 font-mono">
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      <span>·</span>
                      <span className="capitalize">{s.status.replace('_', ' ')}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Spacer if collapsed */}
      {isCollapsed && <div className="flex-1" />}

      {/* Plan Tier Display */}
      {!isCollapsed && planTier && (
        <div className="px-3 py-2.5 border-t border-white/[0.06] bg-black/40">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-cyan-400" />
              {planTier.tier_name}
            </span>
            <span className="text-[10px] text-zinc-400 font-mono">
              {planTier.monthly_task_limit === -1 
                ? 'Unlimited' 
                : `${planTier.tasks_used_this_month}/${planTier.monthly_task_limit}`}
            </span>
          </div>
          <div className="w-full bg-zinc-800 h-1 rounded-full mt-1.5 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all ${
                usagePercent >= 90 ? 'bg-amber-400' : 'bg-cyan-400'
              }`} 
              style={{ width: `${usagePercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Bottom Settings & Status */}
      <div className="p-2 border-t border-white/[0.06] bg-[#050507]">
        <button
          onClick={() => setCurrentTab('settings')}
          className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition ${
            currentTab === 'settings' 
              ? 'bg-white/[0.09] text-white' 
              : 'text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200'
          } ${isCollapsed ? 'justify-center' : ''}`}
          title="AI Provider Accounts & MCP"
        >
          <Settings className="w-4 h-4 text-zinc-400 shrink-0" />
          {!isCollapsed && <span>AI Providers</span>}
        </button>

        {!isCollapsed && (
          <div className="flex items-center gap-2 px-2.5 pt-2 text-[10px] text-zinc-500 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Sandbox: Verified & Safe</span>
          </div>
        )}
      </div>
    </aside>
  );
};
