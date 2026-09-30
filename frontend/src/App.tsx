import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, X, Plus } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { TaskIntake } from './components/TaskIntake';
import { PlanView } from './components/PlanView';
import { ActivityFeed } from './components/ActivityFeed';
import { ArtifactPanel } from './components/ArtifactPanel';
import { MemoryManager } from './components/MemoryManager';
import { ScheduleManager } from './components/ScheduleManager';
import { BridgeManager } from './components/BridgeManager';
import { AuditViewer } from './components/AuditViewer';
import { ProviderSettings } from './components/ProviderSettings';
import { SkillsManager } from './components/SkillsManager';
import type { Session, ActivityEvent } from './types';
import { api, getBackendBaseUrl } from './services/api';
import type { ProviderAccount } from './services/api';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState('workspace');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [usage, setUsage] = useState<{ tool_calls: number; tool_call_limit: number; steps_completed: number; step_limit: number; estimated_cost_usd: number; runtime_limit_seconds: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [providerAccounts, setProviderAccounts] = useState<ProviderAccount[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const refreshTimerRef = useRef<any>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 5000);
  };

  const activeSessionId = activeSession?.id;

  useEffect(() => {
    let ignore = false;
    api.listSessions().then((data) => {
      if (!ignore) {
        setSessions(data);
        if (data.length > 0 && !activeSessionId) {
          setActiveSession(data[0]);
        }
      }
    }).catch(console.error);
    return () => {
      ignore = true;
    };
  }, [activeSessionId]);

  useEffect(() => { 
    api.listProviderAccounts().then(setProviderAccounts).catch(() => setProviderAccounts([])); 
  }, [currentTab]);

  // WebSocket Live Streaming for Active Session
  useEffect(() => {
    if (!activeSessionId) return;

    api.getSessionEvents(activeSessionId).then(setEvents).catch(console.error);
    api.getSessionUsage(activeSessionId).then(setUsage).catch(console.error);

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

          // Debounce refresh on key milestones to prevent HTTP storm
          if (['artifact_created', 'approval_required', 'plan_revised', 'done', 'error'].includes(event.event_type)) {
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = setTimeout(() => {
              api.getSession(activeSessionId).then(setActiveSession).catch(console.error);
              api.listSessions().then(setSessions).catch(console.error);
              api.getSessionUsage(activeSessionId).then(setUsage).catch(console.error);
            }, 200);
          }
        } catch (e) {
          console.error(e);
        }
      };

      ws.onerror = () => {
        // Handled gracefully
      };
    } catch (err) {
      console.error(err);
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [activeSessionId]);

  const handleCreateSession = async (task: string, files: File[] = [], providerAccountId?: string, allowProviderFailover = false) => {
    setIsLoading(true);
    try {
      const newSession = await api.createSession(task, 'default', providerAccountId, allowProviderFailover);
      for (const file of files) await api.uploadSessionInput(newSession.id, file);
      setSessions((prev) => [newSession, ...prev]);
      setActiveSession(newSession);
      setEvents([]);
      setCurrentTab('workspace');
    } catch (err) {
      console.error('Failed to generate plan:', err);
      showToast('Failed to generate execution plan. Please check backend connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartExecution = async () => {
    if (!activeSession) return;
    await api.startSession(activeSession.id);
    const updated = await api.getSession(activeSession.id);
    setActiveSession(updated);
    api.listSessions().then(setSessions);
  };

  const handlePause = async () => {
    if (!activeSession) return;
    await api.pauseSession(activeSession.id);
    const updated = await api.getSession(activeSession.id);
    setActiveSession(updated);
  };

  const handleResume = async () => {
    if (!activeSession) return;
    await api.resumeSession(activeSession.id);
    const updated = await api.getSession(activeSession.id);
    setActiveSession(updated);
  };

  const handleCancel = async () => {
    if (!activeSession) return;
    await api.cancelSession(activeSession.id);
    const updated = await api.getSession(activeSession.id);
    setActiveSession(updated);
    api.listSessions().then(setSessions);
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

  const handleSelectSession = async (id: string) => {
    const s = await api.getSession(id);
    setActiveSession(s);
    setEvents(await api.getSessionEvents(id));
    setUsage(await api.getSessionUsage(id));
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!activeSession) return;
    const plan = await api.editPlan(activeSession.id, { action: 'remove', step_id: stepId });
    setActiveSession({ ...activeSession, plan });
  };

  const handleAddStep = async (description: string, tool: string, risk_level: 'low' | 'medium' | 'high') => {
    if (!activeSession) return;
    const plan = await api.editPlan(activeSession.id, { action: 'add', description, tool, risk_level });
    setActiveSession({ ...activeSession, plan });
  };

  const handleReorderSteps = async (stepIds: string[]) => {
    if (!activeSession) return;
    const plan = await api.editPlan(activeSession.id, { action: 'reorder', ordered_step_ids: stepIds });
    setActiveSession({ ...activeSession, plan });
  };

  return (
    <div className="grok-shell flex h-screen bg-black text-zinc-100 font-sans antialiased overflow-hidden">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        sessions={sessions}
        activeSessionId={activeSession?.id || null}
        onSelectSession={handleSelectSession}
        onNewSession={() => {
          setActiveSession(null);
          setCurrentTab('workspace');
        }}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-y-auto bg-black">
        {currentTab === 'skills' && (
          <SkillsManager onSessionCreated={handleSelectSession} />
        )}
        {currentTab === 'memory' && <MemoryManager />}
        {currentTab === 'schedules' && (
          <ScheduleManager onSessionCreated={handleSelectSession} />
        )}
        {currentTab === 'bridge' && <BridgeManager activeSessionId={activeSession?.id} />}
        {currentTab === 'audit' && <AuditViewer />}
        {currentTab === 'settings' && <ProviderSettings />}

        {currentTab === 'workspace' && (
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 flex flex-col">
            {!activeSession ? (
              <TaskIntake
                onSubmitTask={handleCreateSession}
                isLoading={isLoading}
                providerAccounts={providerAccounts}
              />
            ) : (
              <div className="w-full flex-1 flex flex-col">
                {/* Active Task Topbar */}
                <div className="flex flex-wrap items-center justify-between pb-4 mb-5 border-b border-white/[0.08] gap-3">
                  <div className="min-w-0 pr-4">
                    <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 mb-1">
                      <span>Task #{activeSession.id.slice(0, 8)}</span>
                      <span>·</span>
                      <span className="capitalize text-zinc-300 font-semibold">{activeSession.status.replace('_', ' ')}</span>
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white truncate tracking-tight">
                      {activeSession.task}
                    </h1>
                  </div>
                  <button 
                    onClick={() => setActiveSession(null)} 
                    className="inline-flex items-center gap-1.5 bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-white text-xs font-semibold py-2 px-3.5 rounded-xl transition shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>New Task</span>
                  </button>
                </div>

                {/* Grok Dual-Pane Workspace */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start flex-1 pb-10">
                  {/* Left Column: Live Agent Activity Stream */}
                  <section className="lg:col-span-7 min-w-0">
                    <div className="flex items-center justify-between pb-2 mb-2 px-1">
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-semibold">
                          Live Agent Execution
                        </span>
                        <h2 className="text-sm font-bold text-white">Stream & Reasoning</h2>
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-xs font-mono text-cyan-400 bg-cyan-950/40 px-2.5 py-0.5 rounded-full border border-cyan-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                        <span>Live</span>
                      </span>
                    </div>
                    <ActivityFeed 
                      events={events} 
                      sessionStatus={activeSession.status} 
                      pendingApproval={activeSession.pending_approval} 
                      onPause={handlePause} 
                      onResume={handleResume} 
                      onCancel={handleCancel} 
                      onResolveApproval={handleResolveApproval} 
                    />
                  </section>

                  {/* Right Column: Execution Plan & Deliverables Inspector */}
                  <aside className="lg:col-span-5 min-w-0 flex flex-col gap-4">
                    {activeSession.plan && (
                      <PlanView 
                        plan={activeSession.plan} 
                        sessionStatus={activeSession.status} 
                        onStartExecution={handleStartExecution} 
                        onDeleteStep={handleDeleteStep} 
                        onAddStep={handleAddStep} 
                        onReorderSteps={handleReorderSteps} 
                      />
                    )}

                    {usage && (
                      <div className="bg-[#09090c] border border-white/[0.08] rounded-2xl p-4 shadow-xl">
                        <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-semibold mb-2">
                          Resource & Token Telemetry
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                          <div className="bg-black/40 border border-white/[0.04] p-2.5 rounded-xl">
                            <strong className="text-sm font-bold text-white font-mono">{usage.tool_calls}</strong>
                            <span className="text-[10px] text-zinc-500 block font-mono">Tool Calls</span>
                          </div>
                          <div className="bg-black/40 border border-white/[0.04] p-2.5 rounded-xl">
                            <strong className="text-sm font-bold text-white font-mono">{usage.steps_completed}</strong>
                            <span className="text-[10px] text-zinc-500 block font-mono">Steps Done</span>
                          </div>
                          <div className="bg-black/40 border border-white/[0.04] p-2.5 rounded-xl">
                            <strong className="text-sm font-bold text-cyan-400 font-mono">${usage.estimated_cost_usd.toFixed(4)}</strong>
                            <span className="text-[10px] text-zinc-500 block font-mono">Est. Cost</span>
                          </div>
                          <div className="bg-black/40 border border-white/[0.04] p-2.5 rounded-xl">
                            <strong className="text-sm font-bold text-zinc-300 font-mono">{usage.runtime_limit_seconds}s</strong>
                            <span className="text-[10px] text-zinc-500 block font-mono">Time Cap</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <ArtifactPanel artifacts={activeSession.artifacts} sessionId={activeSession.id} />
                  </aside>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Floating Notification Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-[#121216] border border-rose-500/40 text-rose-200 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-md animate-fadeIn">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <span className="text-xs font-medium">{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-zinc-400 hover:text-white ml-2 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
export default App;
