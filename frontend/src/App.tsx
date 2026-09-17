import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, X } from 'lucide-react';
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
import type { Session, ActivityEvent } from './types';
import { api } from './services/api';
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

  useEffect(() => { api.listProviderAccounts().then(setProviderAccounts).catch(() => setProviderAccounts([])); }, [currentTab]);

  // WebSocket Live Streaming for Active Session
  useEffect(() => {
    if (!activeSessionId) return;

    api.getSessionEvents(activeSessionId).then(setEvents).catch(console.error);
    api.getSessionUsage(activeSessionId).then(setUsage).catch(console.error);

    if (wsRef.current) {
      wsRef.current.close();
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/v1/sessions/${activeSessionId}/stream`;
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          const event: ActivityEvent = JSON.parse(evt.data);
          setEvents((prev) => [...prev, event]);

          // Refresh session on key milestones
          if (['artifact_created', 'approval_required', 'plan_revised', 'done', 'error'].includes(event.event_type)) {
            api.getSession(activeSessionId).then(setActiveSession).catch(console.error);
            api.listSessions().then(setSessions).catch(console.error);
            api.getSessionUsage(activeSessionId).then(setUsage).catch(console.error);
          }
        } catch (e) {
          console.error(e);
        }
      };

      ws.onerror = () => {
        // Fallback or retry
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

  const handleCreateSession = async (task: string, files: File[] = [], providerAccountId?: string) => {
    setIsLoading(true);
    try {
      const newSession = await api.createSession(task, 'default', providerAccountId);
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
    <div className="flex h-screen bg-[#0d1117] text-[#e6edf3] font-sans antialiased overflow-hidden">
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
      <main className="flex-1 flex flex-col h-screen overflow-y-auto">
        {currentTab === 'memory' && <MemoryManager />}
        {currentTab === 'schedules' && (
          <ScheduleManager onSessionCreated={handleSelectSession} />
        )}
        {currentTab === 'bridge' && <BridgeManager activeSessionId={activeSession?.id} />}
        {currentTab === 'audit' && <AuditViewer />}
        {currentTab === 'settings' && <ProviderSettings />}

        {currentTab === 'workspace' && (
          <div className="p-6 max-w-6xl mx-auto w-full">
            {!activeSession ? (
              <TaskIntake
                onSubmitTask={handleCreateSession}
                isLoading={isLoading}
                providerAccounts={providerAccounts}
              />
            ) : (
              <div className="space-y-6">
                {/* Active Session Task Banner */}
                <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex items-center justify-between shadow-md">
                  <div className="min-w-0 pr-4">
                    <div className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">
                      Active Workstream
                    </div>
                    <h2 className="text-base font-bold text-white truncate mt-0.5">
                      {activeSession.task}
                    </h2>
                  </div>
                  <button
                    onClick={() => setActiveSession(null)}
                    className="text-xs text-gray-400 hover:text-white bg-[#21262d] px-3 py-1.5 rounded-lg border border-[#30363d] transition shrink-0"
                  >
                    Start New Task
                  </button>
                </div>

                {/* Plan View and Live Activity Feed */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

                  <ActivityFeed
                    events={events}
                    sessionStatus={activeSession.status}
                    pendingApproval={activeSession.pending_approval}
                    onPause={handlePause}
                    onResume={handleResume}
                    onCancel={handleCancel}
                    onResolveApproval={handleResolveApproval}
                  />
                </div>

                {usage && (
                  <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div><div className="text-gray-500 uppercase text-[10px]">Tool calls</div><div className="text-white font-semibold">{usage.tool_calls} / {usage.tool_call_limit}</div></div>
                    <div><div className="text-gray-500 uppercase text-[10px]">Steps</div><div className="text-white font-semibold">{usage.steps_completed} / {usage.step_limit}</div></div>
                    <div><div className="text-gray-500 uppercase text-[10px]">Estimated cost</div><div className="text-white font-semibold">${usage.estimated_cost_usd.toFixed(4)}</div></div>
                    <div><div className="text-gray-500 uppercase text-[10px]">Runtime cap</div><div className="text-white font-semibold">{usage.runtime_limit_seconds}s</div></div>
                  </div>
                )}

                {/* Delivered Artifacts */}
                <ArtifactPanel
                  artifacts={activeSession.artifacts}
                  sessionId={activeSession.id}
                />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Non-blocking Floating Notification Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center space-x-3 bg-red-950/95 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span className="text-xs font-medium">{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-red-400 hover:text-white ml-2 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
export default App;
