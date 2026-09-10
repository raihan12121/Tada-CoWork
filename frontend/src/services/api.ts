import type { Session, MemoryItem, Schedule, BridgeStatus } from '../types';

const API_BASE = '/v1';

export const api = {
  // Sessions
  async createSession(task: string, workspaceId = 'default'): Promise<Session> {
    const res = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, workspace_id: workspaceId })
    });
    if (!res.ok) throw new Error('Failed to create session');
    return res.json();
  },

  async getSession(id: string): Promise<Session> {
    const res = await fetch(`${API_BASE}/sessions/${id}`);
    if (!res.ok) throw new Error('Failed to fetch session');
    return res.json();
  },

  async listSessions(): Promise<Session[]> {
    const res = await fetch(`${API_BASE}/sessions`);
    if (!res.ok) throw new Error('Failed to list sessions');
    return res.json();
  },

  async startSession(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/sessions/${id}/start`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to start session');
  },

  async pauseSession(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/sessions/${id}/pause`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to pause session');
  },

  async resumeSession(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/sessions/${id}/resume`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to resume session');
  },

  async cancelSession(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/sessions/${id}/cancel`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to cancel session');
  },

  // Approvals
  async resolveApproval(
    approvalId: string,
    decision: 'approved' | 'denied',
    userFeedback?: string,
    alwaysAllowCategory = false
  ): Promise<void> {
    const res = await fetch(`${API_BASE}/approvals/${approvalId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision,
        user_feedback: userFeedback,
        always_allow_category: alwaysAllowCategory
      })
    });
    if (!res.ok) throw new Error('Failed to resolve approval');
  },

  // Artifacts
  async previewArtifact(sessionId: string, filename: string): Promise<{ filename: string; type: string; content: string }> {
    const res = await fetch(`${API_BASE}/artifacts/preview/${sessionId}/${encodeURIComponent(filename)}`);
    if (!res.ok) throw new Error('Failed to preview artifact');
    return res.json();
  },

  getArtifactDownloadUrl(sessionId: string, filename: string): string {
    return `${API_BASE}/artifacts/download/${sessionId}/${encodeURIComponent(filename)}`;
  },

  // Memory
  async listMemories(): Promise<MemoryItem[]> {
    const res = await fetch(`${API_BASE}/memory`);
    if (!res.ok) throw new Error('Failed to list memories');
    return res.json();
  },

  async createMemory(type: 'fact' | 'preference' | 'summary', content: string, key?: string): Promise<MemoryItem> {
    const res = await fetch(`${API_BASE}/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, content, key })
    });
    if (!res.ok) throw new Error('Failed to create memory');
    return res.json();
  },

  async deleteMemory(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/memory/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete memory');
  },

  async toggleMemory(enabled: boolean): Promise<void> {
    const res = await fetch(`${API_BASE}/memory/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: 'default', enabled })
    });
    if (!res.ok) throw new Error('Failed to toggle memory');
  },

  // Schedules
  async listSchedules(): Promise<Schedule[]> {
    const res = await fetch(`${API_BASE}/schedules`);
    if (!res.ok) throw new Error('Failed to list schedules');
    return res.json();
  },

  async createSchedule(title: string, taskTemplate: string, cronExpression: string): Promise<Schedule> {
    const res = await fetch(`${API_BASE}/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, task_template: taskTemplate, cron_expression: cronExpression })
    });
    if (!res.ok) throw new Error('Failed to create schedule');
    return res.json();
  },

  async triggerSchedule(id: string): Promise<Session> {
    const res = await fetch(`${API_BASE}/schedules/${id}/trigger`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to trigger schedule');
    return res.json();
  },

  async deleteSchedule(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/schedules/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete schedule');
  },

  // Bridge
  async getBridgeStatus(): Promise<BridgeStatus> {
    const res = await fetch(`${API_BASE}/bridge/status`);
    if (!res.ok) throw new Error('Failed to fetch bridge status');
    return res.json();
  },

  async grantFolder(folderPath: string): Promise<void> {
    const res = await fetch(`${API_BASE}/bridge/grant_folder?folder_path=${encodeURIComponent(folderPath)}`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to grant folder');
  },

  async revokeFolder(folderPath: string): Promise<void> {
    const res = await fetch(`${API_BASE}/bridge/revoke_folder?folder_path=${encodeURIComponent(folderPath)}`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to revoke folder');
  },

  // Admin
  async exportAuditLog(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/admin/audit/export`);
    if (!res.ok) throw new Error('Failed to export audit log');
    return res.json();
  },

  async verifyAuditIntegrity(): Promise<{ integrity_verified: boolean; error?: string }> {
    const res = await fetch(`${API_BASE}/admin/audit/verify`);
    if (!res.ok) throw new Error('Failed to verify audit');
    return res.json();
  },

  async emergencyKill(): Promise<void> {
    const res = await fetch(`${API_BASE}/admin/kill_all`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to trigger emergency kill');
  }
};
