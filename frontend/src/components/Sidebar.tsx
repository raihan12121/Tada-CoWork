import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  BrainCircuit, 
  CalendarClock, 
  Settings, 
  ChevronRight, 
  ChevronDown, 
  Zap, 
  Sparkles, 
  PanelLeftClose, 
  PanelLeftOpen, 
  Pin, 
  Folder, 
  Hash, 
  EyeOff, 
  UserPlus,
  Webhook
} from 'lucide-react';
import type { Session, Bot, Channel } from '../types';
import { api } from '../services/api';

interface SidebarProps {
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
  onOpenConnectionsModal: () => void;
  onOpenRoutinesModal: () => void;
  onOpenMemoryModal: () => void;
  onOpenSkillsModal: () => void;
  onOpenSettingsModal: () => void;
}

// Polished Bot Avatar Pod
const BotAvatarBadge: React.FC<{ avatar: string; isSelected?: boolean; size?: 'sm' | 'md' }> = ({
  avatar,
  isSelected = false,
  size = 'md'
}) => {
  const sizeClasses = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-7 h-7 text-sm';
  return (
    <div 
      className={`${sizeClasses} rounded-lg flex items-center justify-center shrink-0 transition-all duration-150 ${
        isSelected 
          ? 'bg-gradient-to-b from-white/20 to-white/10 text-white shadow-xs border border-white/25' 
          : 'bg-white/[0.06] border border-white/[0.08] text-zinc-300 group-hover:border-white/15 group-hover:bg-white/[0.09]'
      }`}
    >
      <span className="leading-none select-none">{avatar}</span>
    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({ 
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
  onOpenNewChannelModal,
  onOpenConnectionsModal,
  onOpenRoutinesModal,
  onOpenMemoryModal,
  onOpenSkillsModal,
  onOpenSettingsModal
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
      <div className="h-14 px-3 flex items-center justify-between border-b border-white/[0.06] bg-black/40">
        {!isCollapsed ? (
          <div className="flex items-center gap-2.5 pl-1">
            {/* AnyWork Grokbot Angular Slash Emblem */}
            <div className="w-7 h-7 rounded-lg bg-gradient-to-b from-white to-zinc-200 flex items-center justify-center text-black font-black text-sm tracking-tighter shadow-[0_2px_8px_rgba(255,255,255,0.12)]">
              <span className="transform -skew-x-12 select-none">/</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-[13px] tracking-tight text-white">AnyWork</span>
                <span className="text-[10px] font-mono text-zinc-400 bg-white/[0.06] border border-white/[0.08] px-1.5 py-0.2 rounded">v1.1</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full flex justify-center">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-b from-white to-zinc-200 flex items-center justify-center text-black font-black text-sm shadow-md">
              <span className="transform -skew-x-12 select-none">/</span>
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

      {/* Action Buttons: New Task, New Bot, Channel */}
      <div className="p-2.5 space-y-1.5">
        <button
          onClick={onNewSession}
          className={`w-full flex items-center justify-center gap-2 bg-white text-black hover:bg-zinc-100 active:scale-[0.985] font-semibold text-xs py-2 rounded-xl transition shadow-[0_2px_10px_rgba(255,255,255,0.15)] ${
            isCollapsed ? 'px-0' : 'px-3'
          }`}
          title="New Task (Cmd+K)"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          {!isCollapsed && (
            <>
              <span className="tracking-tight font-medium">New Task</span>
              <span className="ml-auto text-[10px] text-zinc-500 font-mono bg-zinc-200/60 px-1 rounded">⌘K</span>
            </>
          )}
        </button>

        {!isCollapsed && (
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={onOpenNewBotModal}
              className="flex items-center justify-center gap-1.5 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.985] text-zinc-300 hover:text-white text-[11px] font-medium py-1.5 rounded-lg transition border border-white/[0.06]"
              title="Create New Bot"
            >
              <UserPlus className="w-3.5 h-3.5 text-cyan-400" />
              <span>New Bot</span>
            </button>
            <button
              onClick={onOpenNewChannelModal}
              className="flex items-center justify-center gap-1.5 bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.985] text-zinc-300 hover:text-white text-[11px] font-medium py-1.5 rounded-lg transition border border-white/[0.06]"
              title="Create Channel"
            >
              <Hash className="w-3.5 h-3.5 text-indigo-400" />
              <span>Channel</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Scroll Area: Bots, Channels, Folders */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 space-y-3 pt-1">
        {!isCollapsed ? (
          <>
            {/* PINNED BOTS */}
            {pinnedBots.length > 0 && (
              <div className="space-y-0.5">
                <div className="flex items-center justify-between px-2.5 py-1 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                  <div className="flex items-center gap-1.5">
                    <Pin className="w-3 h-3 text-cyan-400" />
                    <span>Pinned Bots</span>
                  </div>
                  <span className="text-[10px] text-zinc-600 font-mono">{pinnedBots.length}</span>
                </div>
                {pinnedBots.map((b) => {
                  const isSelected = activeBotId === b.id;
                  return (
                    <button
                      key={b.id}
                      onClick={() => onSelectBot(b.id)}
                      className={`linear-nav-item w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition text-left group ${
                        isSelected
                          ? 'active bg-white/[0.09] text-white'
                          : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                      }`}
                    >
                      <BotAvatarBadge avatar={b.avatar} isSelected={isSelected} size="md" />
                      <div className="min-w-0 flex-1 truncate">
                        <p className={`text-xs font-medium truncate ${isSelected ? 'text-white' : 'text-zinc-200'}`}>{b.name}</p>
                        <p className="text-[10px] text-zinc-500 truncate">{b.role_tag}</p>
                      </div>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSelected ? 'bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]' : 'bg-emerald-400/80'}`} />
                    </button>
                  );
                })}
              </div>
            )}

            {/* CHANNELS / GROUP CHATS */}
            {channels.length > 0 && (
              <div className="space-y-0.5">
                <div className="flex items-center justify-between px-2.5 py-1 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                  <div className="flex items-center gap-1.5">
                    <Hash className="w-3 h-3 text-indigo-400" />
                    <span>Channels</span>
                  </div>
                  <span className="text-[10px] text-zinc-600 font-mono">{channels.length}</span>
                </div>
                {channels.map((ch) => {
                  const isSelected = activeChannelId === ch.id;
                  return (
                    <button
                      key={ch.id}
                      onClick={() => onSelectChannel(ch.id)}
                      className={`linear-nav-item w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg transition text-left ${
                        isSelected
                          ? 'active bg-indigo-500/15 text-white border border-indigo-500/30'
                          : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                      }`}
                    >
                      <div className="w-6 h-6 rounded-md bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                        <Hash className="w-3.5 h-3.5 text-indigo-400" />
                      </div>
                      <span className="text-xs font-medium truncate flex-1">{ch.name}</span>
                      <span className="text-[10px] text-zinc-500 font-mono bg-white/[0.04] px-1.5 py-0.5 rounded">{ch.bot_ids.length} bots</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* FOLDERS & BOTS */}
            {Object.keys(foldersMap).length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="px-2.5 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
                  Team Folders
                </div>
                {Object.entries(foldersMap).map(([folderName, folderBots]) => {
                  const isFolded = collapsedFolders[folderName];
                  return (
                    <div key={folderName} className="space-y-0.5">
                      <button
                        onClick={() => toggleFolder(folderName)}
                        className="w-full flex items-center justify-between px-2.5 py-1 text-xs text-zinc-400 hover:text-white rounded-md hover:bg-white/[0.03] transition"
                      >
                        <div className="flex items-center gap-2">
                          <Folder className="w-3.5 h-3.5 text-zinc-500" />
                          <span className="text-xs font-semibold">{folderName}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-zinc-600 font-mono">{folderBots.length}</span>
                          {isFolded ? <ChevronRight className="w-3 h-3 text-zinc-500" /> : <ChevronDown className="w-3 h-3 text-zinc-500" />}
                        </div>
                      </button>

                      {!isFolded && (
                        <div className="pl-2 space-y-0.5 ml-2 border-l border-white/[0.06]">
                          {folderBots.map((b) => {
                            const isSelected = activeBotId === b.id;
                            return (
                              <button
                                key={b.id}
                                onClick={() => onSelectBot(b.id)}
                                className={`linear-nav-item w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition text-left group ${
                                  isSelected
                                    ? 'active bg-white/[0.09] text-white'
                                    : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                                }`}
                              >
                                <BotAvatarBadge avatar={b.avatar} isSelected={isSelected} size="sm" />
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
                  className="w-full flex items-center justify-between px-2.5 py-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition"
                >
                  <div className="flex items-center gap-1.5">
                    <EyeOff className="w-3 h-3" />
                    <span>Hidden Bots ({hiddenBots.length})</span>
                  </div>
                  {showHiddenBots ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
                {showHiddenBots && (
                  <div className="space-y-0.5 mt-1">
                    {hiddenBots.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => onSelectBot(b.id)}
                        className="w-full flex items-center gap-2 px-2.5 py-1 rounded-lg text-zinc-500 hover:text-zinc-300 text-left transition"
                      >
                        <BotAvatarBadge avatar={b.avatar} size="sm" />
                        <span className="text-xs truncate">{b.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          /* Collapsed View: Just bot avatars */
          <div className="space-y-2 py-1 flex flex-col items-center">
            {bots.map((b) => {
              const isSelected = activeBotId === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => onSelectBot(b.id)}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm transition relative group ${
                    isSelected 
                      ? 'bg-white/15 text-white border border-white/20 shadow-xs' 
                      : 'hover:bg-white/[0.06] text-zinc-400 hover:text-white border border-transparent'
                  }`}
                  title={`${b.name} (${b.role_tag})`}
                >
                  <span>{b.avatar}</span>
                  {isSelected && (
                    <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-4 bg-white rounded-r-full" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* The Four Cs Navigation Pill Stack */}
      <div className="p-2 border-t border-white/[0.06] bg-[#050507] space-y-0.5">
        <button
          onClick={onOpenConnectionsModal}
          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200 transition ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title="Connections & Plugins (Gmail, Calendar, Slack)"
        >
          <Webhook className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          {!isCollapsed && <span>Connections & Plugins</span>}
        </button>

        <button
          onClick={onOpenRoutinesModal}
          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200 transition ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title="Routines & Cadence (Scheduled Cron & Webhooks)"
        >
          <CalendarClock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          {!isCollapsed && <span>Routines & Cadence</span>}
        </button>

        <button
          onClick={onOpenMemoryModal}
          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200 transition ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title="Context & Memory (Global & Bot Directives)"
        >
          <BrainCircuit className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          {!isCollapsed && <span>Context & Memory</span>}
        </button>

        <button
          onClick={onOpenSkillsModal}
          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200 transition ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title="Capabilities & Skills (Slash commands & Teach a Task)"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          {!isCollapsed && <span>Capabilities & Skills</span>}
        </button>

        <button
          onClick={onOpenSettingsModal}
          className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200 transition ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title="AI Providers, MCP & Sandbox Settings"
        >
          <Settings className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          {!isCollapsed && <span>AI Models & Settings</span>}
        </button>
      </div>

      {/* Weekly Usage Meter */}
      {!isCollapsed && (
        <div className="px-3 py-2 border-t border-white/[0.06] bg-black/40">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-cyan-400" />
              <span>Weekly Usage</span>
            </span>
            <span className="text-[10px] text-zinc-400 font-mono">
              {usagePercent}% used
            </span>
          </div>
          <div className="w-full bg-zinc-800/80 h-1.5 rounded-full mt-1.5 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-300 ${
                usagePercent >= 90 ? 'bg-amber-400' : 'bg-gradient-to-r from-cyan-500 to-cyan-400'
              }`} 
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          <p className="text-[10px] text-zinc-500 mt-1 font-mono">Resets every 7 days</p>
        </div>
      )}

      {/* Cloud VM Status Pill */}
      {!isCollapsed && (
        <div className="px-3 py-2 border-t border-white/[0.06] bg-[#050507] flex items-center gap-2 text-[10px] text-zinc-400 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)] animate-pulse" />
          <span>Cloud VM: Online · US-East Active</span>
        </div>
      )}
    </aside>
  );
};
