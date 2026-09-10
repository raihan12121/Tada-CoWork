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
  status: SessionStatus;
  plan?: Plan;
  artifacts: Artifact[];
  pending_approval?: ApprovalRequest;
  created_at: string;
  updated_at: string;
  tool_calls_count: number;
  total_cost_usd: number;
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
}

export interface BridgeStatus {
  is_connected: boolean;
  granted_folders: string[];
  allow_browser_control: boolean;
}
