import type { Session, MemoryItem, Schedule, BridgeStatus, ActivityEvent, Plan, RiskLevel } from '../types';

const API_BASE = '/v1';
const BRIDGE_TOKEN = import.meta.env.VITE_BRIDGE_TOKEN || (import.meta.env.DEV ? 'dev-only-local-bridge-secret' : '');
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || (import.meta.env.DEV ? 'dev-only-local-bridge-secret' : '');
const API_AUTH_TOKEN = import.meta.env.VITE_API_AUTH_TOKEN || '';
const IDENTITY_TOKEN = import.meta.env.VITE_IDENTITY_TOKEN || '';

async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const bearerToken = IDENTITY_TOKEN || API_AUTH_TOKEN;
  if (bearerToken) headers.set('Authorization', `Bearer ${bearerToken}`);
  return fetch(input, { ...init, headers });
}

export const api = {
  // Sessions
  async createSession(task: string, workspaceId = 'default'): Promise<Session> {
    const res = await apiFetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, workspace_id: workspaceId })
    });
    if (!res.ok) throw new Error('Failed to create session');
    return res.json();
  },

  async uploadSessionInput(id: string, file: File): Promise<{ session_id: string; filename: string; path: string; size: number }> {
    const form = new FormData();
    form.append('file', file, file.name);
    const res = await apiFetch(`${API_BASE}/sessions/${id}/inputs`, { method: 'POST', body: form });
    if (!res.ok) throw new Error((await res.json()).detail || 'Failed to upload input');
    return res.json();
  },

  async getSession(id: string): Promise<Session> {
    const res = await apiFetch(`${API_BASE}/sessions/${id}`);
    if (!res.ok) throw new Error('Failed to fetch session');
    return res.json();
  },

  async getLLMSettings(): Promise<{ provider: string; model?: string; configured: boolean }> {
    const res = await apiFetch(`${API_BASE}/settings/llm`);
    if (!res.ok) throw new Error('Failed to load AI provider settings');
    return res.json();
  },

  async updateLLMSettings(payload: { provider: string; api_key?: string; endpoint?: string; model?: string }): Promise<{ provider: string; model?: string; configured: boolean }> {
    const res = await apiFetch(`${API_BASE}/settings/llm`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error((await res.json()).detail || 'Failed to save AI provider settings');
    return res.json();
  },

  async testLLMSettings(): Promise<{ success: boolean }> {
    const res = await apiFetch(`${API_BASE}/settings/llm/test`, { method: 'POST' });
    if (!res.ok) throw new Error((await res.json()).detail || 'AI provider test failed');
    return res.json();
  },

  async getSessionEvents(id: string): Promise<ActivityEvent[]> {
    const res = await apiFetch(`${API_BASE}/sessions/${id}/events`);
    if (!res.ok) throw new Error('Failed to fetch session events');
    return res.json();
  },

  async getSessionUsage(id: string): Promise<{ session_id: string; tool_calls: number; tool_call_limit: number; steps_completed: number; step_limit: number; estimated_cost_usd: number; runtime_limit_seconds: number }> {
    const res = await apiFetch(`${API_BASE}/sessions/${id}/usage`);
    if (!res.ok) throw new Error('Failed to fetch session usage');
    return res.json();
  },

  async editPlan(id: string, payload: {
    action: 'add' | 'remove' | 'reorder';
    step_id?: string;
    description?: string;
    tool?: string;
    risk_level?: RiskLevel;
    ordered_step_ids?: string[];
  }): Promise<Plan> {
    const res = await apiFetch(`${API_BASE}/sessions/${id}/plan/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Failed to edit plan');
    return res.json();
  },

  async updateSessionPermission(id: string, action: 'grant' | 'revoke', resourceType: 'tool' | 'folder' | 'scope' | 'domain', value: string): Promise<Session> {
    const res = await apiFetch(`${API_BASE}/sessions/${id}/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, resource_type: resourceType, value })
    });
    if (!res.ok) throw new Error('Failed to update session permission');
    return res.json();
  },

  async listSessions(): Promise<Session[]> {
    const res = await apiFetch(`${API_BASE}/sessions`);
    if (!res.ok) throw new Error('Failed to list sessions');
    return res.json();
  },

  async startSession(id: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/sessions/${id}/start`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to start session');
  },

  async pauseSession(id: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/sessions/${id}/pause`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to pause session');
  },

  async resumeSession(id: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/sessions/${id}/resume`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to resume session');
  },

  async cancelSession(id: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/sessions/${id}/cancel`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to cancel session');
  },

  // Approvals
  async resolveApproval(
    approvalId: string,
    decision: 'approved' | 'denied',
    userFeedback?: string,
    alwaysAllowCategory = false
  ): Promise<void> {
    const res = await apiFetch(`${API_BASE}/approvals/${approvalId}/resolve`, {
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
    const res = await apiFetch(`${API_BASE}/artifacts/preview/${sessionId}/${encodeURIComponent(filename)}`);
    if (!res.ok) throw new Error('Failed to preview artifact');
    return res.json();
  },

  getArtifactDownloadUrl(sessionId: string, filename: string): string {
    return `${API_BASE}/artifacts/download/${sessionId}/${encodeURIComponent(filename)}`;
  },

  // Memory
  async listMemories(): Promise<MemoryItem[]> {
    const res = await apiFetch(`${API_BASE}/memory`);
    if (!res.ok) throw new Error('Failed to list memories');
    return res.json();
  },

  async createMemory(type: 'fact' | 'preference' | 'summary', content: string, key?: string): Promise<MemoryItem> {
    const res = await apiFetch(`${API_BASE}/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, content, key })
    });
    if (!res.ok) throw new Error('Failed to create memory');
    return res.json();
  },

  async deleteMemory(id: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/memory/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete memory');
  },

  async toggleMemory(enabled: boolean): Promise<void> {
    const res = await apiFetch(`${API_BASE}/memory/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: 'default', enabled })
    });
    if (!res.ok) throw new Error('Failed to toggle memory');
  },

  async getMemoryStatus(): Promise<{ workspace_id: string; enabled: boolean }> {
    const res = await apiFetch(`${API_BASE}/memory/status?workspace_id=default`);
    if (!res.ok) throw new Error('Failed to fetch memory status');
    return res.json();
  },

  async updateMemory(id: string, content: string, key?: string): Promise<MemoryItem> {
    const res = await apiFetch(`${API_BASE}/memory/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, key })
    });
    if (!res.ok) throw new Error('Failed to update memory');
    return res.json();
  },

  // Schedules
  async listSchedules(): Promise<Schedule[]> {
    const res = await apiFetch(`${API_BASE}/schedules`);
    if (!res.ok) throw new Error('Failed to list schedules');
    return res.json();
  },

  async createSchedule(title: string, taskTemplate: string, cronExpression: string, grantedDomains: string[] = []): Promise<Schedule> {
    const res = await apiFetch(`${API_BASE}/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, task_template: taskTemplate, cron_expression: cronExpression, granted_domains: grantedDomains })
    });
    if (!res.ok) throw new Error('Failed to create schedule');
    return res.json();
  },

  async triggerSchedule(id: string): Promise<Session> {
    const res = await apiFetch(`${API_BASE}/schedules/${id}/trigger`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to trigger schedule');
    return res.json();
  },

  async deleteSchedule(id: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/schedules/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete schedule');
  },

  // Bridge
  async getBridgeStatus(sessionId?: string): Promise<BridgeStatus> {
    const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
    const res = await apiFetch(`${API_BASE}/bridge/status${query}`);
    if (!res.ok) throw new Error('Failed to fetch bridge status');
    return res.json();
  },

  async grantFolder(folderPath: string, sessionId?: string): Promise<void> {
    const sessionQuery = sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : '';
    const res = await apiFetch(`${API_BASE}/bridge/grant_folder?folder_path=${encodeURIComponent(folderPath)}${sessionQuery}`, {
      method: 'POST',
      headers: { 'X-Bridge-Token': BRIDGE_TOKEN }
    });
    if (!res.ok) throw new Error('Failed to grant folder');
  },

  async revokeFolder(folderPath: string, sessionId?: string): Promise<void> {
    const sessionQuery = sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : '';
    const res = await apiFetch(`${API_BASE}/bridge/revoke_folder?folder_path=${encodeURIComponent(folderPath)}${sessionQuery}`, {
      method: 'POST',
      headers: { 'X-Bridge-Token': BRIDGE_TOKEN }
    });
    if (!res.ok) throw new Error('Failed to revoke folder');
  },

  async toggleBrowser(enable: boolean, sessionId?: string): Promise<void> {
    const sessionQuery = sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : '';
    const res = await apiFetch(`${API_BASE}/bridge/toggle_browser?enable=${enable}${sessionQuery}`, {
      method: 'POST',
      headers: { 'X-Bridge-Token': BRIDGE_TOKEN }
    });
    if (!res.ok) throw new Error('Failed to update browser permission');
  },

  // Admin
  async exportAuditLog(): Promise<any[]> {
    const res = await apiFetch(`${API_BASE}/admin/audit/export`, { headers: { 'X-Admin-Token': ADMIN_TOKEN } });
    if (!res.ok) throw new Error('Failed to export audit log');
    return res.json();
  },

  async verifyAuditIntegrity(): Promise<{ integrity_verified: boolean; error?: string }> {
    const res = await apiFetch(`${API_BASE}/admin/audit/verify`, { headers: { 'X-Admin-Token': ADMIN_TOKEN } });
    if (!res.ok) throw new Error('Failed to verify audit');
    return res.json();
  },

  async emergencyKill(): Promise<void> {
    const res = await apiFetch(`${API_BASE}/admin/kill_all`, {
      method: 'POST',
      headers: { 'X-Admin-Token': ADMIN_TOKEN }
    });
    if (!res.ok) throw new Error('Failed to trigger emergency kill');
  },

  async getOrganizationPolicy(): Promise<any> {
    const res = await apiFetch(`${API_BASE}/admin/organization/policy`, { headers: { 'X-Admin-Token': ADMIN_TOKEN } });
    if (!res.ok) throw new Error('Failed to fetch organization policy');
    return res.json();
  },

  async updateOrganizationPolicy(payload: any): Promise<any> {
    const res = await apiFetch(`${API_BASE}/admin/organization/policy`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': ADMIN_TOKEN }, body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to update organization policy');
    return res.json();
  },

  async getAdminUsage(): Promise<{ session_count: number; tool_calls: number; estimated_cost_usd: number; active_sessions: number }> {
    const res = await apiFetch(`${API_BASE}/admin/usage`, { headers: { 'X-Admin-Token': ADMIN_TOKEN } });
    if (!res.ok) throw new Error('Failed to fetch organization usage');
    return res.json();
  }
};
