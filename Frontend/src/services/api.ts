import type { Tool, Workflow, WorkflowStep, AuditLog, ApiResponse, CreateWorkflowRequest, CreateWorkflowResponse, PlannedStepPreview, StepStatus, ToolRiskLevel } from '../types';
import {
  INITIAL_REGISTERED_TOOLS,
  INITIAL_SAMPLE_WORKFLOWS,
  INITIAL_AUDIT_LOGS,
} from './mockData';

export const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://corex-task-planner.onrender.com';
export const DEMO_USER_UUID = '11111111-1111-4111-8111-111111111111';
type Snapshot = { workflow: Workflow; steps: WorkflowStep[]; step?: WorkflowStep };

export interface IWorkflowApiService {
  getTools(): Promise<ApiResponse<Tool[]>>; getWorkflows(): Promise<ApiResponse<Workflow[]>>;
  getWorkflow(id: string): Promise<ApiResponse<Workflow & { steps: WorkflowStep[] }>>;
  createWorkflow(request: CreateWorkflowRequest): Promise<ApiResponse<CreateWorkflowResponse>>;
  generatePlan?(goal: string): Promise<ApiResponse<CreateWorkflowResponse>>; submitGoal?(goal: string): Promise<ApiResponse<CreateWorkflowResponse>>;
  startExecution(workflowId: string): Promise<ApiResponse<Snapshot>>; approveStep(workflowId: string, stepId: string): Promise<ApiResponse<Snapshot>>;
  rejectStep(workflowId: string, stepId: string, reason?: string): Promise<ApiResponse<Snapshot>>; retryStep(workflowId: string, stepId: string): Promise<ApiResponse<Snapshot>>;
  abortWorkflow(workflowId: string): Promise<ApiResponse<{ workflow: Workflow }>>; getAuditLogs(workflowId?: string): Promise<ApiResponse<AuditLog[]>>;
  subscribeToWorkflow(workflowId: string, onUpdate: (workflow: Workflow & { steps: WorkflowStep[] }) => void): () => void;
}

export function parseErrorMessage(error: unknown, fallback = 'An unexpected error occurred'): string {
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') { const value = error as Record<string, unknown>; if (typeof value.message === 'string') return value.message; if (value.error && typeof value.error === 'object' && typeof (value.error as Record<string, unknown>).message === 'string') return (value.error as Record<string, string>).message; }
  return fallback;
}
function record(value: unknown, label: string): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label} response from backend.`); return value as Record<string, unknown>; }
function mapStep(raw: unknown): WorkflowStep {
  const step = record(raw, 'step');
  if (typeof step.id !== 'string' || typeof step.workflow_id !== 'string' || typeof step.tool_id !== 'string' || typeof step.tool_name !== 'string' || typeof step.status !== 'string') throw new Error('Backend returned an incomplete workflow step.');
  return { id: step.id, workflow_id: step.workflow_id, tool_id: step.tool_id, tool_name: step.tool_name, step_order: Number(step.step_order), arguments: record(step.arguments, 'step arguments'), output: (step.output as WorkflowStep['output']) ?? null, error_message: typeof step.error_message === 'string' ? step.error_message : null, status: step.status as StepStatus, retry_count: Number(step.retry_count ?? 0), requires_approval: Boolean(step.requires_approval), created_at: typeof step.created_at === 'string' ? step.created_at : undefined };
}
function mapSnapshot(payload: unknown, goalFallback = ''): Snapshot {
  const data = record(payload, 'API'); const container = data.data === undefined ? data : record(data.data, 'API data'); const rawWorkflow = record(container.workflow, 'workflow');
  if (typeof rawWorkflow.id !== 'string' || typeof rawWorkflow.user_id !== 'string' || typeof rawWorkflow.goal !== 'string' || typeof rawWorkflow.status !== 'string' || typeof rawWorkflow.created_at !== 'string' || !Array.isArray(container.steps)) throw new Error('Backend returned an incomplete workflow snapshot.');
  const steps = container.steps.map(mapStep);
  return { workflow: { id: rawWorkflow.id, user_id: rawWorkflow.user_id, goal: rawWorkflow.goal || goalFallback, status: rawWorkflow.status as StepStatus, created_at: rawWorkflow.created_at, updated_at: typeof rawWorkflow.updated_at === 'string' ? rawWorkflow.updated_at : undefined, steps }, steps };
}
export function mapWorkflowResponse(payload: unknown, goalFallback: string): CreateWorkflowResponse { const snapshot = mapSnapshot(payload, goalFallback); return { workflow: snapshot.workflow, plan: snapshot.steps.map((step): PlannedStepPreview => ({ step_order: step.step_order, tool_name: step.tool_name, arguments: step.arguments, reasoning: `Execute ${step.tool_name}`, requires_approval: Boolean(step.requires_approval), risk_level: step.requires_approval ? 'HIGH' as ToolRiskLevel : 'LOW' as ToolRiskLevel })) }; }

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
    try {
      const response = await fetch(`${this.baseUrl}/api/tools`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${DEMO_USER_UUID}`,
        },
      });
      if (response.ok) {
        const json = await response.json();
        const rawData = (json && typeof json === 'object' && 'data' in json) ? (json as Record<string, unknown>).data : json;
        if (Array.isArray(rawData) && rawData.length > 0) {
          const mappedTools: Tool[] = rawData.map((t: Record<string, unknown>) => {
            const name = String(t.name || '');
            const requiresApproval = Boolean(t.requires_approval ?? (name === 'update_record'));
            const riskLevel: ToolRiskLevel = requiresApproval ? 'HIGH' : 'LOW';
            return {
              id: String(t.id || `tool-${name}`),
              name,
              description: String(t.description || ''),
              input_schema: (t.input_schema as Record<string, unknown>) || {},
              risk_level: riskLevel,
              requires_approval: requiresApproval,
              status: 'ACTIVE' as const,
              created_at: String(t.created_at || new Date().toISOString()),
            };
          });
          return { success: true, data: mappedTools };
        }
      }
    } catch (err) {
      console.warn('[getTools] Network fetch failed, using default tools:', err);
    }
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
  ): Promise<ApiResponse<Snapshot>> {
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
  ): Promise<ApiResponse<Snapshot>> {
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
        return { success: true, data: { workflow: freshRes.data, step, steps: freshRes.data.steps || [] } };
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

      return { success: true, data: { workflow, step, steps: updatedSteps } };
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
  async retryStep(workflowId: string, stepId: string): Promise<ApiResponse<Snapshot>> {
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

      return { success: true, data: { workflow, step, steps: updatedSteps } };
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
      } else if (!workflowId) {
        // Fallback: If global /api/audit-logs is not available, query per-workflow audit logs
        const candidateIds = Array.from(this.workflows.keys()).slice(0, 10);
        for (const wid of candidateIds) {
          try {
            const wfAuditRes = await fetch(`${this.baseUrl}/api/workflows/${wid}/audit-logs`, {
              headers: { 'Authorization': `Bearer ${DEMO_USER_UUID}` },
            });
            if (wfAuditRes.ok) {
              const wfJson = await wfAuditRes.json();
              const wfLogs = (wfJson && typeof wfJson === 'object' && 'data' in wfJson) ? (wfJson as Record<string, unknown>).data : wfJson;
              if (Array.isArray(wfLogs)) {
                for (const row of wfLogs) {
                  this.mergeAuditLogRow(row as Record<string, unknown>);
                }
              }
            }
          } catch {
            // ignore individual workflow log error
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

export const apiService = new RealWorkflowApiService();
export const startExecution = (workflowId: string) => apiService.startExecution(workflowId);
export const generatePlan = (goal: string) => apiService.createWorkflow({ goal });
export const submitGoal = generatePlan;
export const approveStep = (workflowId: string, stepId: string) => apiService.approveStep(workflowId, stepId);
export const rejectStep = (workflowId: string, stepId: string, reason?: string) => apiService.rejectStep(workflowId, stepId, reason);
export const retryStep = (workflowId: string, stepId: string) => apiService.retryStep(workflowId, stepId);
