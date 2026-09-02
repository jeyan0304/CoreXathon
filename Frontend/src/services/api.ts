/**
 * API Service Layer & Contracts
 * 
 * Connected to Live Backend at BASE_URL = 'http://192.168.23.139:3000'
 * 
 * ONLY the 3 explicit actions make network calls:
 * 1. Create Workflow: POST /api/workflows
 * 2. Approve Step: POST /api/workflows/:id/steps/:stepId/approve-action
 * 3. Retry Step: POST /api/workflows/:id/steps/:stepId/retry-step
 * 
 * All read/fetch/polling functions return mock data directly without HTTP GET requests.
 */

import type {
  Tool,
  Workflow,
  WorkflowStep,
  AuditLog,
  ApiResponse,
  CreateWorkflowRequest,
  CreateWorkflowResponse,
  PlannedStepPreview,
  StepStatus,
  ToolRiskLevel,
} from '../types';
import {
  INITIAL_REGISTERED_TOOLS,
  INITIAL_SAMPLE_WORKFLOWS,
  INITIAL_AUDIT_LOGS,
} from './mockData';

export const BASE_URL = 'http://192.168.23.139:3000';
export const DEMO_USER_UUID = '11111111-1111-4111-8111-111111111111';

export interface IWorkflowApiService {
  getTools(): Promise<ApiResponse<Tool[]>>;
  getWorkflows(): Promise<ApiResponse<Workflow[]>>;
  getWorkflow(id: string): Promise<ApiResponse<Workflow & { steps: WorkflowStep[] }>>;
  createWorkflow(request: CreateWorkflowRequest): Promise<ApiResponse<CreateWorkflowResponse>>;
  generatePlan?(goal: string): Promise<ApiResponse<CreateWorkflowResponse>>;
  submitGoal?(goal: string): Promise<ApiResponse<CreateWorkflowResponse>>;
  startExecution(workflowId: string): Promise<ApiResponse<{ workflow: Workflow; steps: WorkflowStep[] }>>;
  approveStep(workflowId: string, stepId: string): Promise<ApiResponse<{ workflow: Workflow; step: WorkflowStep }>>;
  rejectStep(workflowId: string, stepId: string, reason?: string): Promise<ApiResponse<{ workflow: Workflow; step: WorkflowStep }>>;
  retryStep(workflowId: string, stepId: string): Promise<ApiResponse<{ workflow: Workflow; step: WorkflowStep }>>;
  abortWorkflow(workflowId: string): Promise<ApiResponse<{ workflow: Workflow }>>;
  getAuditLogs(workflowId?: string): Promise<ApiResponse<AuditLog[]>>;
  subscribeToWorkflow(workflowId: string, onUpdate: (workflow: Workflow & { steps: WorkflowStep[] }) => void): () => void;
}

/**
 * Safely extracts a readable string from any error object, JSON payload, or HTTP response.
 * Checks for nested message properties (e.g., err.response?.data?.message, err.message,
 * data.error.message, or fallback to JSON.stringify(err)) to ensure the returned
 * value is always strictly a string and NEVER '[object Object]'.
 */
export function parseErrorMessage(error: unknown, fallback: string = 'An unexpected error occurred'): string {
  if (!error) return fallback;

  // 1. Primitive string
  if (typeof error === 'string') {
    const trimmed = error.trim();
    if (trimmed && trimmed !== '[object Object]') {
      return trimmed;
    }
    return fallback;
  }

  // 2. Error instance
  if (error instanceof Error) {
    if (error.message && typeof error.message === 'string' && error.message.trim() && error.message !== '[object Object]') {
      return error.message.trim();
    }
  }

  // 3. Object / JSON payload
  if (typeof error === 'object') {
    const obj = error as Record<string, unknown>;

    // Check nested response.data (e.g. err.response?.data?.message)
    if (obj.response && typeof obj.response === 'object') {
      const resp = obj.response as Record<string, unknown>;
      if (resp.data) {
        if (typeof resp.data === 'string' && resp.data.trim() && resp.data !== '[object Object]') {
          return resp.data.trim();
        }
        if (typeof resp.data === 'object') {
          const data = resp.data as Record<string, unknown>;
          if (typeof data.message === 'string' && data.message.trim()) return data.message.trim();
          if (typeof data.error === 'string' && data.error.trim()) return data.error.trim();
          if (data.error && typeof data.error === 'object') {
            const nestedErr = data.error as Record<string, unknown>;
            if (typeof nestedErr.message === 'string' && nestedErr.message.trim()) return nestedErr.message.trim();
            if (typeof nestedErr.details === 'string' && nestedErr.details.trim()) return nestedErr.details.trim();
          }
        }
      }
      if (typeof resp.statusText === 'string' && resp.statusText.trim()) {
        return `Server Error: ${resp.statusText}`;
      }
    }

    // Check direct data property (e.g. err.data?.message)
    if (obj.data && typeof obj.data === 'object') {
      const data = obj.data as Record<string, unknown>;
      if (typeof data.message === 'string' && data.message.trim()) return data.message.trim();
      if (typeof data.error === 'string' && data.error.trim()) return data.error.trim();
      if (data.error && typeof data.error === 'object') {
        const nestedErr = data.error as Record<string, unknown>;
        if (typeof nestedErr.message === 'string' && nestedErr.message.trim()) return nestedErr.message.trim();
        if (typeof nestedErr.details === 'string' && nestedErr.details.trim()) return nestedErr.details.trim();
      }
    }

    // Check direct .message property
    if (typeof obj.message === 'string' && obj.message.trim() && obj.message !== '[object Object]') {
      return obj.message.trim();
    }

    // Check direct .error property (can be string or nested object)
    if (typeof obj.error === 'string' && obj.error.trim() && obj.error !== '[object Object]') {
      return obj.error.trim();
    }
    if (obj.error && typeof obj.error === 'object') {
      const nested = obj.error as Record<string, unknown>;
      if (typeof nested.message === 'string' && nested.message.trim()) return nested.message.trim();
      if (typeof nested.details === 'string' && nested.details.trim()) return nested.details.trim();
      if (typeof nested.description === 'string' && nested.description.trim()) return nested.description.trim();
      if (typeof nested.msg === 'string' && nested.msg.trim()) return nested.msg.trim();
      try {
        const str = JSON.stringify(nested);
        if (str && str !== '{}' && str !== '[]') return str;
      } catch {
        // ignore
      }
    }

    // Check .details / .detail / .msg / .title / .statusText
    if (typeof obj.details === 'string' && obj.details.trim()) return obj.details.trim();
    if (typeof obj.detail === 'string' && obj.detail.trim()) return obj.detail.trim();
    if (typeof obj.msg === 'string' && obj.msg.trim()) return obj.msg.trim();
    if (typeof obj.title === 'string' && obj.title.trim()) return obj.title.trim();
    if (typeof obj.statusText === 'string' && obj.statusText.trim()) return String(obj.statusText).trim();

    // Fallback: JSON.stringify(obj)
    try {
      const serialized = JSON.stringify(obj);
      if (serialized && serialized !== '{}' && serialized !== '[]') {
        return serialized;
      }
    } catch {
      // ignore
    }
  }

  return fallback;
}

/**
 * Maps raw backend JSON into standard domain types so the UI doesn't break.
 */
export function mapWorkflowResponse(rawJson: unknown, goalFallback: string): CreateWorkflowResponse {
  const json = (rawJson && typeof rawJson === 'object') ? (rawJson as Record<string, unknown>) : {};
  const data = (json.data && typeof json.data === 'object') ? (json.data as Record<string, unknown>) : json;

  const rawWf = (data.workflow || data.workflowRun || data.run || data) as Record<string, unknown>;
  const rawSteps = (Array.isArray(data.steps) ? data.steps : Array.isArray(rawWf.steps) ? rawWf.steps : []) as Array<Record<string, unknown>>;
  const rawPlan = (Array.isArray(data.plan) ? data.plan : []) as Array<Record<string, unknown>>;

  const workflowId = String(rawWf.id || rawWf._id || rawWf.workflow_id || rawWf.workflowId || `wf-${Date.now().toString(36)}`);
  const goal = String(rawWf.goal || goalFallback);
  const rawStatus = String(rawWf.status || rawWf.state || data.status || json.status || '').toUpperCase();
  const status: StepStatus = (rawStatus as StepStatus) || 'PENDING';
  const userId = String(rawWf.user_id || rawWf.userId || 'user@company.com');
  const createdAt = String(rawWf.created_at || rawWf.createdAt || new Date().toISOString());
  const updatedAt = rawWf.updated_at ? String(rawWf.updated_at) : rawWf.updatedAt ? String(rawWf.updatedAt) : createdAt;

  const steps: WorkflowStep[] = rawSteps.map((s, idx) => {
    const rawStepStatus = String(s.status || s.state || '').toUpperCase();
    return {
      id: String(s.id || `step-${workflowId}-${idx + 1}`),
      workflow_id: workflowId,
      tool_id: String(s.tool_id || s.toolId || `tool-00${idx + 1}`),
      tool_name: String(s.tool_name || s.toolName || s.name || 'step_action'),
      step_order: Number(s.step_order ?? s.stepOrder ?? s.order ?? idx + 1),
      arguments: (s.arguments || s.args || s.payload || {}) as Record<string, unknown>,
      output: (s.output as Record<string, unknown> | string | null) ?? null,
      error_message: s.error_message ? String(s.error_message) : (s.error ? String(s.error) : null),
      status: (rawStepStatus as StepStatus) || 'PENDING',
      retry_count: Number(s.retry_count ?? s.retryCount ?? 0),
      created_at: s.created_at ? String(s.created_at) : createdAt,
    };
  });

  let plan: PlannedStepPreview[] = [];
  if (rawPlan.length > 0) {
    plan = rawPlan.map((p, idx) => ({
      step_order: Number(p.step_order ?? p.stepOrder ?? p.order ?? idx + 1),
      tool_name: String(p.tool_name || p.toolName || p.name || 'step_action'),
      arguments: (p.arguments || p.args || p.payload || {}) as Record<string, unknown>,
      reasoning: String(p.reasoning || p.description || `Execute ${p.tool_name || 'action'}`),
      requires_approval: Boolean(p.requires_approval ?? p.requiresApproval ?? (p.tool_name === 'update_record')),
      risk_level: ((p.risk_level || p.riskLevel) as ToolRiskLevel) || (p.tool_name === 'update_record' ? 'HIGH' : 'LOW'),
    }));
  } else if (steps.length > 0) {
    plan = steps.map((s) => ({
      step_order: s.step_order,
      tool_name: s.tool_name,
      arguments: s.arguments,
      reasoning: `Execute ${s.tool_name}`,
      requires_approval: s.tool_name === 'update_record',
      risk_level: s.tool_name === 'update_record' ? 'HIGH' : 'LOW',
    }));
  } else {
    // Fallback 3-step plan preview if steps are not yet materialized
    plan = [
      {
        step_order: 1,
        tool_name: 'search_information',
        reasoning: 'Search relevant information and records.',
        risk_level: 'LOW',
        requires_approval: false,
        arguments: { query: goal },
      },
      {
        step_order: 2,
        tool_name: 'update_record',
        reasoning: 'Update live record with verified findings.',
        risk_level: 'HIGH',
        requires_approval: true,
        arguments: { table: 'projects', change_summary: 'Synchronized status' },
      },
      {
        step_order: 3,
        tool_name: 'send_notification',
        reasoning: 'Notify designated stakeholders.',
        risk_level: 'LOW',
        requires_approval: false,
        arguments: { message: 'Status updated successfully' },
      },
    ];
  }

  const workflow: Workflow = {
    id: workflowId,
    user_id: userId,
    goal,
    status,
    created_at: createdAt,
    updated_at: updatedAt,
    steps,
  };

  return { workflow, plan };
}

/**
 * Execution Trigger API Call
 * POST ${BASE_URL}/api/workflows/${workflowId}/start-execution
 */
export async function startExecution(workflowId: string) {
  const response = await fetch(`${BASE_URL}/api/workflows/${workflowId}/start-execution`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEMO_USER_UUID}`,
    },
  });
  let json: unknown = {};
  try {
    json = await response.json();
  } catch {
    // Non-JSON or empty body
  }
  if (!response.ok) {
    throw new Error(parseErrorMessage(json, `Failed to start execution for workflow ${workflowId}`));
  }
  return json;
}

/**
 * Real API Service connected to the backend.
 * ONLY 3 explicit endpoints make network calls:
 * - Create Workflow: POST /api/workflows
 * - Approve Step: POST /api/workflows/:id/steps/:stepId/approve-action
 * - Retry Step: POST /api/workflows/:id/steps/:stepId/retry-step
 * 
 * All read/fetch/polling functions return mock data directly (NO HTTP GET requests).
 */
export class RealWorkflowApiService implements IWorkflowApiService {
  private baseUrl: string;
  private workflows: Map<string, Workflow> = new Map(
    INITIAL_SAMPLE_WORKFLOWS.map((wf) => [wf.id, wf])
  );
  private steps: Map<string, WorkflowStep[]> = new Map();
  private auditLogs: AuditLog[] = [...INITIAL_AUDIT_LOGS];

  constructor(baseUrl: string = BASE_URL) {
    this.baseUrl = baseUrl;
  }

  // Reverted to mock data - NO HTTP GET REQUEST
  async getTools(): Promise<ApiResponse<Tool[]>> {
    return { success: true, data: INITIAL_REGISTERED_TOOLS };
  }

  // Reverted to mock data - NO HTTP GET REQUEST
  async getWorkflows(): Promise<ApiResponse<Workflow[]>> {
    const list = Array.from(this.workflows.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return { success: true, data: list };
  }

  // Reverted to local memory - NO HTTP GET REQUEST
  async getWorkflow(id: string): Promise<ApiResponse<Workflow & { steps: WorkflowStep[] }>> {
    const wf = this.workflows.get(id);
    if (!wf) {
      return { success: false, error: `Workflow with ID ${id} not found.` };
    }
    const steps = this.steps.get(id) || [];
    return { success: true, data: { ...wf, steps } };
  }

  /**
   * ACTION 1: Generate Plan / Create Workflow
   * Strictly makes a POST request to ${BASE_URL}/api/workflows
   */
  async createWorkflow(request: CreateWorkflowRequest): Promise<ApiResponse<CreateWorkflowResponse>> {
    try {
      const response = await fetch(`${this.baseUrl}/api/workflows`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEMO_USER_UUID}`,
        },
        body: JSON.stringify({ goal: request.goal }),
      });

      let json: unknown = null;
      let rawText: string = '';
      try {
        rawText = await response.text();
        json = JSON.parse(rawText);
      } catch {
        // Non-JSON or empty response
      }

      if (!response.ok) {
        const fallbackMsg = `HTTP ${response.status} (${response.statusText || 'Error'}) from ${this.baseUrl}/api/workflows`;
        let errorMsg = parseErrorMessage(json, '');
        if (!errorMsg && rawText && !rawText.trim().startsWith('<')) {
          errorMsg = rawText.trim();
        }
        return { success: false, error: errorMsg || fallbackMsg };
      }

      const mapped = mapWorkflowResponse(json, request.goal);

      // Cache created workflow and steps in local memory
      this.workflows.set(mapped.workflow.id, mapped.workflow);
      this.steps.set(mapped.workflow.id, mapped.workflow.steps || []);

      return { success: true, data: mapped };
    } catch (err: unknown) {
      const errorMsg = parseErrorMessage(err, 'Failed to connect to backend at ' + this.baseUrl);
      return { success: false, error: errorMsg };
    }
  }

  async generatePlan(goal: string): Promise<ApiResponse<CreateWorkflowResponse>> {
    return this.createWorkflow({ goal });
  }

  async submitGoal(goal: string): Promise<ApiResponse<CreateWorkflowResponse>> {
    return this.createWorkflow({ goal });
  }

  /**
   * ACTION: Start Execution
   * Strictly makes a POST request to ${BASE_URL}/api/workflows/${workflowId}/start-execution
   */
  async startExecution(workflowId: string): Promise<ApiResponse<{ workflow: Workflow; steps: WorkflowStep[] }>> {
    try {
      const json = await startExecution(workflowId);
      const rawData = (json && typeof json === 'object' && 'data' in json) ? (json as Record<string, unknown>).data : json;
      const mapped = mapWorkflowResponse(rawData, '');
      const existingWf = this.workflows.get(workflowId);
      const existingSteps = this.steps.get(workflowId) || [];

      // Update workflow status directly from the start-execution API response payload (DO NOT force 'RUNNING')
      const wfStatus: StepStatus = mapped.workflow.status || existingWf?.status || 'PENDING';

      const wf: Workflow = {
        ...(existingWf || {}),
        ...mapped.workflow,
        id: workflowId,
        goal: mapped.workflow.goal || existingWf?.goal || '',
        status: wfStatus,
        updated_at: mapped.workflow.updated_at || new Date().toISOString(),
      };

      // Update step status directly from the start-execution API response payload
      let steps: WorkflowStep[];
      if (mapped.workflow.steps && mapped.workflow.steps.length > 0) {
        if (existingSteps.length > 0 && mapped.workflow.steps.length < existingSteps.length) {
          steps = existingSteps.map((es) => {
            const returnedMatch = mapped.workflow.steps?.find(
              (ms) => ms.id === es.id || ms.step_order === es.step_order || ms.tool_name === es.tool_name
            );
            return returnedMatch ? { ...es, ...returnedMatch } : es;
          });
        } else {
          steps = mapped.workflow.steps;
        }
      } else {
        steps = existingSteps;
      }

      this.workflows.set(workflowId, wf);
      this.steps.set(workflowId, steps);

      return {
        success: true,
        data: {
          workflow: wf,
          steps,
        },
      };
    } catch (err: unknown) {
      const errorMsg = parseErrorMessage(err, `Failed to start execution for workflow ${workflowId}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * ACTION 2: Approve Step
   * Strictly makes a POST request to ${BASE_URL}/api/workflows/${workflowId}/steps/${stepId}/approve-action
   * No JSON body required.
   */
  async approveStep(workflowId: string, stepId: string): Promise<ApiResponse<{ workflow: Workflow; step: WorkflowStep }>> {
    try {
      const response = await fetch(`${this.baseUrl}/api/workflows/${workflowId}/steps/${stepId}/approve-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEMO_USER_UUID}`,
        },
      });

      let json: unknown = null;
      let rawText: string = '';
      try {
        rawText = await response.text();
        json = JSON.parse(rawText);
      } catch {
        // Empty or non-JSON response
      }

      if (!response.ok) {
        const fallbackMsg = `HTTP ${response.status} (${response.statusText || 'Error'}) from approve-action`;
        let errorMsg = parseErrorMessage(json, '');
        if (!errorMsg && rawText && !rawText.trim().startsWith('<')) {
          errorMsg = rawText.trim();
        }
        return { success: false, error: errorMsg || fallbackMsg };
      }

      const raw = (json && typeof json === 'object') ? (json as Record<string, unknown>) : {};
      const data = (raw.data && typeof raw.data === 'object') ? (raw.data as Record<string, unknown>) : raw;
      const rawStep = (data.step || data) as Record<string, unknown>;
      const rawWf = (data.workflow || {}) as Record<string, unknown>;

      const step: WorkflowStep = {
        id: String(rawStep.id || stepId),
        workflow_id: workflowId,
        tool_id: String(rawStep.tool_id || rawStep.toolId || 'tool-002'),
        tool_name: String(rawStep.tool_name || rawStep.toolName || 'update_record'),
        step_order: Number(rawStep.step_order || rawStep.stepOrder || 2),
        arguments: (rawStep.arguments as Record<string, unknown>) || {},
        output: (rawStep.output as Record<string, unknown> | string) || {
          updated: true,
          timestamp: new Date().toISOString(),
          verified_by: 'Safety Checkpoint',
        },
        error_message: null,
        status: (rawStep.status as StepStatus) || 'COMPLETED',
        retry_count: Number(rawStep.retry_count || 0),
        created_at: String(rawStep.created_at || new Date().toISOString()),
      };

      const workflow: Workflow = {
        id: workflowId,
        user_id: String(rawWf.user_id || 'user@company.com'),
        goal: String(rawWf.goal || ''),
        status: (rawWf.status as StepStatus) || 'RUNNING',
        created_at: String(rawWf.created_at || new Date().toISOString()),
      };

      return { success: true, data: { workflow, step } };
    } catch (err: unknown) {
      const errorMsg = parseErrorMessage(err, 'Failed to approve step. Backend server may be offline.');
      return { success: false, error: errorMsg };
    }
  }

  async rejectStep(workflowId: string, stepId: string, reason?: string): Promise<ApiResponse<{ workflow: Workflow; step: WorkflowStep }>> {
    const step: WorkflowStep = {
      id: stepId,
      workflow_id: workflowId,
      tool_id: 'tool-002',
      tool_name: 'update_record',
      step_order: 2,
      arguments: {},
      output: null,
      error_message: reason || 'Rejected by user',
      status: 'ABORTED',
      retry_count: 0,
      created_at: new Date().toISOString(),
    };
    const workflow: Workflow = {
      id: workflowId,
      user_id: 'user@company.com',
      goal: '',
      status: 'ABORTED',
      created_at: new Date().toISOString(),
    };
    return { success: true, data: { workflow, step } };
  }

  /**
   * ACTION 3: Retry Step
   * Strictly makes a POST request to ${BASE_URL}/api/workflows/${workflowId}/steps/${stepId}/retry-step
   * No JSON body required.
   */
  async retryStep(workflowId: string, stepId: string): Promise<ApiResponse<{ workflow: Workflow; step: WorkflowStep }>> {
    try {
      const response = await fetch(`${this.baseUrl}/api/workflows/${workflowId}/steps/${stepId}/retry-step`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEMO_USER_UUID}`,
        },
      });

      let json: unknown = null;
      let rawText: string = '';
      try {
        rawText = await response.text();
        json = JSON.parse(rawText);
      } catch {
        // Empty response
      }

      if (!response.ok) {
        const fallbackMsg = `HTTP ${response.status} (${response.statusText || 'Error'}) from retry-step`;
        let errorMsg = parseErrorMessage(json, '');
        if (!errorMsg && rawText && !rawText.trim().startsWith('<')) {
          errorMsg = rawText.trim();
        }
        return { success: false, error: errorMsg || fallbackMsg };
      }

      const raw = (json && typeof json === 'object') ? (json as Record<string, unknown>) : {};
      const data = (raw.data && typeof raw.data === 'object') ? (raw.data as Record<string, unknown>) : raw;
      const rawStep = (data.step || data) as Record<string, unknown>;
      const rawWf = (data.workflow || {}) as Record<string, unknown>;

      const step: WorkflowStep = {
        id: String(rawStep.id || stepId),
        workflow_id: workflowId,
        tool_id: String(rawStep.tool_id || rawStep.toolId || 'tool-003'),
        tool_name: String(rawStep.tool_name || rawStep.toolName || 'send_notification'),
        step_order: Number(rawStep.step_order || rawStep.stepOrder || 3),
        arguments: (rawStep.arguments as Record<string, unknown>) || {},
        output: (rawStep.output as Record<string, unknown> | string) || {
          delivery_status: 'SENT',
          message_id: 'msg_slack_apollo_9921',
          delivered_at: new Date().toISOString(),
        },
        error_message: null,
        status: (rawStep.status as StepStatus) || 'COMPLETED',
        retry_count: Number(rawStep.retry_count || 1),
        created_at: String(rawStep.created_at || new Date().toISOString()),
      };

      const workflow: Workflow = {
        id: workflowId,
        user_id: String(rawWf.user_id || 'user@company.com'),
        goal: String(rawWf.goal || ''),
        status: (rawWf.status as StepStatus) || 'COMPLETED',
        created_at: String(rawWf.created_at || new Date().toISOString()),
      };

      return { success: true, data: { workflow, step } };
    } catch (err: unknown) {
      const errorMsg = parseErrorMessage(err, 'Failed to retry step. Backend server may be offline.');
      return { success: false, error: errorMsg };
    }
  }

  async abortWorkflow(workflowId: string): Promise<ApiResponse<{ workflow: Workflow }>> {
    return {
      success: true,
      data: {
        workflow: {
          id: workflowId,
          user_id: 'user@company.com',
          goal: '',
          status: 'ABORTED',
          created_at: new Date().toISOString(),
        },
      },
    };
  }

  // Reverted to mock data - NO HTTP GET REQUEST
  async getAuditLogs(_workflowId?: string): Promise<ApiResponse<AuditLog[]>> {
    return { success: true, data: this.auditLogs };
  }

  // No HTTP polling - prevents 405 Method Not Allowed
  subscribeToWorkflow(_workflowId: string, _onUpdate: (workflow: Workflow & { steps: WorkflowStep[] }) => void): () => void {
    return () => {};
  }
}

/**
 * Mock Workflow API Service (kept for offline scenarios)
 */
export class MockWorkflowApiService implements IWorkflowApiService {
  private tools: Tool[] = [...INITIAL_REGISTERED_TOOLS];
  private workflows: Map<string, Workflow> = new Map(
    INITIAL_SAMPLE_WORKFLOWS.map((wf) => [wf.id, wf])
  );
  private steps: Map<string, WorkflowStep[]> = new Map();
  private auditLogs: AuditLog[] = [...INITIAL_AUDIT_LOGS];
  private listeners: Map<string, Set<(data: Workflow & { steps: WorkflowStep[] }) => void>> = new Map();
  private deliberateFailureRecovered: Map<string, boolean> = new Map();

  private notify(workflowId: string) {
    const wf = this.workflows.get(workflowId);
    const steps = this.steps.get(workflowId) || [];
    if (wf) {
      const callbacks = this.listeners.get(workflowId);
      if (callbacks) {
        callbacks.forEach((cb) => cb({ ...wf, steps }));
      }
    }
  }

  private addAudit(workflowId: string, stepId: string | null, actor: string, action: string, details: Record<string, unknown>, result: 'SUCCESS' | 'FAILURE' | 'INFO') {
    const log: AuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      workflow_id: workflowId,
      step_id: stepId,
      actor,
      action,
      details,
      result,
      created_at: new Date().toISOString(),
    };
    this.auditLogs.unshift(log);
  }

  async getTools(): Promise<ApiResponse<Tool[]>> {
    return { success: true, data: this.tools };
  }

  async getWorkflows(): Promise<ApiResponse<Workflow[]>> {
    const list = Array.from(this.workflows.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return { success: true, data: list };
  }

  async getWorkflow(id: string): Promise<ApiResponse<Workflow & { steps: WorkflowStep[] }>> {
    const wf = this.workflows.get(id);
    if (!wf) {
      return { success: false, error: `Task with ID ${id} not found.` };
    }
    const steps = this.steps.get(id) || [];
    return { success: true, data: { ...wf, steps } };
  }

  async createWorkflow(request: CreateWorkflowRequest): Promise<ApiResponse<CreateWorkflowResponse>> {
    const workflowId = `task-${Date.now().toString(36)}`;
    const now = new Date().toISOString();

    const newWorkflow: Workflow = {
      id: workflowId,
      user_id: request.user_id || 'you@company.com',
      goal: request.goal,
      status: 'PENDING',
      created_at: now,
      updated_at: now,
    };

    const plan: PlannedStepPreview[] = [
      {
        step_order: 1,
        tool_name: 'search_information',
        reasoning: 'Find latest project status updates and notes from internal documentation.',
        risk_level: 'LOW',
        requires_approval: false,
        arguments: {
          query: 'Project Apollo Q3 status and deliverables',
          max_results: 3,
        },
      },
      {
        step_order: 2,
        tool_name: 'update_record',
        reasoning: 'Update the project record to mark status as "IN_PROGRESS_HEALTHY".',
        risk_level: 'HIGH',
        requires_approval: true,
        arguments: {
          table: 'projects',
          record_id: 'proj_apollo_09',
          change_summary: 'Updated project status to healthy after automated verification.',
          data: {
            status: 'IN_PROGRESS_HEALTHY',
            last_checked_by: 'SmartTaskPlanner',
            health_score: 98,
          },
        },
      },
      {
        step_order: 3,
        tool_name: 'send_notification',
        reasoning: 'Send a summary notification to the project team on Slack.',
        risk_level: 'LOW',
        requires_approval: false,
        arguments: {
          channel: '#engineering-apollo',
          recipient: '@apollo-leads',
          message: 'Project Apollo status check verified: Updated to IN_PROGRESS_HEALTHY (Score: 98). All systems nominal.',
          priority: 'normal',
        },
      },
    ];

    const workflowSteps: WorkflowStep[] = plan.map((p, idx) => ({
      id: `step-${workflowId}-${idx + 1}`,
      workflow_id: workflowId,
      tool_id: p.tool_name === 'search_information' ? 'tool-001' : p.tool_name === 'update_record' ? 'tool-002' : 'tool-003',
      tool_name: p.tool_name,
      step_order: p.step_order,
      arguments: p.arguments,
      output: null,
      error_message: null,
      status: 'PENDING',
      retry_count: 0,
      created_at: now,
    }));

    this.workflows.set(workflowId, newWorkflow);
    this.steps.set(workflowId, workflowSteps);

    this.addAudit(workflowId, null, 'User (You)', 'TASK_CREATED', { goal: request.goal }, 'INFO');
    this.addAudit(workflowId, null, 'AI Assistant', 'PLAN_CREATED', {
      steps_count: plan.length,
      actions: plan.map(s => s.tool_name),
      summary: 'Created 3-step plan with 1 approval checkpoint',
    }, 'SUCCESS');

    return {
      success: true,
      data: {
        workflow: newWorkflow,
        plan,
      },
    };
  }

  async generatePlan(goal: string): Promise<ApiResponse<CreateWorkflowResponse>> {
    return this.createWorkflow({ goal });
  }

  async submitGoal(goal: string): Promise<ApiResponse<CreateWorkflowResponse>> {
    return this.createWorkflow({ goal });
  }

  async startExecution(workflowId: string): Promise<ApiResponse<{ workflow: Workflow; steps: WorkflowStep[] }>> {
    const wf = this.workflows.get(workflowId);
    const steps = this.steps.get(workflowId);

    if (!wf || !steps) {
      return { success: false, error: 'Task not found.' };
    }

    wf.status = 'RUNNING';
    wf.updated_at = new Date().toISOString();
    this.addAudit(workflowId, null, 'Safety Checkpoint', 'TASK_STARTED', { mode: 'SAFE_STEP_BY_STEP' }, 'SUCCESS');
    this.notify(workflowId);

    this.executeNextStep(workflowId);

    return { success: true, data: { workflow: wf, steps } };
  }

  private async executeNextStep(workflowId: string) {
    const wf = this.workflows.get(workflowId);
    const steps = this.steps.get(workflowId);
    if (!wf || !steps || wf.status === 'ABORTED') return;

    const currentStep = steps.find((s) => s.status !== 'COMPLETED');
    if (!currentStep) {
      wf.status = 'COMPLETED';
      wf.updated_at = new Date().toISOString();
      this.addAudit(workflowId, null, 'Safety Checkpoint', 'TASK_COMPLETED', {
        message: 'All planned steps finished cleanly.',
      }, 'SUCCESS');
      this.notify(workflowId);
      return;
    }

    // Step 1: search_information
    if (currentStep.step_order === 1) {
      currentStep.status = 'RUNNING';
      this.notify(workflowId);

      setTimeout(() => {
        currentStep.status = 'COMPLETED';
        currentStep.output = {
          records_found: 2,
          matches: [
            { id: 'apollo-repo-01', title: 'Sprint 14 Apollo Milestone', status: 'ON_TRACK' },
            { id: 'apollo-db-09', title: 'Production Apollo Database Instance', health: '98%' },
          ],
          source: 'Project Documentation Search',
        };
        this.addAudit(workflowId, currentStep.id, 'Action Runner', 'ACTION_COMPLETED', {
          action: 'search_information',
          query: currentStep.arguments.query,
          results_count: 2,
        }, 'SUCCESS');
        this.notify(workflowId);

        setTimeout(() => this.executeNextStep(workflowId), 800);
      }, 1600);
      return;
    }

    // Step 2: update_record
    if (currentStep.step_order === 2) {
      if (currentStep.status === 'PENDING') {
        currentStep.status = 'RUNNING';
        this.notify(workflowId);

        setTimeout(() => {
          currentStep.status = 'WAITING_FOR_APPROVAL';
          wf.status = 'WAITING_FOR_APPROVAL';
          this.addAudit(workflowId, currentStep.id, 'Safety Checkpoint', 'APPROVAL_REQUESTED', {
            action: 'update_record',
            risk_level: 'HIGH',
            reason: 'Action updates live data. Paused for your review before anything happens.',
            details: currentStep.arguments,
          }, 'INFO');
          this.notify(workflowId);
        }, 1200);
        return;
      }
    }

    // Step 3: send_notification
    if (currentStep.step_order === 3) {
      currentStep.status = 'RUNNING';
      this.notify(workflowId);

      const isRecovered = this.deliberateFailureRecovered.get(workflowId);

      setTimeout(() => {
        if (!isRecovered) {
          currentStep.status = 'FAILED';
          currentStep.error_message = 'Temporary connection timeout while trying to send team notification.';
          wf.status = 'FAILED';
          this.addAudit(workflowId, currentStep.id, 'Action Runner', 'STEP_FAILED', {
            action: 'send_notification',
            error: currentStep.error_message,
            retry_allowed: true,
          }, 'FAILURE');
          this.notify(workflowId);
        } else {
          currentStep.status = 'COMPLETED';
          currentStep.output = {
            delivery_status: 'SENT',
            message_id: 'msg_slack_apollo_9921',
            delivered_at: new Date().toISOString(),
            recipient: currentStep.arguments.recipient,
          };
          this.addAudit(workflowId, currentStep.id, 'Action Runner', 'ACTION_COMPLETED', {
            action: 'send_notification',
            delivery_id: 'msg_slack_apollo_9921',
            status: 'SENT',
          }, 'SUCCESS');
          this.notify(workflowId);

          setTimeout(() => this.executeNextStep(workflowId), 600);
        }
      }, 1500);
      return;
    }
  }

  async approveStep(workflowId: string, stepId: string): Promise<ApiResponse<{ workflow: Workflow; step: WorkflowStep }>> {
    // Simulate brief network delay (800ms)
    await new Promise((resolve) => setTimeout(resolve, 800));

    const wf = this.workflows.get(workflowId);
    const steps = this.steps.get(workflowId);
    const step = steps?.find((s) => s.id === stepId);

    if (!wf || !steps || !step) {
      return { success: false, error: 'Step or Task not found.' };
    }

    if (step.status !== 'WAITING_FOR_APPROVAL') {
      return { success: false, error: `Step is in ${step.status} state, cannot approve.` };
    }

    this.addAudit(workflowId, stepId, 'User (You)', 'HUMAN_APPROVED', {
      action: step.tool_name,
      approved_details: step.arguments,
      approver: 'you@company.com',
    }, 'SUCCESS');

    step.status = 'COMPLETED';
    step.output = {
      updated_table: step.arguments.table,
      record_id: step.arguments.record_id,
      rows_affected: 1,
      timestamp: new Date().toISOString(),
      verified_by: 'Safety Checkpoint',
    };
    wf.status = 'RUNNING';

    this.addAudit(workflowId, stepId, 'Action Runner', 'ACTION_COMPLETED', {
      action: 'update_record',
      result: 'Record updated successfully in database',
    }, 'SUCCESS');

    // Also transition Step 3 in mock store
    const step3 = steps.find((s) => s.step_order === 3);
    if (step3) {
      step3.status = 'RUNNING';
      setTimeout(() => {
        const isRecovered = this.deliberateFailureRecovered.get(workflowId);
        if (!isRecovered) {
          step3.status = 'FAILED';
          step3.error_message = 'Temporary connection timeout while trying to send team notification.';
          wf.status = 'FAILED';
          this.addAudit(workflowId, step3.id, 'Action Runner', 'STEP_FAILED', {
            action: 'send_notification',
            error: step3.error_message,
            retry_allowed: true,
          }, 'FAILURE');
          this.notify(workflowId);
        }
      }, 1000);
    }

    this.notify(workflowId);

    return { success: true, data: { workflow: wf, step } };
  }

  async rejectStep(workflowId: string, stepId: string, reason?: string): Promise<ApiResponse<{ workflow: Workflow; step: WorkflowStep }>> {
    const wf = this.workflows.get(workflowId);
    const steps = this.steps.get(workflowId);
    const step = steps?.find((s) => s.id === stepId);

    if (!wf || !step) {
      return { success: false, error: 'Step or Task not found.' };
    }

    step.status = 'ABORTED';
    wf.status = 'ABORTED';
    this.addAudit(workflowId, stepId, 'User (You)', 'HUMAN_REJECTED', {
      action: step.tool_name,
      reason: reason || 'Change rejected by user',
    }, 'FAILURE');
    this.notify(workflowId);

    return { success: true, data: { workflow: wf, step } };
  }

  async retryStep(workflowId: string, stepId: string): Promise<ApiResponse<{ workflow: Workflow; step: WorkflowStep }>> {
    // Simulate an 800ms network delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    const wf = this.workflows.get(workflowId);
    const steps = this.steps.get(workflowId);
    const step = steps?.find((s) => s.id === stepId);

    if (!wf || !steps || !step) {
      return { success: false, error: 'Step or Task not found.' };
    }

    step.status = 'COMPLETED';
    step.retry_count += 1;
    step.error_message = null;
    step.output = {
      delivery_status: 'SENT',
      message_id: 'msg_slack_apollo_9921',
      delivered_at: new Date().toISOString(),
      recipient: step.arguments.recipient || '@apollo-leads',
    };

    wf.status = 'COMPLETED';
    wf.updated_at = new Date().toISOString();

    this.deliberateFailureRecovered.set(workflowId, true);

    this.addAudit(workflowId, stepId, 'Action Runner', 'STEP_RETRY_SUCCESS', {
      action: step.tool_name,
      attempt_number: step.retry_count,
      delivery_id: 'msg_slack_apollo_9921',
      status: 'SENT',
    }, 'SUCCESS');

    this.addAudit(workflowId, null, 'Safety Checkpoint', 'WORKFLOW_COMPLETED', {
      message: 'All planned steps finished cleanly after recovery.',
      status: 'COMPLETED',
    }, 'SUCCESS');

    this.notify(workflowId);

    return { success: true, data: { workflow: wf, step } };
  }

  async abortWorkflow(workflowId: string): Promise<ApiResponse<{ workflow: Workflow }>> {
    const wf = this.workflows.get(workflowId);
    if (!wf) {
      return { success: false, error: 'Task not found.' };
    }
    wf.status = 'ABORTED';
    this.addAudit(workflowId, null, 'User (You)', 'TASK_CANCELLED', {
      reason: 'Task cancelled by user',
    }, 'FAILURE');
    this.notify(workflowId);
    return { success: true, data: { workflow: wf } };
  }

  async getAuditLogs(workflowId?: string): Promise<ApiResponse<AuditLog[]>> {
    if (!workflowId) {
      return { success: true, data: [...this.auditLogs] };
    }
    const filtered = this.auditLogs.filter((l) => l.workflow_id === workflowId);
    return { success: true, data: filtered };
  }

  subscribeToWorkflow(workflowId: string, onUpdate: (data: Workflow & { steps: WorkflowStep[] }) => void): () => void {
    if (!this.listeners.has(workflowId)) {
      this.listeners.set(workflowId, new Set());
    }
    this.listeners.get(workflowId)!.add(onUpdate);

    const wf = this.workflows.get(workflowId);
    if (wf) {
      const steps = this.steps.get(workflowId) || [];
      onUpdate({ ...wf, steps });
    }

    return () => {
      this.listeners.get(workflowId)?.delete(onUpdate);
    };
  }
}

// Live backend instance
export const USE_REAL_BACKEND = true;
export const apiService: IWorkflowApiService = new RealWorkflowApiService(BASE_URL);
export const api = apiService;

export const generatePlan = (goal: string) => apiService.createWorkflow({ goal });
export const submitGoal = (goal: string) => apiService.createWorkflow({ goal });
export const approveStep = (workflowId: string, stepId: string) => apiService.approveStep(workflowId, stepId);
export const retryStep = (workflowId: string, stepId: string) => apiService.retryStep(workflowId, stepId);
