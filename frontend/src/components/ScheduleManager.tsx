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
      <div className="flex items-center justify-between pb-6 border-b border-[#30363d] mb-6">
        <div>
          <div className="flex items-center space-x-2">
            <CalendarClock className="w-6 h-6 text-amber-400" />
            <h2 className="text-xl font-bold text-white tracking-wide">Scheduled Recurring Tasks</h2>
          </div>
          <p className="text-xs text-gray-400 mt-1 max-w-xl">
            Automate recurring knowledge-work routines. Scheduled runs dynamically regenerate plans to adapt to updated source data,
            and always pause for approval before sending or irreversible operations.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
        >
          <Plus className="w-4 h-4" />
          <span>New Schedule</span>
        </button>
      </div>

      {errorMessage && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-500/40 rounded-xl text-xs text-red-300">
          {errorMessage}
        </div>
      )}

      <div className="space-y-3">
        {schedules.length === 0 ? (
          <div className="text-center py-12 bg-[#161b22] rounded-xl border border-[#30363d] text-xs text-gray-500 italic">
            No scheduled jobs created yet. Turn any completed task into a recurring automation.
          </div>
        ) : (
          schedules.map((sched) => (
            <div
              key={sched.id}
              className="bg-[#161b22] border border-[#30363d] hover:border-gray-500 p-4 rounded-xl transition flex items-center justify-between group"
            >
              <div className="space-y-1 pr-4">
                <div className="flex items-center space-x-2">
                  <h4 className="text-sm font-semibold text-white group-hover:text-amber-300 transition">
                    {sched.title}
                  </h4>
                  <span className="text-[10px] font-mono bg-[#0d1117] text-amber-400 px-2 py-0.5 rounded border border-white/10">
                    cron: {sched.cron_expression}
                  </span>
                </div>
                <p className="text-xs text-gray-300 font-mono text-[11px] truncate max-w-lg">
                  {sched.task_template}
                </p>
                <div className="flex items-center space-x-3 text-[10px] text-gray-500 pt-1">
                  <span className="flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>Next Run: {sched.next_run_at ? new Date(sched.next_run_at).toLocaleDateString() : 'Pending'}</span>
                  </span>
                  <span>·</span>
                  <span className="flex items-center space-x-1 text-emerald-400">
                    <ShieldAlert className="w-3 h-3" />
                    <span>Approval Gates Enforced</span>
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleTrigger(sched.id)}
                  className="inline-flex items-center space-x-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-1.5 px-3 rounded transition"
                  title="Run now"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Run Now</span>
                </button>
                <button
                  onClick={() => handleDelete(sched.id)}
                  className="text-gray-500 hover:text-rose-400 p-1.5 rounded transition"
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl max-w-md w-full p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-white mb-3">Create Recurring Schedule</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Schedule Name</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Weekly Support Digest"
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded p-2 text-xs text-white"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Cron Expression / Cadence</label>
                <select
                  value={cron}
                  onChange={(e) => setCron(e.target.value)}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded p-2 text-xs text-white"
                >
                  <option value="0 9 * * 1">Every Monday at 9:00 AM (0 9 * * 1)</option>
                  <option value="0 17 * * 5">Every Friday at 5:00 PM (0 17 * * 5)</option>
                  <option value="0 8 * * *">Daily at 8:00 AM (0 8 * * *)</option>
                  <option value="0 0 1 * *">Monthly on the 1st (0 0 1 * *)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Task Prompt Template</label>
                <textarea
                  value={taskTemplate}
                  onChange={(e) => setTaskTemplate(e.target.value)}
                  placeholder="Task instruction for each run (e.g. 'Compile tickets from past 7 days into an executive spreadsheet and draft notification email')"
                  rows={3}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded p-2 text-xs text-white resize-none"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Granted Web Domains (comma-separated)</label>
                <input
                  type="text"
                  value={grantedDomains}
                  onChange={(e) => setGrantedDomains(e.target.value)}
                  placeholder="support.example.com, docs.example.com"
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded p-2 text-xs text-white font-mono"
                />
                <p className="text-[10px] text-gray-500 mt-1">Only web fetches for these domains will be allowed on scheduled runs.</p>
              </div>
              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="text-xs text-gray-400 hover:text-white px-3 py-1.5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-1.5 rounded"
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
