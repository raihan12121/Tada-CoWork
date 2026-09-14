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
      <div className="flex items-center justify-between pb-6 border-b border-[#30363d] mb-6">
        <div>
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-6 h-6 text-cyan-400" />
            <h2 className="text-xl font-bold text-white tracking-wide">Audit & Safety Console</h2>
          </div>
          <p className="text-xs text-gray-400 mt-1 max-w-xl">
            100% of tool calls, approvals, and plan modifications are recorded in an append-only, SHA-256 hash-chained ledger.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={downloadJson}
            className="flex items-center space-x-1.5 bg-[#21262d] hover:bg-[#30363d] text-white text-xs font-semibold py-2 px-3 rounded-lg border border-[#30363d] transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Audit JSON</span>
          </button>

          <button
            onClick={handleKillAll}
            className="flex items-center space-x-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold py-2 px-3 rounded-lg shadow transition"
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>Emergency Kill Switch</span>
          </button>
        </div>
      </div>

      {/* Cryptographic Integrity Card */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 mb-6 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Cryptographic Ledger Integrity
              </h4>
              {integrityStatus?.integrity_verified ? (
                <span className="inline-flex items-center space-x-1 bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Hash Chain Verified (Tamper-Evident)</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1 bg-rose-500/20 text-rose-300 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Integrity Anomaly Detected</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Each log block is cryptographically linked to the SHA-256 hash of previous actions.
            </p>
          </div>
        </div>

        <button
          onClick={handleVerify}
          disabled={isVerifying}
          className="text-xs bg-cyan-950/40 border border-cyan-500/40 hover:bg-cyan-900/40 text-cyan-300 font-semibold py-1.5 px-3 rounded-lg transition"
        >
          {isVerifying ? 'Verifying...' : 'Re-verify Hashes'}
        </button>
      </div>

      {/* Audit Trail List */}
      {policy && (
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Organization Policy</h4>
              <p className="text-[11px] text-gray-400 mt-1">Connector blocklist and global execution controls.</p>
            </div>
            {usage && <div className="text-right text-[11px] text-gray-400">{usage.active_sessions} active · {usage.tool_calls} tool calls · ${Number(usage.estimated_cost_usd).toFixed(4)}</div>}
          </div>
          <div className="flex items-center space-x-2">
            <input
              value={connectorBlocklist || (policy.connector_blocklist || []).join(', ')}
              onChange={(event) => setConnectorBlocklist(event.target.value)}
              placeholder="Blocked connectors, comma separated"
              className="flex-1 bg-[#0d1117] border border-[#30363d] rounded p-2 text-xs text-white"
            />
            <button onClick={savePolicy} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-2 rounded">Save policy</button>
          </div>
          <label className="flex items-center space-x-2 mt-3 text-xs text-gray-300">
            <input type="checkbox" checked={Boolean(policy.kill_switch)} onChange={(event) => setPolicy({ ...policy, kill_switch: event.target.checked })} />
            <span>Organization kill switch</span>
          </label>
        </div>
      )}

      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase text-gray-500 tracking-wider mb-2">
          Immutable Action Ledger ({logs.length} events)
        </div>
        {logs.length === 0 ? (
          <div className="p-6 bg-[#161b22] rounded-xl border border-[#30363d] text-center text-xs text-gray-500">
            No audit records logged yet.
          </div>
        ) : (
          logs.map((entry, idx) => (
            <div
              key={idx}
              className="bg-[#161b22] border border-[#30363d] p-3 rounded-lg text-xs font-mono text-gray-300 space-y-1.5"
            >
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-cyan-400 uppercase">[{entry.event_type}]</span>
                  <span className="text-gray-400 font-sans">by {entry.actor}</span>
                  {entry.step_id && (
                    <span className="text-gray-500">({entry.step_id})</span>
                  )}
                </div>
                <span className="text-gray-500 text-[10px]">
                  {new Date(entry.timestamp).toLocaleString()}
                </span>
              </div>

              <div className="text-[11px] text-white font-sans">
                {entry.details?.consequence || entry.details?.task || entry.details?.reason || entry.details?.action_type || JSON.stringify(entry.details)}
              </div>

              <div className="flex items-center space-x-4 text-[9px] text-gray-500 pt-1 border-t border-white/5">
                <span className="truncate">prev_hash: {entry.prev_hash?.slice(0, 16)}...</span>
                <span className="truncate text-cyan-500">entry_hash: {entry.hash?.slice(0, 16)}...</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
