import React, { useState, useEffect } from 'react';
import { 
  CalendarClock, 
  Play, 
  Trash2, 
  Plus, 
  Clock, 
  ShieldAlert
} from 'lucide-react';
import type { Schedule } from '../types';
import { api } from '../services/api';

interface ScheduleManagerProps {
  onSessionCreated: (sessionId: string) => void;
}

export const ScheduleManager: React.FC<ScheduleManagerProps> = ({ onSessionCreated }) => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [taskTemplate, setTaskTemplate] = useState('');
  const [cron, setCron] = useState('0 9 * * 1'); // Every Monday at 9am
  const [grantedDomains, setGrantedDomains] = useState('');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    api.listSchedules().then((items) => {
      if (!ignore) setSchedules(items);
    }).catch(console.error);
    return () => { ignore = true; };
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !taskTemplate.trim()) return;
    const item = await api.createSchedule(
      title.trim(),
      taskTemplate.trim(),
      cron,
      grantedDomains.split(',').map((domain) => domain.trim().toLowerCase()).filter(Boolean),
    );
    setSchedules([...schedules, item]);
    setTitle('');
    setTaskTemplate('');
    setGrantedDomains('');
    setShowCreateModal(false);
  };

  const handleTrigger = async (id: string) => {
    try {
      setErrorMessage(null);
      const session = await api.triggerSchedule(id);
      onSessionCreated(session.id);
    } catch (err) {
      console.error('Failed to trigger schedule:', err);
      setErrorMessage('Failed to trigger schedule. Please check backend service status.');
      setTimeout(() => setErrorMessage(null), 4000);
    }
  };

  const handleDelete = async (id: string) => {
    await api.deleteSchedule(id);
    setSchedules(schedules.filter(s => s.id !== id));
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      <div className="flex flex-wrap items-center justify-between pb-6 border-b border-white/[0.08] mb-6 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Automated Scheduled Jobs</h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1 max-w-xl">
            Automate recurring workflows on a cron schedule. Jobs regenerate plans dynamically against updated data, 
            and always enforce approval gates for consequential operations.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 bg-white text-black hover:bg-zinc-200 text-xs font-semibold px-3.5 py-2 rounded-xl transition shadow"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>New Schedule</span>
        </button>
      </div>

      {errorMessage && (
        <div className="mb-4 p-3 bg-rose-950/30 border border-rose-500/40 rounded-xl text-xs text-rose-300">
          {errorMessage}
        </div>
      )}

      <div className="space-y-2.5">
        {schedules.length === 0 ? (
          <div className="text-center py-12 bg-[#09090c] rounded-2xl border border-white/[0.08] text-xs text-zinc-600 italic">
            No scheduled jobs created yet. Turn any completed task into a recurring automation.
          </div>
        ) : (
          schedules.map((sched) => (
            <div
              key={sched.id}
              className="bg-[#09090c] border border-white/[0.08] hover:border-white/[0.18] p-4 rounded-2xl transition flex items-center justify-between group shadow-sm"
            >
              <div className="space-y-1.5 pr-4">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-white group-hover:text-amber-300 transition">
                    {sched.title}
                  </h4>
                  <span className="text-[10px] font-mono bg-white/[0.05] text-amber-400 px-2 py-0.5 rounded-full border border-white/[0.08]">
                    cron: {sched.cron_expression}
                  </span>
                </div>
                <p className="text-xs text-zinc-300 font-mono text-[11px] truncate max-w-lg">
                  {sched.task_template}
                </p>
                <div className="flex items-center gap-3 text-[10px] text-zinc-500 font-mono pt-1">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>Next: {sched.next_run_at ? new Date(sched.next_run_at).toLocaleDateString() : 'Pending'}</span>
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1 text-emerald-400">
                    <ShieldAlert className="w-3 h-3" />
                    <span>Approval Gates Active</span>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleTrigger(sched.id)}
                  className="inline-flex items-center gap-1.5 bg-white text-black hover:bg-zinc-200 text-xs font-semibold py-1.5 px-3 rounded-lg shadow-sm transition"
                  title="Run now"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Run Now</span>
                </button>
                <button
                  onClick={() => handleDelete(sched.id)}
                  className="text-zinc-500 hover:text-rose-400 p-1.5 rounded-lg transition"
                  title="Delete schedule"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0e0e12] border border-white/[0.12] rounded-2xl max-w-md w-full p-5 shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-3">Create Recurring Automation</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Schedule Name</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Weekly Support Digest"
                  className="w-full bg-[#16161b] border border-white/[0.1] rounded-lg p-2 text-xs text-white focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Cron Expression / Cadence</label>
                <select
                  value={cron}
                  onChange={(e) => setCron(e.target.value)}
                  className="w-full bg-[#16161b] border border-white/[0.1] rounded-lg p-2 text-xs text-white focus:outline-none"
                >
                  <option value="0 9 * * 1">Every Monday at 9:00 AM (0 9 * * 1)</option>
                  <option value="0 17 * * 5">Every Friday at 5:00 PM (0 17 * * 5)</option>
                  <option value="0 8 * * *">Daily at 8:00 AM (0 8 * * *)</option>
                  <option value="0 0 1 * *">Monthly on the 1st (0 0 1 * *)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Task Prompt Template</label>
                <textarea
                  value={taskTemplate}
                  onChange={(e) => setTaskTemplate(e.target.value)}
                  placeholder="Task instruction for each run (e.g. 'Compile tickets from past 7 days into an executive spreadsheet and draft notification email')"
                  rows={3}
                  className="w-full bg-[#16161b] border border-white/[0.1] rounded-lg p-2 text-xs text-white resize-none focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Granted Web Domains (comma-separated)</label>
                <input
                  type="text"
                  value={grantedDomains}
                  onChange={(e) => setGrantedDomains(e.target.value)}
                  placeholder="support.example.com, docs.example.com"
                  className="w-full bg-[#16161b] border border-white/[0.1] rounded-lg p-2 text-xs text-white font-mono focus:outline-none"
                />
                <p className="text-[10px] text-zinc-500 mt-1">Web requests on scheduled runs will be restricted to these approved domains.</p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="text-xs text-zinc-400 hover:text-white px-3 py-1.5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-white text-black hover:bg-zinc-200 text-xs font-semibold px-4 py-1.5 rounded-lg transition"
                >
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
