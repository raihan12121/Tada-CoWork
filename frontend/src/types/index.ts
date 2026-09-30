export type RiskLevel = 'low' | 'medium' | 'high';

export type SessionStatus = 
  | 'created' 
  | 'planning' 
  | 'running' 
  | 'paused' 
  | 'waiting_approval' 
  | 'completed' 
  | 'failed' 
  | 'cancelled';

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'blocked';

export interface Step {
  id: string;
  step_order: number;
  description: string;
  tool: string;
  risk_level: RiskLevel;
  dependencies: string[];
  status: StepStatus;
  result_summary?: string;
}

export interface Plan {
  id: string;
  session_id: string;
  version: number;
  status: string;
  steps: Step[];
  explanation?: string;
  created_at: string;
}

export interface Artifact {
  id: string;
  session_id: string;
  name: string;
  file_type: string;
  relative_path: string;
  file_size_bytes: number;
  created_at: string;
  summary?: string;
  version: number;
}

export interface ApprovalRequest {
  id: string;
  session_id: string;
  step_id?: string;
  action_type: string;
  description: string;
  consequence: string;
  target: string;
  diff?: string;
  risk_level: RiskLevel;
  status: 'pending' | 'approved' | 'denied';
  takeover_mode: boolean;
  takeover_url?: string;
  requested_at: string;
}

export interface ActivityEvent {
  id: string;
  session_id: string;
  timestamp: string;
  event_type: 'narration' | 'reasoning' | 'tool_start' | 'tool_end' | 'approval_required' | 'plan_revised' | 'artifact_created' | 'error' | 'done';
  message: string;
  technical_details?: any;
  step_id?: string;
}

export interface Session {
  id: string;
  task: string;
  workspace_id: string;
  bot_id?: string;
  channel_id?: string;
  parent_session_id?: string;
  status: SessionStatus;
  plan?: Plan;
  artifacts: Artifact[];
  pending_approval?: ApprovalRequest;
  created_at: string;
  updated_at: string;
  tool_calls_count: number;
  total_cost_usd: number;
  enabled_tools: string[];
  granted_folders: string[];
  granted_scopes: string[];
  granted_domains: string[];
  max_steps: number;
  max_tool_calls: number;
  max_runtime_seconds: number;
}

export interface MemoryItem {
  id: string;
  type: 'fact' | 'preference' | 'summary';
  key?: string;
  content: string;
  source_session_id?: string;
  workspace_id: string;
  is_active: boolean;
  created_at: string;
}

export interface Schedule {
  id: string;
  title: string;
  task_template: string;
  cron_expression: string;
  is_active: boolean;
  next_run_at?: string;
  last_run_at?: string;
  last_status?: string;
  enabled_tools: string[];
  granted_scopes: string[];
  granted_folders: string[];
  granted_domains: string[];
}

export interface BridgeStatus {
  is_connected: boolean;
  granted_folders: string[];
  allow_browser_control: boolean;
}

export interface ArtifactPreviewData {
  filename: string;
  type: string;
  content: string;
  rows?: string[][];
  headers?: string[];
  sheets?: Array<{ name: string; rows: string[][] }>;
  sections?: Array<{ text: string; is_heading: boolean; style?: string }>;
  tables?: string[][][];
  slides?: Array<{ index: number; title: string; content: string[] }>;
  download_url?: string;
  file_size_bytes?: number;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  parameters_schema: Record<string, any>;
  steps_definition: Array<Record<string, any>>;
  workspace_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SkillCreate {
  name: string;
  description: string;
  parameters_schema?: Record<string, any>;
  steps_definition: Array<Record<string, any>>;
  workspace_id?: string;
  is_active?: boolean;
}

export interface SkillRunRequest {
  parameters?: Record<string, any>;
  workspace_id?: string;
}

export interface McpServer {
  id: string;
  workspace_id: string;
  name: string;
  server_url: string;
  transport: string;
  status: string;
  last_synced_at?: string;
  tools_count: number;
  discovered_tools: Array<{
    name: string;
    description?: string;
    parameters?: any;
    risk_level?: RiskLevel;
  }>;
  created_at: string;
  updated_at: string;
}

export interface McpServerCreate {
  name: string;
  server_url: string;
  workspace_id?: string;
  transport?: string;
  auth_headers?: Record<string, string>;
}

export interface SwarmRunRequest {
  goal: string;
  workspace_id?: string;
  subtasks?: Array<{
    name: string;
    subtask_description: string;
    context?: string;
    tools_allowed?: string[];
  }>;
  provider_account_id?: string;
  allow_provider_failover?: boolean;
}

export interface SwarmRunResponse {
  master_session_id: string;
  goal: string;
  worker_session_ids: string[];
  status: string;
  synthesis: string;
  artifacts_created: string[];
}

export interface Bot {
  id: string;
  workspace_id: string;
  name: string;
  avatar: string;
  role_tag: string;
  description: string;
  folder_name: string;
  pinned: boolean;
  is_hidden: boolean;
  model?: string;
  enabled_tools: string[];
  individual_memory: string[];
  created_at: string;
  updated_at: string;
}

export interface BotCreate {
  name: string;
  avatar?: string;
  role_tag?: string;
  description: string;
  folder_name?: string;
  pinned?: boolean;
  is_hidden?: boolean;
  model?: string;
  workspace_id?: string;
  enabled_tools?: string[];
  individual_memory?: string[];
}

export interface BotUpdate {
  name?: string;
  avatar?: string;
  role_tag?: string;
  description?: string;
  folder_name?: string;
  pinned?: boolean;
  is_hidden?: boolean;
  model?: string;
  enabled_tools?: string[];
  individual_memory?: string[];
}

export interface BotTemplate {
  name: string;
  avatar: string;
  role_tag: string;
  description: string;
  folder_name: string;
  enabled_tools: string[];
  individual_memory: string[];
  template_version: string;
}

export interface Channel {
  id: string;
  workspace_id: string;
  name: string;
  description?: string;
  bot_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface ChannelCreate {
  name: string;
  description?: string;
  bot_ids: string[];
  workspace_id?: string;
}



