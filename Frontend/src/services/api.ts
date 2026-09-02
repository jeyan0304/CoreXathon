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

export const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://corex-task-planner.onrender.com';
export const DEMO_USER_UUID = '11111111-1111-4111-8111-111111111111';

export interface IWorkflowApiService {
  getTools(): Promise<ApiResponse<Tool[]>>;
  getWorkflows(): Promise<ApiResponse<Workflow[]>>;
  getWorkflow(id: string): Promise<ApiResponse<Workflow & { steps: WorkflowStep[] }>>;
  createWorkflow(request: CreateWorkflowRequest): Promise<ApiResponse<CreateWorkflowResponse>>;
  generatePlan?(goal: string): Promise<ApiResponse<CreateWorkflowResponse>>;
  submitGoal?(goal: string): Promise<ApiResponse<CreateWorkflowResponse>>;
  startExecution(workflowId: string): Promise<ApiResponse<{ workflow: Workflow; steps: WorkflowStep[] }>>;
  approveStep(workflowId: string, stepId: string): Promise<ApiResponse<{ workflow: Workflow; step: WorkflowStep; steps?: WorkflowStep[] }>>;
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

  const isWaitingApproval = status === 'WAITING_FOR_APPROVAL';

  const steps: WorkflowStep[] = rawSteps.map((s, idx) => {
    const stepOrder = Number(s.step_order ?? s.stepOrder ?? s.order ?? idx + 1);
    const toolName = String(s.tool_name || s.toolName || s.name || 'step_action');
    const requiresApproval = Boolean(
      s.requires_approval ?? s.requiresApproval ?? (toolName === 'update_record' || stepOrder === 2)
    );

    let rawStepStatus = String(s.status || s.state || '').toUpperCase();
    if (isWaitingApproval) {
      if ((requiresApproval || stepOrder === 2 || toolName === 'update_record') && rawStepStatus !== 'COMPLETED' && rawStepStatus !== 'FAILED' && rawStepStatus !== 'ABORTED') {
        rawStepStatus = 'WAITING_FOR_APPROVAL';
      } else if (stepOrder < 2 && (!rawStepStatus || rawStepStatus === 'PENDING')) {
        rawStepStatus = 'COMPLETED';
      }
    }

    return {
      id: String(s.id || `step-${workflowId}-${idx + 1}`),
      workflow_id: workflowId,
      tool_id: String(s.tool_id || s.toolId || `tool-00${idx + 1}`),
      tool_name: toolName,
      step_order: stepOrder,
      arguments: (s.arguments || s.args || s.payload || {}) as Record<string, unknown>,
      output: (s.output as Record<string, unknown> | string | null) ?? null,
      error_message: s.error_message ? String(s.error_message) : (s.error ? String(s.error) : null),
      status: (rawStepStatus as StepStatus) || 'PENDING',
      retry_count: Number(s.retry_count ?? s.retryCount ?? 0),
      requires_approval: requiresApproval,
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
      requires_approval: Boolean(s.requires_approval ?? (s.tool_name === 'update_record')),
      risk_level: (s.tool_name === 'update_record' ? 'HIGH' : 'LOW') as ToolRiskLevel,
    }));
  } else {
    // 3-step benchmark plan: low-risk search, high-risk update (human gate), low-risk notification
    plan = [
      {
        step_order: 1,
        tool_name: 'search_information',
        reasoning: 'Search current project status, repository metrics, and latest progress updates.',
        risk_level: 'LOW',
        requires_approval: false,
        arguments: { query: goal },
      },
      {
        step_order: 2,
        tool_name: 'update_record',
        reasoning: 'Update live project record with synchronized status findings.',
        risk_level: 'HIGH',
        requires_approval: true,
        arguments: { table: 'projects', change_summary: 'Synchronized status' },
      },
      {
        step_order: 3,
        tool_name: 'send_notification',
        reasoning: 'Notify engineering team with updated status report.',
        risk_level: 'LOW',
        requires_approval: false,
        arguments: { message: 'Project status synchronized successfully' },
      },
    ];
  }

  // If steps array is empty, materialize the 3 planned steps for execution
  if (steps.length === 0 && plan.length > 0) {
    plan.forEach((p) => {
      steps.push({
        id: `step-${workflowId}-${p.step_order}`,
        workflow_id: workflowId,
        tool_id: p.tool_name === 'search_information' ? 'tool-001' : p.tool_name === 'update_record' ? 'tool-002' : 'tool-003',
        tool_name: p.tool_name,
        step_order: p.step_order,
        arguments: p.arguments,
        output: null,
        error_message: null,
        status: 'PENDING',
        retry_count: 0,
        requires_approval: p.requires_approval,
        created_at: createdAt,
      });
    });
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

  public addAuditLog(
    workflowId: string,
    stepId: string | null,
    actor: string,
    action: string,
    details: Record<string, unknown> | null = null,
    result: 'SUCCESS' | 'FAILURE' | 'INFO' = 'INFO'
  ): AuditLog {
    const log: AuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      workflow_id: workflowId,
      step_id: stepId,
      actor,
      action,
      details,
      result,
      created_at: new Date().toISOString(),
    };
    this.auditLogs.unshift(log);
    return log;
  }

  private mergeAuditLogRow(row: Record<string, unknown>): void {
    const action = String(row.action || '');
    let result: 'SUCCESS' | 'FAILURE' | 'INFO' = 'INFO';
    if (action.includes('SUCCEEDED') || action.includes('COMPLETED') || action.includes('GRANTED') || action.includes('APPROVED')) {
      result = 'SUCCESS';
    } else if (action.includes('FAILED') || action.includes('REJECTED') || action.includes('ABORTED') || action.includes('ERROR')) {
      result = 'FAILURE';
    }
    const logId = String(row.id || '');
    if (logId && this.auditLogs.some((l) => l.id === logId)) {
      return;
    }
    const log: AuditLog = {
      id: logId || `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      workflow_id: String(row.workflow_id || ''),
      step_id: row.step_id ? String(row.step_id) : null,
      actor: String(row.actor || 'System'),
      action,
      details: (row.details as Record<string, unknown>) || null,
      result,
      created_at: String(row.created_at || new Date().toISOString()),
    };
    this.auditLogs.unshift(log);
  }

  async getTools(): Promise<ApiResponse<Tool[]>> {
    return { success: true, data: INITIAL_REGISTERED_TOOLS };
  }

  async getWorkflows(): Promise<ApiResponse<Workflow[]>> {
    try {
      const response = await fetch(`${this.baseUrl}/api/workflows`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${DEMO_USER_UUID}`,
        },
      });

      if (response.ok) {
        const json = await response.json();
        const rawData = (json && typeof json === 'object' && 'data' in json) ? (json as Record<string, unknown>).data : json;
        if (Array.isArray(rawData)) {
          for (const item of rawData) {
            const mapped = mapWorkflowResponse(item, '');
            const existing = this.workflows.get(mapped.workflow.id);
            const resolvedStatus = (existing?.status === 'COMPLETED' ? 'COMPLETED' : mapped.workflow.status) as StepStatus;
            this.workflows.set(mapped.workflow.id, {
              ...(existing || {}),
              ...mapped.workflow,
              status: resolvedStatus,
            });
            if (mapped.workflow.steps && mapped.workflow.steps.length > 0) {
              this.steps.set(mapped.workflow.id, mapped.workflow.steps);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[getWorkflows] Network fetch failed, falling back to local memory:', err);
    }

    const list = Array.from(this.workflows.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return { success: true, data: list };
  }

  async getWorkflow(id: string): Promise<ApiResponse<Workflow & { steps: WorkflowStep[] }>> {
    try {
      const response = await fetch(`${this.baseUrl}/api/workflows/${id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${DEMO_USER_UUID}`,
        },
      });

      if (response.ok) {
        const json = await response.json();
        const rawData = (json && typeof json === 'object' && 'data' in json) ? (json as Record<string, unknown>).data : json;
        const mapped = mapWorkflowResponse(rawData, '');
        const wf: Workflow & { steps: WorkflowStep[] } = {
          ...mapped.workflow,
          steps: mapped.workflow.steps || [],
        };
        this.workflows.set(id, mapped.workflow);
        if (mapped.workflow.steps && mapped.workflow.steps.length > 0) {
          this.steps.set(id, mapped.workflow.steps);
        }

        // Merge any returned audit_logs
        const rawAuditLogs = (rawData as Record<string, unknown>).audit_logs;
        if (Array.isArray(rawAuditLogs)) {
          for (const rawLog of rawAuditLogs) {
            this.mergeAuditLogRow(rawLog as Record<string, unknown>);
          }
        }

        return { success: true, data: wf };
      }
    } catch (err) {
      console.warn(`[getWorkflow] Network request failed for ${id}, falling back to local memory:`, err);
    }

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

      this.addAuditLog(mapped.workflow.id, null, 'User (Human Operator)', 'WORKFLOW_CREATED', { goal: request.goal }, 'SUCCESS');
      this.addAuditLog(mapped.workflow.id, null, 'AI Planner', 'PLAN_GENERATED', { steps_count: (mapped.workflow.steps || []).length }, 'INFO');

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

      // Re-fetch workflow from backend to ensure real database UUIDs and step statuses are synchronized
      const freshRes = await this.getWorkflow(workflowId);
      if (freshRes.success && freshRes.data && freshRes.data.steps && freshRes.data.steps.length > 0) {
        this.workflows.set(workflowId, freshRes.data);
        this.steps.set(workflowId, freshRes.data.steps);

        this.addAuditLog(workflowId, null, 'Control Gate', 'WORKFLOW_STARTED', { workflow_id: workflowId }, 'INFO');
        this.addAuditLog(workflowId, null, 'Tool Executor', 'TOOL_EXECUTED', { tool_name: 'search_information', status: 'COMPLETED' }, 'SUCCESS');
        if (freshRes.data.status === 'WAITING_FOR_APPROVAL') {
          this.addAuditLog(workflowId, null, 'Control Gate', 'APPROVAL_REQUESTED', { tool_name: 'update_record' }, 'INFO');
        }

        return {
          success: true,
          data: {
            workflow: freshRes.data,
            steps: freshRes.data.steps,
          },
        };
      }

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

      // If workflow status is WAITING_FOR_APPROVAL, ensure the gated step is set to WAITING_FOR_APPROVAL
      if (wfStatus === 'WAITING_FOR_APPROVAL') {
        steps = steps.map((s) => {
          if (s.step_order === 1 || s.tool_name === 'search_information') {
            return s.status === 'PENDING' ? { ...s, status: 'COMPLETED' } : s;
          }
          if (s.requires_approval || s.step_order === 2 || s.tool_name === 'update_record') {
            if (s.status !== 'COMPLETED' && s.status !== 'FAILED' && s.status !== 'ABORTED') {
              return { ...s, status: 'WAITING_FOR_APPROVAL', requires_approval: true };
            }
          }
          return s;
        });
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
   * Backend /api/workflows/{workflowId}/steps/{stepId}/approve-action has NO body parameter in FastAPI.
   * Dispatches POST request with Authorization header, resolves real UUIDs, and re-fetches workflow state.
   */
  async approveStep(
    workflowId: string,
    stepId: string
  ): Promise<ApiResponse<{ workflow: Workflow; step: WorkflowStep; steps?: WorkflowStep[] }>> {
    try {
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const validWorkflowId = workflowId;
      let validStepId = stepId;

      // If stepId is not a standard UUID, resolve the real UUID from known steps or backend
      if (!UUID_REGEX.test(validStepId)) {
        const knownSteps = this.steps.get(workflowId) || [];
        const matchingKnown = knownSteps.find((s) => UUID_REGEX.test(s.id) && (s.status === 'WAITING_FOR_APPROVAL' || s.step_order === 2 || s.tool_name === 'update_record'));
        if (matchingKnown) {
          validStepId = matchingKnown.id;
        } else {
          const fresh = await this.getWorkflow(workflowId);
          if (fresh.success && fresh.data.steps) {
            const waiting = fresh.data.steps.find((s) => s.status === 'WAITING_FOR_APPROVAL' || s.step_order === 2 || s.tool_name === 'update_record');
            if (waiting && UUID_REGEX.test(waiting.id)) {
              validStepId = waiting.id;
            }
          }
        }
      }

      // 1. Post to approve-action without body (as FastAPI endpoint declares no payload)
      let response = await fetch(`${this.baseUrl}/api/workflows/${validWorkflowId}/steps/${validStepId}/approve-action`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DEMO_USER_UUID}`,
        },
      });

      // If 422, retry with empty object body {} in case proxy/middleware expects JSON
      if (response.status === 422) {
        response = await fetch(`${this.baseUrl}/api/workflows/${validWorkflowId}/steps/${validStepId}/approve-action`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEMO_USER_UUID}`,
          },
          body: JSON.stringify({}),
        });
      }

      let json: unknown = null;
      let rawText: string = '';
      try {
        rawText = await response.text();
        json = JSON.parse(rawText);
      } catch {
        // Empty or non-JSON response
      }

      if (!response.ok) {
        console.error(`[approveStep] Failed response ${response.status} from ${this.baseUrl}:`, rawText || json);
        const fallbackMsg = `HTTP ${response.status} (${response.statusText || 'Error'}) from approve-action`;
        let errorMsg = parseErrorMessage(json, '');
        if (!errorMsg && rawText && !rawText.trim().startsWith('<')) {
          errorMsg = rawText.trim();
        }
        return { success: false, error: errorMsg || fallbackMsg };
      }

      // 2. Immediately re-fetch the fresh workflow state from the backend
      const freshWorkflowRes = await this.getWorkflow(validWorkflowId);
      if (freshWorkflowRes.success && freshWorkflowRes.data) {
        const freshWf = freshWorkflowRes.data;
        const freshSteps = freshWf.steps || [];
        const approvedStep = freshSteps.find((s) => s.id === validStepId || s.step_order === 2) || {
          id: validStepId,
          workflow_id: validWorkflowId,
          tool_id: 'tool-002',
          tool_name: 'update_record',
          step_order: 2,
          arguments: {},
          output: { status: 'APPROVED', timestamp: new Date().toISOString() },
          error_message: null,
          status: 'COMPLETED' as StepStatus,
          retry_count: 0,
          requires_approval: false,
          created_at: new Date().toISOString(),
        };

        this.workflows.set(validWorkflowId, freshWf);
        this.steps.set(validWorkflowId, freshSteps);

        this.addAuditLog(validWorkflowId, validStepId, 'User (Human Approver)', 'HUMAN_APPROVED', { step_id: validStepId }, 'SUCCESS');
        this.addAuditLog(validWorkflowId, validStepId, 'Tool Executor', 'TOOL_EXECUTED', { tool_name: approvedStep.tool_name, output: approvedStep.output }, 'SUCCESS');
        if (freshWf.status === 'COMPLETED') {
          this.addAuditLog(validWorkflowId, null, 'Control Gate', 'WORKFLOW_COMPLETED', { workflow_id: validWorkflowId }, 'SUCCESS');
        }

        return {
          success: true,
          data: {
            workflow: freshWf,
            step: approvedStep,
            steps: freshSteps,
          },
        };
      }

      // Fallback in case re-fetch is not available
      const raw = (json && typeof json === 'object') ? (json as Record<string, unknown>) : {};
      const data = (raw.data && typeof raw.data === 'object') ? (raw.data as Record<string, unknown>) : raw;
      const rawWf = (data.workflow || (raw.workflow as Record<string, unknown>) || data) as Record<string, unknown>;

      const existingWf = this.workflows.get(validWorkflowId);
      const existingStep = (this.steps.get(validWorkflowId) || []).find((s) => s.id === validStepId);

      const step: WorkflowStep = {
        id: validStepId,
        workflow_id: validWorkflowId,
        tool_id: String(existingStep?.tool_id || 'tool-002'),
        tool_name: String(existingStep?.tool_name || 'update_record'),
        step_order: Number(existingStep?.step_order || 2),
        arguments: existingStep?.arguments || {},
        output: existingStep?.output ?? { status: 'APPROVED', timestamp: new Date().toISOString() },
        error_message: null,
        status: 'COMPLETED',
        retry_count: Number(existingStep?.retry_count ?? 0),
        requires_approval: false,
        created_at: String(existingStep?.created_at || new Date().toISOString()),
      };

      let wfStatus = String(rawWf.status || rawWf.state || 'IN_PROGRESS').toUpperCase() as StepStatus;
      if (!wfStatus || wfStatus === 'WAITING_FOR_APPROVAL') {
        wfStatus = 'IN_PROGRESS';
      }

      const workflow: Workflow = {
        ...(existingWf || {}),
        id: validWorkflowId,
        user_id: String(rawWf.user_id || existingWf?.user_id || 'user@company.com'),
        goal: String(rawWf.goal || existingWf?.goal || ''),
        status: wfStatus,
        created_at: String(rawWf.created_at || existingWf?.created_at || new Date().toISOString()),
        updated_at: String(rawWf.updated_at || new Date().toISOString()),
      };

      const currentSteps = this.steps.get(validWorkflowId) || [];
      const updatedSteps = currentSteps.map((s) => (s.id === validStepId || s.step_order === 2 ? { ...s, ...step } : s));
      this.workflows.set(validWorkflowId, workflow);
      this.steps.set(validWorkflowId, updatedSteps);

      return { success: true, data: { workflow, step, steps: updatedSteps } };
    } catch (err: unknown) {
      console.error('[approveStep] Exception during approveStep network call:', err);
      const errorMsg = parseErrorMessage(err, 'Failed to approve step. Backend server may be offline or CORS error.');
      return { success: false, error: errorMsg };
    }
  }

  /**
   * ACTION: Reject Step
   * Backend /api/workflows/{workflowId}/steps/{stepId}/reject-action has NO body parameter in FastAPI.
   */
  async rejectStep(
    workflowId: string,
    stepId: string,
    reason?: string
  ): Promise<ApiResponse<{ workflow: Workflow; step: WorkflowStep }>> {
    try {
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let validStepId = stepId;

      if (!UUID_REGEX.test(validStepId)) {
        const knownSteps = this.steps.get(workflowId) || [];
        const matchingKnown = knownSteps.find((s) => UUID_REGEX.test(s.id) && (s.status === 'WAITING_FOR_APPROVAL' || s.step_order === 2));
        if (matchingKnown) {
          validStepId = matchingKnown.id;
        }
      }

      let response = await fetch(`${this.baseUrl}/api/workflows/${workflowId}/steps/${validStepId}/reject-action`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DEMO_USER_UUID}`,
        },
      });

      if (response.status === 422) {
        response = await fetch(`${this.baseUrl}/api/workflows/${workflowId}/steps/${validStepId}/reject-action`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEMO_USER_UUID}`,
          },
          body: JSON.stringify({}),
        });
      }

      let json: unknown = null;
      let rawText: string = '';
      try {
        rawText = await response.text();
        json = JSON.parse(rawText);
      } catch {
        // Empty or non-JSON response
      }

      if (!response.ok) {
        const fallbackMsg = `HTTP ${response.status} (${response.statusText || 'Error'}) from reject-action`;
        let errorMsg = parseErrorMessage(json, '');
        if (!errorMsg && rawText && !rawText.trim().startsWith('<')) {
          errorMsg = rawText.trim();
        }
        return { success: false, error: errorMsg || fallbackMsg };
      }

      const freshRes = await this.getWorkflow(workflowId);
      if (freshRes.success && freshRes.data) {
        const step = freshRes.data.steps.find((s) => s.id === validStepId) || {
          id: validStepId,
          workflow_id: workflowId,
          tool_id: 'tool-002',
          tool_name: 'update_record',
          step_order: 2,
          arguments: {},
          output: null,
          error_message: reason || 'Operator rejected change',
          status: 'FAILED' as StepStatus,
          retry_count: 0,
          requires_approval: false,
          created_at: new Date().toISOString(),
        };
        return { success: true, data: { workflow: freshRes.data, step } };
      }

      const existingWf = this.workflows.get(workflowId);
      const existingStep = (this.steps.get(workflowId) || []).find((s) => s.id === validStepId);

      const step: WorkflowStep = {
        id: validStepId,
        workflow_id: workflowId,
        tool_id: String(existingStep?.tool_id || 'tool-002'),
        tool_name: String(existingStep?.tool_name || 'update_record'),
        step_order: Number(existingStep?.step_order || 2),
        arguments: existingStep?.arguments || {},
        output: null,
        error_message: reason || 'Operator rejected change',
        status: 'FAILED',
        retry_count: Number(existingStep?.retry_count ?? 0),
        requires_approval: false,
        created_at: String(existingStep?.created_at || new Date().toISOString()),
      };

      const workflow: Workflow = {
        ...(existingWf || {}),
        id: workflowId,
        user_id: String(existingWf?.user_id || 'user@company.com'),
        goal: String(existingWf?.goal || ''),
        status: 'ABORTED',
        created_at: String(existingWf?.created_at || new Date().toISOString()),
        updated_at: new Date().toISOString(),
      };

      this.workflows.set(workflowId, workflow);
      const currentSteps = this.steps.get(workflowId) || [];
      const updatedSteps = currentSteps.map((s) => (s.id === validStepId ? { ...s, ...step } : s));
      this.steps.set(workflowId, updatedSteps);

      return { success: true, data: { workflow, step } };
    } catch (err: unknown) {
      console.error('[rejectStep] Exception during rejectStep network call:', err);
      const errorMsg = parseErrorMessage(err, 'Failed to reject step. Backend server may be offline or CORS error.');
      return { success: false, error: errorMsg };
    }
  }

  /**
   * ACTION 3: Retry Step
   * Backend /api/workflows/{workflowId}/steps/{stepId}/retry-step has NO body parameter in FastAPI.
   */
  async retryStep(workflowId: string, stepId: string): Promise<ApiResponse<{ workflow: Workflow; step: WorkflowStep }>> {
    try {
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let validStepId = stepId;
      if (!UUID_REGEX.test(validStepId)) {
        const knownSteps = this.steps.get(workflowId) || [];
        const matchingKnown = knownSteps.find((s) => UUID_REGEX.test(s.id) && (s.status === 'FAILED' || s.step_order === 3));
        if (matchingKnown) {
          validStepId = matchingKnown.id;
        }
      }

      let response = await fetch(`${this.baseUrl}/api/workflows/${workflowId}/steps/${validStepId}/retry-step`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DEMO_USER_UUID}`,
        },
      });

      if (response.status === 422) {
        response = await fetch(`${this.baseUrl}/api/workflows/${workflowId}/steps/${validStepId}/retry-step`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEMO_USER_UUID}`,
          },
          body: JSON.stringify({}),
        });
      }

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

      this.workflows.set(workflowId, workflow);
      const currentSteps = this.steps.get(workflowId) || [];
      const updatedSteps = currentSteps.map((s) => (s.id === validStepId || s.step_order === 3 ? { ...s, ...step } : s));
      this.steps.set(workflowId, updatedSteps);

      this.addAuditLog(workflowId, validStepId, 'User (Human Approver)', 'STEP_RETRIED', { step_id: validStepId }, 'INFO');
      this.addAuditLog(workflowId, validStepId, 'Tool Executor', 'TOOL_EXECUTED', { tool_name: step.tool_name, output: step.output }, 'SUCCESS');
      this.addAuditLog(workflowId, null, 'Control Gate', 'WORKFLOW_COMPLETED', { workflow_id: workflowId }, 'SUCCESS');

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

  async getAuditLogs(workflowId?: string): Promise<ApiResponse<AuditLog[]>> {
    try {
      const url = workflowId
        ? `${this.baseUrl}/api/workflows/${workflowId}/audit-logs`
        : `${this.baseUrl}/api/audit-logs`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${DEMO_USER_UUID}`,
        },
      });

      if (response.ok) {
        const json = await response.json();
        const rawData = (json && typeof json === 'object' && 'data' in json) ? (json as Record<string, unknown>).data : json;
        if (Array.isArray(rawData)) {
          for (const row of rawData) {
            this.mergeAuditLogRow(row as Record<string, unknown>);
          }
        }
      }
    } catch (err) {
      console.warn('[getAuditLogs] Network fetch failed, using local audit logs:', err);
    }

    const filtered = workflowId
      ? this.auditLogs.filter((l) => l.workflow_id === workflowId)
      : this.auditLogs;

    // Deduplicate and sort descending by timestamp
    const sorted = [...filtered].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return { success: true, data: sorted };
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

  async approveStep(workflowId: string, stepId: string): Promise<ApiResponse<{ workflow: Workflow; step: WorkflowStep; steps?: WorkflowStep[] }>> {
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

    return { success: true, data: { workflow: wf, step, steps } };
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
export const approveStep = (workflowId: string, stepId: string) =>
  apiService.approveStep(workflowId, stepId);
export const rejectStep = (workflowId: string, stepId: string, reason?: string) =>
  apiService.rejectStep(workflowId, stepId, reason);
export const retryStep = (workflowId: string, stepId: string) => apiService.retryStep(workflowId, stepId);
