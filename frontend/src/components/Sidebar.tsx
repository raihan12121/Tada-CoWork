import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  BrainCircuit, 
  CalendarClock, 
  HardDrive, 
  ShieldCheck, 
  Settings, 
  ChevronRight, 
  ChevronDown,
  Zap, 
  Sparkles, 
  PanelLeftClose, 
  PanelLeftOpen, 
  TerminalSquare, 
  Pin, 
  Folder, 
  Hash, 
  EyeOff, 
  UserPlus 
} from 'lucide-react';
import type { Session, Bot, Channel } from '../types';
import { api } from '../services/api';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  sessions: Session[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  bots: Bot[];
  activeBotId: string | null;
  onSelectBot: (botId: string) => void;
  onOpenNewBotModal: () => void;
  channels: Channel[];
  activeChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
  onOpenNewChannelModal: () => void;
}

const navItems = [
  { id: 'workspace', label: 'Workspace', icon: TerminalSquare },
  { id: 'skills', label: 'Skills & Swarms', icon: Sparkles },
  { id: 'memory', label: 'Memory (Global)', icon: BrainCircuit },
  { id: 'schedules', label: 'Routines & Cadence', icon: CalendarClock },
  { id: 'bridge', label: 'Local Bridge', icon: HardDrive },
  { id: 'audit', label: 'Safety & Audit', icon: ShieldCheck },
];

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentTab, 
  setCurrentTab, 
  sessions, 
  activeSessionId: _activeSessionId, 
  onSelectSession: _onSelectSession, 
  onNewSession,
  bots,
  activeBotId,
  onSelectBot,
  onOpenNewBotModal,
  channels,
  activeChannelId,
  onSelectChannel,
  onOpenNewChannelModal
}) => {
  const [planTier, setPlanTier] = useState<any>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [showHiddenBots, setShowHiddenBots] = useState(false);

  useEffect(() => {
    api.getPlanTierStatus()
      .then(setPlanTier)
      .catch((err) => console.error('Failed to load plan tier status:', err));
  }, [sessions.length]);

  const toggleFolder = (folderName: string) => {
    setCollapsedFolders((prev) => ({ ...prev, [folderName]: !prev[folderName] }));
  };

  const usagePercent = planTier?.monthly_task_limit === -1 
    ? 24 
    : Math.min(100, Math.round(((planTier?.tasks_used_this_month || 0) / (planTier?.monthly_task_limit || 1)) * 100));

  // Partition bots
  const pinnedBots = bots.filter((b) => b.pinned && !b.is_hidden);
  const unpinnedBots = bots.filter((b) => !b.pinned && !b.is_hidden);
  const hiddenBots = bots.filter((b) => b.is_hidden);

  // Group unpinned bots by folder
  const foldersMap: Record<string, Bot[]> = {};
  unpinnedBots.forEach((b) => {
    const f = b.folder_name || 'General';
    if (!foldersMap[f]) foldersMap[f] = [];
    foldersMap[f].push(b);
  });

  return (
    <aside 
      className={`h-screen bg-[#070709] border-r border-white/[0.08] flex flex-col select-none transition-all duration-200 z-20 ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-14 px-3 flex items-center justify-between border-b border-white/[0.06]">
        {!isCollapsed ? (
          <div className="flex items-center gap-2.5 pl-1">
            {/* AnyWork Grokbot Angular Emblem */}
            <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-black font-black text-sm tracking-tighter shadow-md">
              <span className="transform -skew-x-12">/</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm tracking-tight text-white">AnyWork</span>
                <span className="text-[10px] font-mono text-zinc-400 bg-white/[0.08] px-1.5 py-0.5 rounded">v1.1</span>
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

      {/* Action Buttons */}
      <div className="p-2.5 space-y-1.5">
        <button
          onClick={onNewSession}
          className={`w-full flex items-center justify-center gap-2 bg-white text-black hover:bg-zinc-200 font-bold text-xs py-2 rounded-xl transition shadow-sm ${
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

        {!isCollapsed && (
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={onOpenNewBotModal}
              className="flex items-center justify-center gap-1 bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 text-[11px] font-medium py-1.5 rounded-lg transition border border-white/[0.06]"
              title="Create New Bot"
            >
              <UserPlus className="w-3.5 h-3.5 text-cyan-400" />
              <span>New Bot</span>
            </button>
            <button
              onClick={onOpenNewChannelModal}
              className="flex items-center justify-center gap-1 bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 text-[11px] font-medium py-1.5 rounded-lg transition border border-white/[0.06]"
              title="Create Channel"
            >
              <Hash className="w-3.5 h-3.5 text-indigo-400" />
              <span>Channel</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Scroll Area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 space-y-3 pt-1">
        {/* Navigation Tabs */}
        <nav className="space-y-0.5">
          {navItems.map(({ id, label, icon: Icon }) => {
            const isActive = currentTab === id;
            return (
              <button
                key={id}
                onClick={() => setCurrentTab(id)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                  isActive
                    ? 'bg-white/[0.1] text-white shadow-xs'
                    : 'text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200'
                } ${isCollapsed ? 'justify-center' : ''}`}
                title={isCollapsed ? label : undefined}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
                {!isCollapsed && <span>{label}</span>}
                {!isCollapsed && isActive && <ChevronRight className="w-3 h-3 ml-auto text-zinc-500" />}
              </button>
            );
          })}
        </nav>

        {!isCollapsed && (
          <>
            {/* PINNED BOTS */}
            {pinnedBots.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 px-2 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                  <Pin className="w-3 h-3 text-cyan-400" />
                  <span>Pinned Bots</span>
                </div>
                {pinnedBots.map((b) => {
                  const isSelected = activeBotId === b.id && currentTab === 'workspace';
                  return (
                    <button
                      key={b.id}
                      onClick={() => {
                        onSelectBot(b.id);
                        setCurrentTab('workspace');
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition text-left ${
                        isSelected
                          ? 'bg-white/[0.1] text-white border border-white/[0.08]'
                          : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                      }`}
                    >
                      <span className="text-base">{b.avatar}</span>
                      <div className="min-w-0 flex-1 truncate">
                        <p className="text-xs font-semibold truncate text-zinc-200">{b.name}</p>
                        <p className="text-[10px] text-zinc-500 truncate">{b.role_tag}</p>
                      </div>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}

            {/* CHANNELS / GROUP CHATS */}
            {channels.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between px-2 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                  <div className="flex items-center gap-1.5">
                    <Hash className="w-3 h-3 text-indigo-400" />
                    <span>Channels</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono">{channels.length}</span>
                </div>
                {channels.map((ch) => {
                  const isSelected = activeChannelId === ch.id && currentTab === 'workspace';
                  return (
                    <button
                      key={ch.id}
                      onClick={() => {
                        onSelectChannel(ch.id);
                        setCurrentTab('workspace');
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition text-left ${
                        isSelected
                          ? 'bg-indigo-500/15 text-white border border-indigo-500/30'
                          : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                      }`}
                    >
                      <Hash className="w-3.5 h-3.5 text-zinc-500" />
                      <span className="text-xs font-medium truncate flex-1">{ch.name}</span>
                      <span className="text-[10px] text-zinc-600 font-mono">{ch.bot_ids.length} bots</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* FOLDERS & BOTS */}
            {Object.keys(foldersMap).length > 0 && (
              <div className="space-y-2">
                <div className="px-2 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                  Team Folders
                </div>
                {Object.entries(foldersMap).map(([folderName, folderBots]) => {
                  const isFolded = collapsedFolders[folderName];
                  return (
                    <div key={folderName} className="space-y-0.5">
                      <button
                        onClick={() => toggleFolder(folderName)}
                        className="w-full flex items-center justify-between px-2 py-1 text-xs text-zinc-400 hover:text-white rounded-md hover:bg-white/[0.03]"
                      >
                        <div className="flex items-center gap-1.5">
                          <Folder className="w-3.5 h-3.5 text-zinc-500" />
                          <span className="text-xs font-semibold">{folderName}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-zinc-600 font-mono">{folderBots.length}</span>
                          {isFolded ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </div>
                      </button>

                      {!isFolded && (
                        <div className="pl-3 space-y-0.5 border-l border-white/[0.06] ml-2">
                          {folderBots.map((b) => {
                            const isSelected = activeBotId === b.id && currentTab === 'workspace';
                            return (
                              <button
                                key={b.id}
                                onClick={() => {
                                  onSelectBot(b.id);
                                  setCurrentTab('workspace');
                                }}
                                className={`w-full flex items-center gap-2 px-2 py-1 rounded-lg transition text-left ${
                                  isSelected
                                    ? 'bg-white/[0.1] text-white border border-white/[0.08]'
                                    : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                                }`}
                              >
                                <span className="text-sm">{b.avatar}</span>
                                <div className="min-w-0 flex-1 truncate">
                                  <p className="text-xs font-medium truncate text-zinc-200">{b.name}</p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* HIDDEN BOTS */}
            {hiddenBots.length > 0 && (
              <div className="pt-2">
                <button
                  onClick={() => setShowHiddenBots(!showHiddenBots)}
                  className="w-full flex items-center justify-between px-2 py-1 text-[11px] text-zinc-500 hover:text-zinc-300"
                >
                  <div className="flex items-center gap-1.5">
                    <EyeOff className="w-3 h-3" />
                    <span>Hidden Bots ({hiddenBots.length})</span>
                  </div>
                  {showHiddenBots ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
                {showHiddenBots && (
                  <div className="space-y-1 mt-1">
                    {hiddenBots.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => {
                          onSelectBot(b.id);
                          setCurrentTab('workspace');
                        }}
                        className="w-full flex items-center gap-2 px-2 py-1 rounded-lg text-zinc-500 hover:text-zinc-300 text-left"
                      >
                        <span className="text-sm opacity-50">{b.avatar}</span>
                        <span className="text-xs truncate">{b.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Spacer if collapsed */}
      {isCollapsed && <div className="flex-1" />}

      {/* Weekly Usage Meter */}
      {!isCollapsed && (
        <div className="px-3 py-2.5 border-t border-white/[0.06] bg-black/40">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-cyan-400" />
              <span>Weekly Usage</span>
            </span>
            <span className="text-[10px] text-zinc-400 font-mono">
              {usagePercent}% used
            </span>
          </div>
          <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all ${
                usagePercent >= 90 ? 'bg-amber-400' : 'bg-cyan-400'
              }`} 
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          <p className="text-[10px] text-zinc-500 mt-1 font-mono">Resets every 7 days</p>
        </div>
      )}

      {/* Bottom Settings & Status */}
      <div className="p-2 border-t border-white/[0.06] bg-[#050507]">
        <button
          onClick={() => setCurrentTab('settings')}
          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition ${
            currentTab === 'settings' 
              ? 'bg-white/[0.09] text-white' 
              : 'text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200'
          } ${isCollapsed ? 'justify-center' : ''}`}
          title="AI Provider Accounts & MCP"
        >
          <Settings className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          {!isCollapsed && <span>AI Providers & MCP</span>}
        </button>

        {!isCollapsed && (
          <div className="flex items-center gap-2 px-2.5 pt-1.5 text-[10px] text-zinc-500 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Cloud VM: Always-On Active</span>
          </div>
        )}
      </div>
    </aside>
  );
};
