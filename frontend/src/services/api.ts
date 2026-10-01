import { Capacitor } from '@capacitor/core';
import type { Session, MemoryItem, Schedule, BridgeStatus, ActivityEvent, Plan, RiskLevel, Skill, SkillCreate, McpServer, McpServerCreate, SwarmRunRequest, SwarmRunResponse, Bot, BotCreate, BotUpdate, BotTemplate, Channel, ChannelCreate } from '../types';

export type ProviderAccount = {
  id: string; workspace_id: string; provider: string; label: string; auth_type: string;
  model: string; endpoint: string; status: string; configured: boolean; active: boolean;
  quota_status?: string | null; quota_remaining?: number | null; quota_reset_at?: string | null;
  last_error?: string | null;
};

export function getBackendBaseUrl(): string {
  const customHost = localStorage.getItem('coagent_server_url');
  if (customHost) return customHost.replace(/\/$/, '');
  if (Capacitor.isNativePlatform()) {
    return 'http://192.168.0.104:8000';
  }
  return '';
}

export function setBackendBaseUrl(url: string) {
  if (url) {
    localStorage.setItem('coagent_server_url', url);
  } else {
    localStorage.removeItem('coagent_server_url');
  }
}

const API_BASE = '/v1';
const BRIDGE_TOKEN = import.meta.env.VITE_BRIDGE_TOKEN || (import.meta.env.DEV ? 'dev-only-local-bridge-secret' : '');
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || (import.meta.env.DEV ? 'dev-only-local-bridge-secret' : '');
const API_AUTH_TOKEN = import.meta.env.VITE_API_AUTH_TOKEN || '';
const IDENTITY_TOKEN = import.meta.env.VITE_IDENTITY_TOKEN || '';

async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const bearerToken = IDENTITY_TOKEN || API_AUTH_TOKEN;
  if (bearerToken) headers.set('Authorization', `Bearer ${bearerToken}`);

  let target = input;
  const backendBase = getBackendBaseUrl();
  if (backendBase && typeof input === 'string' && input.startsWith('/v1')) {
    target = `${backendBase}${input}`;
  }
  return fetch(target, { ...init, headers });
}

export const api = {
  // Sessions
  async createSession(task: string, workspaceId = 'default', providerAccountId?: string, allowProviderFailover = false, botId?: string, channelId?: string): Promise<Session> {
    const res = await apiFetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        task, 
        workspace_id: workspaceId, 
        provider_account_id: providerAccountId || null, 
        allow_provider_failover: allowProviderFailover,
        bot_id: botId || null,
        channel_id: channelId || null
      })
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

  async listProviderAccounts(): Promise<ProviderAccount[]> {
    const res = await apiFetch(`${API_BASE}/settings/accounts`);
    if (!res.ok) throw new Error('Failed to load provider accounts');
    return res.json();
  },

  async createProviderAccount(payload: { provider: string; label: string; auth_type: string; secret?: string; endpoint?: string; model?: string }): Promise<ProviderAccount> {
    const res = await apiFetch(`${API_BASE}/settings/accounts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error((await res.json()).detail || 'Failed to add provider account');
    return res.json();
  },

  async selectProviderAccount(id: string): Promise<ProviderAccount> {
    const res = await apiFetch(`${API_BASE}/settings/accounts/${encodeURIComponent(id)}/select`, { method: 'POST' });
    if (!res.ok) throw new Error((await res.json()).detail || 'Failed to select provider account');
    return res.json();
  },

  async testProviderAccount(id: string): Promise<{ success: boolean; provider: string; model: string }> {
    const res = await apiFetch(`${API_BASE}/settings/accounts/${encodeURIComponent(id)}/test`, { method: 'POST' });
    if (!res.ok) throw new Error((await res.json()).detail || 'Provider account test failed');
    return res.json();
  },

  async deleteProviderAccount(id: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/settings/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).detail || 'Failed to remove provider account');
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

  async getPlanTierStatus(workspaceId = 'default'): Promise<{
    workspace_id: string;
    plan_tier: string;
    tier_name: string;
    monthly_task_limit: number;
    tasks_used_this_month: number;
    tasks_remaining: number;
    quota_exhausted: boolean;
    quota_reset_at: string;
    max_steps_per_task: number;
    max_tool_calls_per_task: number;
    available_tiers: Array<{ tier: string; name: string; limit: number; price_usd: number }>;
  }> {
    const res = await apiFetch(`${API_BASE}/sessions/plan-tier/status?workspace_id=${encodeURIComponent(workspaceId)}`);
    if (!res.ok) throw new Error('Failed to fetch plan tier status');
    return res.json();
  },

  async updatePlanTier(tier: string, workspaceId = 'default'): Promise<any> {
    const res = await apiFetch(`${API_BASE}/sessions/plan-tier/update?tier=${encodeURIComponent(tier)}&workspace_id=${encodeURIComponent(workspaceId)}`, {
      method: 'PUT'
    });
    if (!res.ok) throw new Error('Failed to update plan tier');
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

  async listSessions(botId?: string, channelId?: string, limit = 50): Promise<Session[]> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (botId) params.set('bot_id', botId);
    if (channelId) params.set('channel_id', channelId);
    const qs = params.toString();
    const res = await apiFetch(`${API_BASE}/sessions${qs ? `?${qs}` : ''}`);
    if (!res.ok) throw new Error('Failed to list sessions');
    return res.json();
  },

  async executeTerminalCommand(sessionId: string, command: string, timeoutSeconds = 30): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    exit_code: number;
    execution_time_ms: number;
    cwd: string;
  }> {
    const res = await apiFetch(`${API_BASE}/sessions/${sessionId}/terminal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, timeout_seconds: timeoutSeconds })
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Failed to execute terminal command');
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
  async previewArtifact(sessionId: string, filename: string): Promise<import('../types').ArtifactPreviewData> {
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

  // Skills Engine (GrokBot parity)
  async listSkills(workspaceId = 'default'): Promise<Skill[]> {
    const res = await apiFetch(`${API_BASE}/skills?workspace_id=${encodeURIComponent(workspaceId)}`);
    if (!res.ok) throw new Error('Failed to list skills');
    return res.json();
  },

  async getSkill(id: string): Promise<Skill> {
    const res = await apiFetch(`${API_BASE}/skills/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error('Failed to fetch skill');
    return res.json();
  },

  async createSkill(payload: SkillCreate): Promise<Skill> {
    const res = await apiFetch(`${API_BASE}/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Failed to create skill');
    return res.json();
  },

  async createSkillFromSession(sessionId: string, name: string, description: string, workspaceId = 'default'): Promise<Skill> {
    const res = await apiFetch(`${API_BASE}/skills/from-session/${encodeURIComponent(sessionId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, workspace_id: workspaceId })
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Failed to save session as skill');
    return res.json();
  },

  async runSkill(skillId: string, parameters: Record<string, any> = {}, workspaceId = 'default'): Promise<Session> {
    const res = await apiFetch(`${API_BASE}/skills/${encodeURIComponent(skillId)}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameters, workspace_id: workspaceId })
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Failed to execute skill');
    return res.json();
  },

  async deleteSkill(id: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/skills/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete skill');
  },

  // Model Context Protocol (MCP) Hub
  async listMcpServers(workspaceId = 'default'): Promise<McpServer[]> {
    const res = await apiFetch(`${API_BASE}/mcp/servers?workspace_id=${encodeURIComponent(workspaceId)}`);
    if (!res.ok) throw new Error('Failed to list MCP servers');
    return res.json();
  },

  async registerMcpServer(payload: McpServerCreate): Promise<McpServer> {
    const res = await apiFetch(`${API_BASE}/mcp/servers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Failed to register MCP server');
    return res.json();
  },

  async syncMcpServer(id: string): Promise<McpServer> {
    const res = await apiFetch(`${API_BASE}/mcp/servers/${encodeURIComponent(id)}/sync`, { method: 'POST' });
    if (!res.ok) throw new Error((await res.json()).detail || 'Failed to sync MCP server');
    return res.json();
  },

  async deleteMcpServer(id: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/mcp/servers/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete MCP server');
  },

  // Multi-Agent Swarm Orchestration
  async runSwarm(payload: SwarmRunRequest): Promise<SwarmRunResponse> {
    const res = await apiFetch(`${API_BASE}/swarm/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Failed to execute agent swarm');
    return res.json();
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
  },

  // AnyWork Bots
  async listBots(): Promise<Bot[]> {
    const res = await apiFetch(`${API_BASE}/bots`);
    if (!res.ok) throw new Error('Failed to list bots');
    return res.json();
  },

  async createBot(payload: BotCreate): Promise<Bot> {
    const res = await apiFetch(`${API_BASE}/bots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to create bot');
    return res.json();
  },

  async getBot(botId: string): Promise<Bot> {
    const res = await apiFetch(`${API_BASE}/bots/${botId}`);
    if (!res.ok) throw new Error('Failed to fetch bot');
    return res.json();
  },

  async updateBot(botId: string, payload: BotUpdate): Promise<Bot> {
    const res = await apiFetch(`${API_BASE}/bots/${botId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to update bot');
    return res.json();
  },

  async duplicateBot(botId: string): Promise<Bot> {
    const res = await apiFetch(`${API_BASE}/bots/${botId}/duplicate`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to duplicate bot');
    return res.json();
  },

  async deleteBot(botId: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/bots/${botId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete bot');
  },

  async exportBotTemplate(botId: string): Promise<BotTemplate> {
    const res = await apiFetch(`${API_BASE}/bots/${botId}/template`);
    if (!res.ok) throw new Error('Failed to export template');
    return res.json();
  },

  async importBotTemplate(template: BotTemplate): Promise<Bot> {
    const res = await apiFetch(`${API_BASE}/bots/import-template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template)
    });
    if (!res.ok) throw new Error('Failed to import template');
    return res.json();
  },

  // AnyWork Channels
  async listChannels(): Promise<Channel[]> {
    const res = await apiFetch(`${API_BASE}/channels`);
    if (!res.ok) throw new Error('Failed to list channels');
    return res.json();
  },

  async createChannel(payload: ChannelCreate): Promise<Channel> {
    const res = await apiFetch(`${API_BASE}/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to create channel');
    return res.json();
  },

  async deleteChannel(channelId: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/channels/${channelId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete channel');
  },

  async getBotRoutines(botId: string): Promise<any[]> {
    const res = await apiFetch(`${API_BASE}/bots/${botId}/routines`);
    if (!res.ok) throw new Error('Failed to fetch bot routines');
    return res.json();
  },

  async triggerBotWebhook(botId: string, payload: Record<string, any>): Promise<any> {
    const res = await apiFetch(`${API_BASE}/bots/${botId}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to trigger webhook');
    return res.json();
  },

  // Connectors Vault
  async listConnectors(): Promise<Array<{
    id: string;
    name: string;
    category: string;
    description: string;
    connected: boolean;
    permissions: string[];
    allowed_bots: string[];
    granted_at?: string;
    last_used_at?: string;
  }>> {
    const res = await apiFetch(`${API_BASE}/connectors`);
    if (!res.ok) throw new Error('Failed to list connectors');
    return res.json();
  },

  async configureConnector(id: string, payload: {
    connected: boolean;
    permissions?: string[];
    allowed_bots?: string[];
    config?: Record<string, any>;
  }): Promise<any> {
    const res = await apiFetch(`${API_BASE}/connectors/${encodeURIComponent(id)}/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error((await res.json()).detail || 'Failed to configure connector');
    return res.json();
  },

  async disconnectConnector(id: string): Promise<void> {
    const res = await apiFetch(`${API_BASE}/connectors/${encodeURIComponent(id)}/disconnect`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to disconnect connector');
  },

  async testConnector(id: string): Promise<{ status: string; connector: string; latency_ms: number; permissions_verified: boolean }> {
    const res = await apiFetch(`${API_BASE}/connectors/${encodeURIComponent(id)}/test`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error('Failed to test connector');
    return res.json();
  }
};
