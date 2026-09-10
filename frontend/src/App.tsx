import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { TaskIntake } from './components/TaskIntake';
import { PlanView } from './components/PlanView';
import { ActivityFeed } from './components/ActivityFeed';
import { ArtifactPanel } from './components/ArtifactPanel';
import { MemoryManager } from './components/MemoryManager';
import { ScheduleManager } from './components/ScheduleManager';
import { BridgeManager } from './components/BridgeManager';
import { AuditViewer } from './components/AuditViewer';
import type { Session, ActivityEvent } from './types';
import { api } from './services/api';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState('workspace');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const loadSessions = async () => {
    try {
      const data = await api.listSessions();
      setSessions(data);
      if (data.length > 0 && !activeSession) {
        setActiveSession(data[0]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  // WebSocket Live Streaming for Active Session
  useEffect(() => {
    if (!activeSession) return;

    if (wsRef.current) {
      wsRef.current.close();
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/v1/sessions/${activeSession.id}/stream`;
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          const event: ActivityEvent = JSON.parse(evt.data);
          setEvents((prev) => [...prev, event]);

          // Refresh session on key milestones
          if (['artifact_created', 'approval_required', 'plan_revised', 'done', 'error'].includes(event.event_type)) {
            api.getSession(activeSession.id).then(setActiveSession);
            api.listSessions().then(setSessions);
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
  }, [activeSession?.id]);

  const handleCreateSession = async (task: string) => {
    setIsLoading(true);
    try {
      const newSession = await api.createSession(task);
      setSessions([newSession, ...sessions]);
      setActiveSession(newSession);
      setEvents([]);
      setCurrentTab('workspace');
    } catch (err) {
      alert('Failed to generate execution plan.');
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
    setEvents([]);
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
        {currentTab === 'bridge' && <BridgeManager />}
        {currentTab === 'audit' && <AuditViewer />}

        {currentTab === 'workspace' && (
          <div className="p-6 max-w-6xl mx-auto w-full">
            {!activeSession ? (
              <TaskIntake
                onSubmitTask={handleCreateSession}
                isLoading={isLoading}
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
    </div>
  );
};
export default App;
