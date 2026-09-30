import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Download, 
  AlertOctagon, 
  CheckCircle2, 
  AlertTriangle, 
  Lock
} from 'lucide-react';
import { api } from '../services/api';

export const AuditViewer: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [integrityStatus, setIntegrityStatus] = useState<{ integrity_verified: boolean; error?: string } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [policy, setPolicy] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [connectorBlocklist, setConnectorBlocklist] = useState('');

  useEffect(() => {
    let ignore = false;
    Promise.all([api.exportAuditLog(), api.verifyAuditIntegrity(), api.getOrganizationPolicy(), api.getAdminUsage()])
      .then(([entries, status, orgPolicy, orgUsage]) => {
        if (!ignore) {
          setLogs([...entries].reverse());
          setIntegrityStatus(status);
          setPolicy(orgPolicy);
          setUsage(orgUsage);
        }
      })
      .catch(console.error);
    return () => {
      ignore = true;
    };
  }, []);

  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      const status = await api.verifyAuditIntegrity();
      setIntegrityStatus(status);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleKillAll = async () => {
    if (confirm('EMERGENCY KILL SWITCH: Suspend all running agent sessions immediately?')) {
      await api.emergencyKill();
      alert('All active agent sessions have been terminated.');
    }
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coagent_audit_trail_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
  };

  const savePolicy = async () => {
    if (!policy) return;
    const updated = await api.updateOrganizationPolicy({
      ...policy,
      connector_blocklist: connectorBlocklist.split(',').map((item) => item.trim()).filter(Boolean),
    });
    setPolicy(updated);
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between pb-6 border-b border-white/[0.08] mb-6 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Audit & Governance Console</h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1 max-w-xl">
            100% of tool executions, approval actions, and plan changes are verified in an append-only, SHA-256 hash-chained ledger.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={downloadJson}
            className="flex items-center gap-1.5 bg-white/[0.06] hover:bg-white/[0.1] text-zinc-200 text-xs font-semibold py-2 px-3.5 rounded-xl border border-white/[0.08] transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Audit Ledger</span>
          </button>

          <button
            onClick={handleKillAll}
            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold py-2 px-3.5 rounded-xl shadow transition"
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>Emergency Kill Switch</span>
          </button>
        </div>
      </div>

      {/* Cryptographic Integrity Card */}
      <div className="bg-[#09090c] border border-white/[0.08] rounded-2xl p-4 mb-6 flex flex-wrap items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Cryptographic Ledger Integrity
              </h4>
              {integrityStatus?.integrity_verified ? (
                <span className="inline-flex items-center gap-1 bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>SHA-256 Hash Chain Verified</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 bg-rose-500/20 text-rose-300 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border border-rose-500/30">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Integrity Anomaly Detected</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5 font-mono">
              Each block is cryptographically linked to the SHA-256 hash of previous agent actions.
            </p>
          </div>
        </div>

        <button
          onClick={handleVerify}
          disabled={isVerifying}
          className="text-xs bg-white text-black hover:bg-zinc-200 font-semibold py-1.5 px-3.5 rounded-xl transition disabled:opacity-50"
        >
          {isVerifying ? 'Verifying...' : 'Re-verify Hashes'}
        </button>
      </div>

      {/* Organization Policy */}
      {policy && (
        <div className="bg-[#09090c] border border-white/[0.08] rounded-2xl p-4 mb-6 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Organization Policy</h4>
              <p className="text-[11px] text-zinc-400 mt-0.5">Connector blocklists and global runtime limits.</p>
            </div>
            {usage && (
              <div className="text-right text-[11px] text-zinc-400 font-mono">
                {usage.active_sessions} active · {usage.tool_calls} tool calls · ${Number(usage.estimated_cost_usd).toFixed(4)}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={connectorBlocklist || (policy.connector_blocklist || []).join(', ')}
              onChange={(event) => setConnectorBlocklist(event.target.value)}
              placeholder="Blocked connectors (e.g. bash, send_email), comma separated"
              className="flex-1 bg-[#121215] border border-white/[0.1] rounded-xl p-2.5 text-xs text-white font-mono focus:outline-none focus:border-white/30"
            />
            <button 
              onClick={savePolicy} 
              className="bg-white text-black hover:bg-zinc-200 text-xs font-semibold px-4 py-2.5 rounded-xl transition"
            >
              Save Policy
            </button>
          </div>
          <label className="flex items-center gap-2 mt-3 text-xs text-zinc-300 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={Boolean(policy.kill_switch)} 
              onChange={(event) => setPolicy({ ...policy, kill_switch: event.target.checked })} 
              className="rounded bg-black border-zinc-700 text-rose-500 focus:ring-0" 
            />
            <span>Enable Organization Master Kill Switch</span>
          </label>
        </div>
      )}

      {/* Action Ledger */}
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 px-1">
          Immutable Action Ledger ({logs.length} events)
        </div>
        {logs.length === 0 ? (
          <div className="p-6 bg-[#09090c] rounded-2xl border border-white/[0.08] text-center text-xs text-zinc-600 italic">
            No audit records logged yet.
          </div>
        ) : (
          logs.map((entry, idx) => (
            <div
              key={idx}
              className="bg-[#09090c] border border-white/[0.08] p-3.5 rounded-xl text-xs font-mono text-zinc-300 space-y-1.5 shadow-sm"
            >
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-cyan-400 uppercase">[{entry.event_type}]</span>
                  <span className="text-zinc-400 font-sans">by {entry.actor}</span>
                  {entry.step_id && (
                    <span className="text-zinc-500">({entry.step_id})</span>
                  )}
                </div>
                <span className="text-zinc-500 text-[10px]">
                  {new Date(entry.timestamp).toLocaleString()}
                </span>
              </div>

              <div className="text-[11px] text-zinc-200 font-sans">
                {entry.details?.consequence || entry.details?.task || entry.details?.reason || entry.details?.action_type || JSON.stringify(entry.details)}
              </div>

              <div className="flex items-center gap-4 text-[9px] text-zinc-600 pt-1.5 border-t border-white/[0.04]">
                <span className="truncate">prev_hash: {entry.prev_hash?.slice(0, 16)}...</span>
                <span className="truncate text-cyan-400">entry_hash: {entry.hash?.slice(0, 16)}...</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
