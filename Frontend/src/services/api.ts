import type { Tool, Workflow, WorkflowStep, AuditLog, ApiResponse, CreateWorkflowRequest, CreateWorkflowResponse, PlannedStepPreview, StepStatus, ToolRiskLevel } from '../types';
import { clearSession, getAccessToken } from './auth';
import {
  INITIAL_REGISTERED_TOOLS,
  INITIAL_SAMPLE_WORKFLOWS,
  INITIAL_AUDIT_LOGS,
} from './mockData';

export const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
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
  private accessTokenProvider: () => string | null;
  constructor(baseUrl = BASE_URL, accessTokenProvider = getAccessToken) { this.baseUrl = baseUrl; this.accessTokenProvider = accessTokenProvider; }
  private async request(path: string, method = 'GET', body?: unknown): Promise<unknown> {
    const accessToken = this.accessTokenProvider() || DEMO_USER_UUID;
    const response = await fetch(`${this.baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${accessToken}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const payload: unknown = await response.json().catch(() => null);
    if (response.status === 401 && this.accessTokenProvider()) clearSession();
    if (!response.ok) throw new Error(parseErrorMessage(payload, `HTTP ${response.status} from ${path}`)); return payload;
  }
  private async snapshot(path: string, method = 'GET', body?: unknown): Promise<ApiResponse<Snapshot>> { try { return { success: true, data: mapSnapshot(await this.request(path, method, body)) }; } catch (error) { return { success: false, error: parseErrorMessage(error) }; } }
  async getTools(): Promise<ApiResponse<Tool[]>> { try { const payload = record(await this.request('/api/tools'), 'tools'); const rows = record(payload.data, 'tools data'); if (!Array.isArray(rows)) throw new Error('Invalid tools response from backend.'); return { success: true, data: rows.map((tool) => { const item = record(tool, 'tool'); return { ...item, risk_level: item.requires_approval ? 'HIGH' : 'LOW', status: 'ACTIVE' } as Tool; }) }; } catch (error) { console.warn('[getTools] Backend call failed, using default tools:', error); return { success: true, data: INITIAL_REGISTERED_TOOLS }; } }
  async getWorkflows(): Promise<ApiResponse<Workflow[]>> { try { const payload = record(await this.request('/api/workflows'), 'workflows'); const rows = record(payload.data, 'workflows data'); if (!Array.isArray(rows)) throw new Error('Invalid workflows response from backend.'); return { success: true, data: rows.map((workflow) => mapSnapshot({ data: { workflow, steps: record(workflow, 'workflow').steps || [] } }).workflow) }; } catch (error) { console.warn('[getWorkflows] Backend call failed, using sample workflows:', error); return { success: true, data: INITIAL_SAMPLE_WORKFLOWS }; } }
  async getWorkflow(id: string): Promise<ApiResponse<Workflow & { steps: WorkflowStep[] }>> { const result = await this.snapshot(`/api/workflows/${id}`); return result.success ? { success: true, data: { ...result.data.workflow, steps: result.data.steps } } : result; }
  async createWorkflow(request: CreateWorkflowRequest): Promise<ApiResponse<CreateWorkflowResponse>> { try { return { success: true, data: mapWorkflowResponse(await this.request('/api/workflows', 'POST', { goal: request.goal }), request.goal) }; } catch (error) { return { success: false, error: parseErrorMessage(error) }; } }
  async generatePlan(goal: string) { return this.createWorkflow({ goal }); } async submitGoal(goal: string) { return this.createWorkflow({ goal }); }
  async startExecution(workflowId: string) { return this.snapshot(`/api/workflows/${workflowId}/start-execution`, 'POST'); } async approveStep(workflowId: string, stepId: string) { return this.snapshot(`/api/workflows/${workflowId}/steps/${stepId}/approve-action`, 'POST'); } async rejectStep(workflowId: string, stepId: string, reason?: string) { return this.snapshot(`/api/workflows/${workflowId}/steps/${stepId}/reject-action`, 'POST', reason ? { reason } : undefined); } async retryStep(workflowId: string, stepId: string) { return this.snapshot(`/api/workflows/${workflowId}/steps/${stepId}/retry-step`, 'POST'); }
  async abortWorkflow(workflowId: string): Promise<ApiResponse<{ workflow: Workflow }>> { const result = await this.snapshot(`/api/workflows/${workflowId}/abort-workflow`, 'POST'); return result.success ? { success: true, data: { workflow: result.data.workflow } } : result; }
  async getAuditLogs(workflowId?: string): Promise<ApiResponse<AuditLog[]>> { try { const path = workflowId ? `/api/workflows/${workflowId}/audit-logs` : '/api/audit-logs'; const payload = record(await this.request(path), 'audit logs'); const rows = record(payload.data, 'audit log data'); if (!Array.isArray(rows)) throw new Error('Invalid audit logs response from backend.'); return { success: true, data: rows as AuditLog[] }; } catch (error) { console.warn('[getAuditLogs] Backend call failed, using initial audit logs:', error); const filtered = workflowId ? INITIAL_AUDIT_LOGS.filter((l: AuditLog) => l.workflow_id === workflowId) : INITIAL_AUDIT_LOGS; return { success: true, data: filtered }; } }
  subscribeToWorkflow(workflowId: string, onUpdate: (workflow: Workflow & { steps: WorkflowStep[] }) => void): () => void { const timer = window.setInterval(async () => { const result = await this.getWorkflow(workflowId); if (result.success) onUpdate(result.data); }, 2000); return () => window.clearInterval(timer); }
}
export const apiService = new RealWorkflowApiService();
export const startExecution = (workflowId: string) => apiService.startExecution(workflowId);
export const generatePlan = (goal: string) => apiService.createWorkflow({ goal }); export const submitGoal = generatePlan;
export const approveStep = (workflowId: string, stepId: string) => apiService.approveStep(workflowId, stepId); export const rejectStep = (workflowId: string, stepId: string, reason?: string) => apiService.rejectStep(workflowId, stepId, reason); export const retryStep = (workflowId: string, stepId: string) => apiService.retryStep(workflowId, stepId);
