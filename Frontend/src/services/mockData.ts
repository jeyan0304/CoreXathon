import type { Tool, AuditLog, Workflow } from '../types';

export const INITIAL_REGISTERED_TOOLS: Tool[] = [
  {
    id: 'tool-001',
    name: 'search_information',
    description: 'Finds helpful documents, project notes, or status data in internal systems.',
    risk_level: 'LOW',
    requires_approval: false,
    status: 'ACTIVE',
    created_at: '2026-09-01T08:00:00Z',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What you want to search for.',
        },
        max_results: {
          type: 'number',
          description: 'Maximum items to retrieve (default: 5).',
          default: 5,
        },
      },
      required: ['query'],
    },
  },
  {
    id: 'tool-002',
    name: 'update_record',
    description: 'Updates live records in the database. Because this changes real data, it requires your approval before running.',
    risk_level: 'HIGH',
    requires_approval: true,
    status: 'ACTIVE',
    created_at: '2026-09-01T08:00:00Z',
    input_schema: {
      type: 'object',
      properties: {
        table: {
          type: 'string',
          description: 'Target record type (e.g. "projects", "deployments").',
        },
        record_id: {
          type: 'string',
          description: 'The specific item ID to update.',
        },
        data: {
          type: 'object',
          description: 'The new information to save.',
        },
        change_summary: {
          type: 'string',
          description: 'Plain English summary of why this change is being made.',
        },
      },
      required: ['table', 'record_id', 'data', 'change_summary'],
    },
  },
  {
    id: 'tool-003',
    name: 'send_notification',
    description: 'Sends a message or notification to a team member or chat channel.',
    risk_level: 'LOW',
    requires_approval: false,
    status: 'ACTIVE',
    created_at: '2026-09-01T08:00:00Z',
    input_schema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Target channel (e.g., "#engineering-alerts", "email").',
        },
        recipient: {
          type: 'string',
          description: 'Person or team to notify.',
        },
        message: {
          type: 'string',
          description: 'The message text.',
        },
        priority: {
          type: 'string',
          enum: ['normal', 'urgent', 'critical'],
          default: 'normal',
        },
      },
      required: ['channel', 'recipient', 'message'],
    },
  },
];

export const INITIAL_SAMPLE_WORKFLOWS: Workflow[] = [
  {
    id: 'task-demo-prev-01',
    user_id: 'sarah@company.com',
    goal: 'Audit expired database connection pools and notify on-call engineer',
    status: 'COMPLETED',
    created_at: '2026-09-02T10:15:00Z',
    updated_at: '2026-09-02T10:16:30Z',
  },
  {
    id: 'task-demo-prev-02',
    user_id: 'alex@company.com',
    goal: 'Synchronize staging metrics and generate release notes',
    status: 'COMPLETED',
    created_at: '2026-09-02T11:00:00Z',
    updated_at: '2026-09-02T11:02:10Z',
  },
];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'audit-001',
    workflow_id: 'task-demo-prev-01',
    step_id: null,
    actor: 'User (You)',
    action: 'TASK_CREATED',
    details: { goal: 'Audit expired database connection pools and notify on-call engineer' },
    result: 'INFO',
    created_at: '2026-09-02T10:15:00Z',
  },
  {
    id: 'audit-002',
    workflow_id: 'task-demo-prev-01',
    step_id: null,
    actor: 'AI Planner',
    action: 'PLAN_CREATED',
    details: { steps_count: 2, actions: ['search_information', 'send_notification'] },
    result: 'SUCCESS',
    created_at: '2026-09-02T10:15:03Z',
  },
  {
    id: 'audit-003',
    workflow_id: 'task-demo-prev-01',
    step_id: 'step-prev-01',
    actor: 'Action Runner',
    action: 'ACTION_COMPLETED',
    details: { action: 'search_information', records_found: 3 },
    result: 'SUCCESS',
    created_at: '2026-09-02T10:15:45Z',
  },
  {
    id: 'audit-004',
    workflow_id: 'task-demo-prev-01',
    step_id: 'step-prev-02',
    actor: 'Action Runner',
    action: 'ACTION_COMPLETED',
    details: { action: 'send_notification', recipient: '@on-call' },
    result: 'SUCCESS',
    created_at: '2026-09-02T10:16:25Z',
  },
  {
    id: 'audit-005',
    workflow_id: 'task-demo-prev-01',
    step_id: null,
    actor: 'Safety Checkpoint',
    action: 'TASK_COMPLETED',
    details: { total_duration_seconds: 90, status: 'COMPLETED' },
    result: 'SUCCESS',
    created_at: '2026-09-02T10:16:30Z',
  },
];
