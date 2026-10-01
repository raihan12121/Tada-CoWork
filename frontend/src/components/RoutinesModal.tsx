import React, { useState, useEffect } from 'react';
import { 
  X, 
  Plus, 
  CalendarClock, 
  Webhook, 
  Play, 
  CheckCircle2, 
  Copy, 
  Clock,
  RotateCw
} from 'lucide-react';
import type { Bot } from '../types';
import { api, getBackendBaseUrl } from '../services/api';

interface Routine {
  id: string;
  bot_id: string;
  title: string;
  type: 'scheduled' | 'event';
  cadence: string;
  cron?: string;
  webhook_url?: string;
  is_active: boolean;
  last_status?: string;
  last_run?: string;
}

interface RoutinesModalProps {
  isOpen: boolean;
  onClose: () => void;
  bots: Bot[];
  initialBotId?: string | null;
  onSessionTriggered?: (sessionId: string) => void;
}

export const RoutinesModal: React.FC<RoutinesModalProps> = ({
  isOpen,
  onClose,
  bots,
  initialBotId,
  onSessionTriggered
}) => {
  const [selectedBotId, setSelectedBotId] = useState<string>(initialBotId || 'all');
  const [activeTab, setActiveTab] = useState<'routines' | 'webhooks' | 'history'>('routines');
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // New Routine Form State
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBotId, setNewBotId] = useState<string>(bots[0]?.id || '');
  const [newType, setNewType] = useState<'scheduled' | 'event'>('scheduled');
  const [newCadence, setNewCadence] = useState('Every day at 9:00 AM');
  const [newCron, setNewCron] = useState('0 9 * * *');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!isOpen) return;

    const loadAllRoutines = async () => {
      setIsLoading(true);
      try {
        let all: Routine[] = [];
        for (const b of bots) {
          try {
            const botRoutines = await api.getBotRoutines(b.id);
            all = [...all, ...botRoutines.map(r => ({ ...r, bot_id: b.id }))];
          } catch {}
        }
        try {
          const backendSchedules = await api.listSchedules();
          const mappedSchedules: Routine[] = backendSchedules.map((s) => ({
            id: s.id,
            bot_id: bots[0]?.id || 'all',
            title: s.title,
            type: 'scheduled',
            cadence: `Cron: ${s.cron_expression}`,
            cron: s.cron_expression,
            is_active: s.is_active,
            last_status: s.last_status || 'scheduled',
            last_run: s.last_run_at || 'Never'
          }));
          all = [...mappedSchedules, ...all];
        } catch {}

        setRoutines(all);
      } catch (err) {
        console.error('Failed to load routines:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadAllRoutines();
  }, [isOpen, bots]);

  if (!isOpen) return null;

  const filteredRoutines = routines.filter((r) => 
    selectedBotId === 'all' ? true : r.bot_id === selectedBotId
  );

  const handleToggleRoutine = (id: string) => {
    setRoutines((prev) =>
      prev.map((r) => (r.id === id ? { ...r, is_active: !r.is_active } : r))
    );
    showToast('Routine state updated.');
  };

  const handleRunNow = async (routine: Routine) => {
    try {
      showToast(`Triggering routine "${routine.title}"...`);
      const bot = bots.find((b) => b.id === routine.bot_id);
      const res = await api.createSession(
        `[Routine Cadence Triggered] ${routine.title}`,
        'default',
        undefined,
        false
      );
      await api.startSession(res.id);
      showToast(`Started autonomous run for @${bot?.name || 'bot'}`);
      if (onSessionTriggered) {
        onSessionTriggered(res.id);
        onClose();
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to trigger routine.');
    }
  };

  const handleTestWebhook = async (botId: string) => {
    try {
      const payload = {
        event: 'order.created',
        order_id: 'ord_98765',
        amount: 249.0,
        customer_email: 'sarah.connor@cyberdyne.io'
      };
      const res = await api.triggerBotWebhook(botId, payload);
      showToast(`Webhook accepted! Started session #${res.session_id.slice(0, 8)}`);
      if (onSessionTriggered) {
        onSessionTriggered(res.session_id);
        onClose();
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to trigger test webhook.');
    }
  };

  const handleCreateRoutine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      await api.createSchedule(
        newTitle.trim(),
        `Execute routine: ${newTitle.trim()}`,
        newType === 'scheduled' ? newCron : '* * * * *'
      );

      const newR: Routine = {
        id: `routine_${Date.now()}`,
        bot_id: newBotId,
        title: newTitle.trim(),
        type: newType,
        cadence: newType === 'scheduled' ? newCadence : 'Real-time Event Trigger',
        cron: newType === 'scheduled' ? newCron : undefined,
        is_active: true,
        last_status: 'scheduled',
        last_run: 'Pending'
      };

      setRoutines([newR, ...routines]);
      setIsCreating(false);
      setNewTitle('');
      showToast(`Scheduled routine "${newR.title}" created.`);
    } catch (err) {
      console.error(err);
      showToast('Failed to persist schedule to database.');
    }
  };

  const backendBase = getBackendBaseUrl() || 'http://localhost:8000';

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xl flex items-center justify-center p-4 select-none animate-springEnter">
      <div className="bg-[#0c0c10] border border-white/[0.12] rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-[0_32px_96px_rgba(0,0,0,0.95)] overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-white/[0.08] flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-b from-white/15 to-white/5 border border-white/10 flex items-center justify-center text-white shadow-xs">
              <CalendarClock className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-tight">Routines & Cadence</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Autonomous background scheduling, scheduled cron jobs, and inbound event webhooks.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.06] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Segmented Tabs & Bot Filter */}
        <div className="px-5 py-3 border-b border-white/[0.06] bg-black/20 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex bg-[#14141a] p-1 rounded-xl border border-white/[0.06] gap-1">
            <button
              onClick={() => setActiveTab('routines')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition duration-150 ${
                activeTab === 'routines'
                  ? 'bg-white/[0.14] text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Scheduled Routines ({routines.length})
            </button>
            <button
              onClick={() => setActiveTab('webhooks')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition duration-150 ${
                activeTab === 'webhooks'
                  ? 'bg-white/[0.14] text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Inbound Webhooks
            </button>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedBotId}
              onChange={(e) => setSelectedBotId(e.target.value)}
              className="bg-[#14141a] border border-white/[0.08] text-xs text-zinc-200 rounded-xl px-2.5 py-1.5 focus:outline-none"
            >
              <option value="all">All Specialists</option>
              {bots.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.avatar} @{b.name}
                </option>
              ))}
            </select>

            <button
              onClick={() => setIsCreating(true)}
              className="btn-primary text-xs"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>New Routine</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 select-text">
          {toast && (
            <div className="mb-4 px-4 py-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>{toast}</span>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center p-12 text-zinc-500 text-xs">
              <RotateCw className="w-4 h-4 animate-spin mr-2" />
              <span>Loading routines and schedules...</span>
            </div>
          ) : activeTab === 'routines' ? (
            filteredRoutines.length === 0 ? (
              <div className="text-center py-12">
                <CalendarClock className="w-10 h-10 text-zinc-600 mx-auto mb-2 opacity-50" />
                <p className="text-xs text-zinc-400">No scheduled routines found for this filter.</p>
                <button
                  onClick={() => setIsCreating(true)}
                  className="mt-3 text-xs text-cyan-400 hover:underline font-medium"
                >
                  Create your first automated routine
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredRoutines.map((routine) => {
                  const bot = bots.find((b) => b.id === routine.bot_id);
                  return (
                    <div
                      key={routine.id}
                      className="bg-[#111116] border border-white/[0.07] hover:border-white/[0.12] rounded-xl p-3.5 flex items-center justify-between transition group shadow-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-b from-white/10 to-white/5 border border-white/10 flex items-center justify-center shrink-0">
                          {routine.type === 'scheduled' ? (
                            <Clock className="w-4 h-4 text-blue-400" />
                          ) : (
                            <Webhook className="w-4 h-4 text-indigo-400" />
                          )}
                        </div>

                        <div className="truncate">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-semibold text-white tracking-tight">{routine.title}</h4>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              routine.is_active ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]' : 'bg-zinc-600'
                            }`} />
                          </div>

                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-zinc-400">
                            <span>{routine.cadence}</span>
                            <span>·</span>
                            <span className="text-zinc-500 font-mono">@{bot?.name || 'All'}</span>
                            {routine.cron && (
                              <>
                                <span>·</span>
                                <span className="font-mono text-[10px] bg-white/[0.05] px-1 rounded text-zinc-300">
                                  {routine.cron}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleRunNow(routine)}
                          className="flex items-center gap-1.5 bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 text-xs px-2.5 py-1 rounded-lg border border-white/[0.08] transition pressable"
                          title="Trigger immediate execution"
                        >
                          <Play className="w-3 h-3 text-cyan-400" />
                          <span>Run Now</span>
                        </button>

                        <button
                          onClick={() => handleToggleRoutine(routine.id)}
                          className={`w-10 h-5 flex items-center rounded-full p-0.5 transition ${
                            routine.is_active ? 'bg-emerald-500/80 justify-end' : 'bg-zinc-800 justify-start'
                          }`}
                        >
                          <span className="w-4 h-4 rounded-full bg-white shadow-md" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* Webhooks Tab */
            <div className="space-y-4">
              <p className="text-xs text-zinc-400 leading-relaxed">
                Send incoming POST payloads to trigger autonomous bot runs immediately. Each specialist bot has a dedicated webhook endpoint.
              </p>

              <div className="space-y-3">
                {bots.map((b) => {
                  const url = `${backendBase}/v1/bots/${b.id}/webhook`;
                  return (
                    <div key={b.id} className="p-3.5 rounded-xl bg-[#111116] border border-white/[0.07] space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{b.avatar}</span>
                          <span className="text-xs font-semibold text-white">@{b.name} Webhook Target</span>
                        </div>
                        <button
                          onClick={() => handleTestWebhook(b.id)}
                          className="text-xs text-cyan-400 hover:text-cyan-300 font-medium"
                        >
                          Send Test Event
                        </button>
                      </div>

                      <div className="flex items-center gap-2 bg-black/60 border border-white/[0.08] p-2 rounded-lg text-xs font-mono text-zinc-300">
                        <span className="text-emerald-400 font-bold">POST</span>
                        <span className="truncate flex-1">{url}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(url);
                            showToast('Copied webhook URL to clipboard');
                          }}
                          className="text-zinc-400 hover:text-white p-1"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Routine Dialog */}
      {isCreating && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-springEnter">
          <form onSubmit={handleCreateRoutine} className="bg-[#0f0f14] border border-white/[0.12] rounded-2xl w-full max-w-md p-5 shadow-[0_24px_64px_rgba(0,0,0,0.9)] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <h3 className="text-xs font-semibold text-white">Create New Scheduled Routine</h3>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="text-zinc-500 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Routine Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Daily 9AM Slack Digest & Inbox Summary"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-[#14141a] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Trigger Type</label>
                <select
                  value={newType}
                  onChange={(e: any) => setNewType(e.target.value)}
                  className="w-full bg-[#14141a] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                >
                  <option value="scheduled">Scheduled Time / Cron</option>
                  <option value="event">Real-time Inbound Event</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Assigned Specialist Bot</label>
                <select
                  value={newBotId}
                  onChange={(e) => setNewBotId(e.target.value)}
                  className="w-full bg-[#14141a] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                >
                  {bots.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.avatar} {b.name} ({b.role_tag})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Cadence / Cron Schedule</label>
                <input
                  type="text"
                  value={newCron}
                  onChange={(e) => {
                    setNewCron(e.target.value);
                    setNewCadence(`Cron: ${e.target.value}`);
                  }}
                  placeholder="0 9 * * *"
                  className="w-full bg-[#14141a] border border-white/[0.1] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
                />
                <span className="text-[10px] text-zinc-500 mt-1 block">Default: "0 9 * * *" (Every day at 9:00 AM)</span>
              </div>
            </div>

            <div className="pt-3 border-t border-white/[0.08] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg"
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary text-xs">
                Save Routine
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
