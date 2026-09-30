import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { AnyWorkChat } from './components/AnyWorkChat';
import { AgentComputerPanel } from './components/AgentComputerPanel';
import { BotModal } from './components/BotModal';
import { ChannelModal } from './components/ChannelModal';
import { MemoryManager } from './components/MemoryManager';
import { ScheduleManager } from './components/ScheduleManager';
import { BridgeManager } from './components/BridgeManager';
import { AuditViewer } from './components/AuditViewer';
import { ProviderSettings } from './components/ProviderSettings';
import { SkillsManager } from './components/SkillsManager';
import type { Session, ActivityEvent, Bot, Channel, BotCreate, BotUpdate, ChannelCreate } from './types';
import { api, getBackendBaseUrl } from './services/api';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState('workspace');
  const [bots, setBots] = useState<Bot[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeBotId, setActiveBotId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [isComputerOpen, setIsComputerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [botModalOpen, setBotModalOpen] = useState(false);
  const [editingBot, setEditingBot] = useState<Bot | null>(null);
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const refreshTimerRef = useRef<any>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 5000);
  };

  // Load Bots and Channels on startup
  const loadBotsAndChannels = async () => {
    try {
      const [fetchedBots, fetchedChannels] = await Promise.all([
        api.listBots(),
        api.listChannels()
      ]);
      setBots(fetchedBots);
      setChannels(fetchedChannels);
      if (fetchedBots.length > 0 && !activeBotId && !activeChannelId) {
        setActiveBotId(fetchedBots[0].id);
      }
    } catch (err) {
      console.error('Failed to load bots or channels:', err);
    }
  };

  useEffect(() => {
    loadBotsAndChannels();
    api.listSessions().then((data) => {
      setSessions(data);
      if (data.length > 0 && !activeSession) {
        setActiveSession(data[0]);
      }
    }).catch(console.error);
  }, []);

  const activeBot = bots.find((b) => b.id === activeBotId) || null;
  const activeChannel = channels.find((c) => c.id === activeChannelId) || null;
  const activeSessionId = activeSession?.id;

  // Stream events for active session
  useEffect(() => {
    if (!activeSessionId) return;

    api.getSessionEvents(activeSessionId).then(setEvents).catch(console.error);

    if (wsRef.current) {
      wsRef.current.close();
    }

    const backendBase = getBackendBaseUrl();
    let wsHost = window.location.host;
    let proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    if (backendBase) {
      try {
        const u = new URL(backendBase);
        wsHost = u.host;
        proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
      } catch {}
    }
    const wsUrl = `${proto}//${wsHost}/v1/sessions/${activeSessionId}/stream`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          const event: ActivityEvent = JSON.parse(evt.data);
          setEvents((prev) => [...prev, event]);

          if (['artifact_created', 'approval_required', 'plan_revised', 'done', 'error'].includes(event.event_type)) {
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = setTimeout(() => {
              api.getSession(activeSessionId).then(setActiveSession).catch(console.error);
              api.listSessions().then(setSessions).catch(console.error);
            }, 200);
          }
        } catch (e) {
          console.error(e);
        }
      };
    } catch (err) {
      console.error(err);
    }

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [activeSessionId]);

  // Sending message in AnyWork chat
  const handleSendMessage = async (text: string) => {
    setIsLoading(true);
    try {
      // Create session tagged with active bot or channel
      const newSession = await api.createSession(
        text,
        'default',
        undefined,
        false
      );
      setSessions((prev) => [newSession, ...prev]);
      setActiveSession(newSession);
      setEvents([]);

      // Start autonomous execution
      await api.startSession(newSession.id);
      const updated = await api.getSession(newSession.id);
      setActiveSession(updated);
    } catch (err) {
      console.error('Failed to send message:', err);
      showToast('Failed to start agent task. Check connection.');
    } finally {
      setIsLoading(false);
    }
  };

  // Bot Management Handlers
  const handleSaveBot = async (data: BotCreate | BotUpdate) => {
    if (editingBot) {
      await api.updateBot(editingBot.id, data as BotUpdate);
      showToast(`Updated @${editingBot.name}`);
    } else {
      const created = await api.createBot(data as BotCreate);
      setActiveBotId(created.id);
      showToast(`Created @${created.name}`);
    }
    await loadBotsAndChannels();
    setEditingBot(null);
  };

  const handleDuplicateBot = async (botId: string) => {
    try {
      const dup = await api.duplicateBot(botId);
      await loadBotsAndChannels();
      setActiveBotId(dup.id);
      showToast(`Duplicated bot as @${dup.name}`);
      setBotModalOpen(false);
    } catch (err) {
      console.error(err);
      showToast('Failed to duplicate bot.');
    }
  };

  const handleDeleteBot = async (botId: string) => {
    try {
      await api.deleteBot(botId);
      await loadBotsAndChannels();
      setActiveBotId(bots[0]?.id || null);
      showToast('Bot deleted.');
      setBotModalOpen(false);
    } catch (err) {
      console.error(err);
      showToast('Failed to delete bot.');
    }
  };

  const handleExportTemplate = async () => {
    if (!activeBot) return;
    try {
      const template = await api.exportBotTemplate(activeBot.id);
      const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeBot.name.toLowerCase()}_template.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported template for @${activeBot.name}`);
    } catch (err) {
      console.error(err);
      showToast('Failed to export bot template.');
    }
  };

  const handleCreateChannel = async (data: ChannelCreate) => {
    try {
      const created = await api.createChannel(data);
      await loadBotsAndChannels();
      setActiveChannelId(created.id);
      setActiveBotId(null);
      showToast(`Created channel #${created.name}`);
    } catch (err) {
      console.error(err);
      showToast('Failed to create channel.');
    }
  };

  const handleResolveApproval = async (
    decision: 'approved' | 'denied',
    feedback?: string,
    alwaysAllowCategory = false
  ) => {
    if (!activeSession || !activeSession.pending_approval) return;
    await api.resolveApproval(
      activeSession.pending_approval.id,
      decision,
      feedback,
      alwaysAllowCategory
    );
    const updated = await api.getSession(activeSession.id);
    setActiveSession(updated);
    api.listSessions().then(setSessions);
  };

  return (
    <div className="anywork-shell flex h-screen bg-black text-zinc-100 font-sans antialiased overflow-hidden select-none">
      {/* Sidebar */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        sessions={sessions}
        activeSessionId={activeSession?.id || null}
        onSelectSession={async (id) => {
          const s = await api.getSession(id);
          setActiveSession(s);
          setEvents(await api.getSessionEvents(id));
          setCurrentTab('workspace');
        }}
        onNewSession={() => {
          setActiveSession(null);
          setEvents([]);
          setCurrentTab('workspace');
        }}
        bots={bots}
        activeBotId={activeBotId}
        onSelectBot={(id) => {
          setActiveBotId(id);
          setActiveChannelId(null);
          setCurrentTab('workspace');
        }}
        onOpenNewBotModal={() => {
          setEditingBot(null);
          setBotModalOpen(true);
        }}
        channels={channels}
        activeChannelId={activeChannelId}
        onSelectChannel={(id) => {
          setActiveChannelId(id);
          setActiveBotId(null);
          setCurrentTab('workspace');
        }}
        onOpenNewChannelModal={() => setChannelModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden bg-[#09090c]">
        {currentTab === 'skills' && (
          <div className="flex-1 overflow-y-auto p-6">
            <SkillsManager onSessionCreated={async (id) => {
              setActiveSession(await api.getSession(id));
              setCurrentTab('workspace');
            }} />
          </div>
        )}
        {currentTab === 'memory' && (
          <div className="flex-1 overflow-y-auto p-6">
            <MemoryManager />
          </div>
        )}
        {currentTab === 'schedules' && (
          <div className="flex-1 overflow-y-auto p-6">
            <ScheduleManager onSessionCreated={async (id) => {
              setActiveSession(await api.getSession(id));
              setCurrentTab('workspace');
            }} />
          </div>
        )}
        {currentTab === 'bridge' && (
          <div className="flex-1 overflow-y-auto p-6">
            <BridgeManager activeSessionId={activeSession?.id} />
          </div>
        )}
        {currentTab === 'audit' && (
          <div className="flex-1 overflow-y-auto p-6">
            <AuditViewer />
          </div>
        )}
        {currentTab === 'settings' && (
          <div className="flex-1 overflow-y-auto p-6">
            <ProviderSettings />
          </div>
        )}

        {/* Workspace Central View (AnyWork Chat + Split-pane Agent Computer) */}
        {currentTab === 'workspace' && (
          <div className="flex-1 flex h-full overflow-hidden">
            <AnyWorkChat
              activeBot={activeBot}
              activeChannel={activeChannel}
              activeSession={activeSession}
              events={events}
              artifacts={activeSession?.artifacts || []}
              pendingApproval={activeSession?.pending_approval}
              onSendMessage={handleSendMessage}
              onToggleComputer={() => setIsComputerOpen(!isComputerOpen)}
              isComputerOpen={isComputerOpen}
              onOpenBotSettings={() => {
                setEditingBot(activeBot);
                setBotModalOpen(true);
              }}
              onExportTemplate={handleExportTemplate}
              onResolveApproval={handleResolveApproval}
              isLoading={isLoading}
              bots={bots}
            />

            {/* Split-pane Agent Computer */}
            <AgentComputerPanel
              isOpen={isComputerOpen}
              onClose={() => setIsComputerOpen(false)}
              botName={activeBot ? activeBot.name : 'assistant'}
              artifacts={activeSession?.artifacts || []}
              activeSessionId={activeSession?.id}
              onTakeover={() => showToast('Human Takeover active. Control browser credentials.')}
            />
          </div>
        )}
      </main>

      {/* Bot Modal */}
      <BotModal
        isOpen={botModalOpen}
        onClose={() => {
          setBotModalOpen(false);
          setEditingBot(null);
        }}
        bot={editingBot}
        onSave={handleSaveBot}
        onDuplicate={handleDuplicateBot}
        onDelete={handleDeleteBot}
        onExportTemplate={async (id) => {
          const b = bots.find(x => x.id === id);
          if (b) {
            setActiveBotId(id);
            await handleExportTemplate();
          }
        }}
      />

      {/* Channel Modal */}
      <ChannelModal
        isOpen={channelModalOpen}
        onClose={() => setChannelModalOpen(false)}
        bots={bots}
        onCreateChannel={handleCreateChannel}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-[#121216] border border-cyan-500/40 text-cyan-200 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-md animate-fadeIn">
          <AlertCircle className="w-5 h-5 text-cyan-400 shrink-0" />
          <span className="text-xs font-medium">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-zinc-400 hover:text-white ml-2 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
