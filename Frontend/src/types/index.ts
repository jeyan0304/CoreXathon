/**
 * Domain types for Agent Workflow Engine
 * Defined based on Rules/PROJECT_SPEC.md, DESIGN.md, and CONVENTIONS.md
 */

export type StepStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'WAITING_FOR_APPROVAL'
  | 'FAILED'
  | 'RETRYING'
  | 'COMPLETED'
  | 'ABORTED';

export type ToolRiskLevel = 'LOW' | 'HIGH';

export interface Tool {
  id: string;
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  requires_approval: boolean;
  risk_level: ToolRiskLevel;
  status: 'ACTIVE' | 'INACTIVE';
  created_at?: string;
}

export interface Workflow {
  id: string;
  user_id: string;
  goal: string;
  status: StepStatus;
  created_at: string;
  updated_at?: string;
  steps?: WorkflowStep[];
}

export interface WorkflowStep {
  id: string;
  workflow_id: string;
  tool_id: string;
  tool_name: string;
  step_order: number;
  arguments: Record<string, unknown>;
  output: Record<string, unknown> | string | null;
  error_message?: string | null;
  status: StepStatus;
  retry_count: number;
  created_at?: string;
  updated_at?: string;
}

export type AuditActor = 'AI Planner' | 'Control Gate' | 'Tool Executor' | 'User (Human Approver)' | 'System' | string;

export type AuditAction =
  | 'WORKFLOW_CREATED'
  | 'PLAN_GENERATED'
  | 'WORKFLOW_STARTED'
  | 'TOOL_DISPATCHED'
  | 'APPROVAL_REQUESTED'
  | 'HUMAN_APPROVED'
  | 'HUMAN_REJECTED'
  | 'TOOL_EXECUTED'
  | 'STEP_FAILED'
  | 'STEP_RETRIED'
  | 'WORKFLOW_COMPLETED'
  | 'WORKFLOW_ABORTED';

export interface AuditLog {
  id: string;
  workflow_id: string;
  step_id?: string | null;
  actor: AuditActor;
  action: AuditAction | string;
  details: Record<string, unknown> | string | null;
  result: 'SUCCESS' | 'FAILURE' | 'INFO';
  created_at: string;
}

// API Contract Types matching CONVENTIONS.md Section J
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// Workflow creation & execution payloads
export interface CreateWorkflowRequest {
  goal: string;
  user_id?: string;
}

export interface PlannedStepPreview {
  step_order: number;
  tool_name: string;
  arguments: Record<string, unknown>;
  reasoning: string;
  requires_approval: boolean;
  risk_level: ToolRiskLevel;
}

export interface CreateWorkflowResponse {
  workflow: Workflow;
  plan: PlannedStepPreview[];
}
