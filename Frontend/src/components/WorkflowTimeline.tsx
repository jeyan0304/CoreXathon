import React, { useState } from 'react';
import type { WorkflowStep, StepStatus } from '../types';
import { StatusBadge } from './StatusBadge';
import { ApprovalCard } from './ApprovalCard';
import { RecoveryBox } from './RecoveryBox';
import {
  CheckCircle2,
  Clock,
  Loader2,
  AlertTriangle,
  XCircle,
  RotateCcw,
  Ban,
  ChevronDown,
  ChevronUp,
  FileCode2,
} from 'lucide-react';

interface WorkflowTimelineProps {
  steps: WorkflowStep[];
  workflowStatus?: StepStatus;
  onApprove: (stepId: string) => Promise<void> | void;
  onReject: (stepId: string, reason?: string) => Promise<void> | void;
  onRetry: (stepId: string) => Promise<void> | void;
  onAbort?: (workflowId: string) => Promise<void> | void;
  isActionLoading?: boolean;
}

export const WorkflowTimeline: React.FC<WorkflowTimelineProps> = ({
  steps,
  workflowStatus,
  onApprove,
  onReject,
  onRetry,
  onAbort,
  isActionLoading = false,
}) => {
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});

  const toggleDetails = (stepId: string) => {
    setExpandedDetails((prev) => ({
      ...prev,
      [stepId]: !prev[stepId],
    }));
  };

  const getStepIndicator = (step: WorkflowStep, isWaitingApproval: boolean) => {
    if (isWaitingApproval) {
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white shadow ring-4 ring-amber-100 animate-pulse">
          <AlertTriangle className="h-5 w-5" />
        </div>
      );
    }
    switch (step.status) {
      case 'COMPLETED':
        return (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white shadow ring-4 ring-emerald-50">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        );
      case 'RUNNING':
        return (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white shadow ring-4 ring-blue-50">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        );
      case 'WAITING_FOR_APPROVAL':
        return (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white shadow ring-4 ring-amber-100 animate-pulse">
            <AlertTriangle className="h-5 w-5" />
          </div>
        );
      case 'FAILED':
        return (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-600 text-white shadow ring-4 ring-rose-100">
            <XCircle className="h-5 w-5" />
          </div>
        );
      case 'RETRYING':
        return (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white shadow ring-4 ring-indigo-50">
            <RotateCcw className="h-5 w-5 animate-spin" />
          </div>
        );
      case 'ABORTED':
        return (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-500 text-white shadow ring-4 ring-gray-100">
            <Ban className="h-5 w-5" />
          </div>
        );
      case 'PENDING':
      default:
        return (
          <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-slate-400">
            <Clock className="h-4 w-4" />
          </div>
        );
    }
  };

  if (!steps || steps.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
        No tasks started yet. Type a goal above to create a plan.
      </div>
    );
  }

  return (
    <div className="relative pl-6 space-y-8 before:absolute before:left-[19px] before:top-4 before:bottom-4 before:w-[2px] before:bg-slate-200">
      {steps.map((step) => {
        const isStepAwaitingApproval =
          step.status === 'WAITING_FOR_APPROVAL' ||
          (workflowStatus === 'WAITING_FOR_APPROVAL' &&
            (step.requires_approval || step.tool_name === 'update_record' || step.step_order === 2));
        const isWaitingApproval = isStepAwaitingApproval;
        const isFailed = step.status === 'FAILED';
        const isExpanded = expandedDetails[step.id];

        return (
          <div key={step.id} className="relative group">
            {/* Timeline Icon Node */}
            <div className="absolute -left-[35px] top-1 z-10 flex items-center justify-center">
              {getStepIndicator(step, isWaitingApproval)}
            </div>

            {/* Step Card Container */}
            <div
              className={`rounded-xl border bg-white p-5 shadow-sm transition-all ${
                isWaitingApproval
                  ? 'border-amber-400 ring-2 ring-amber-100'
                  : isFailed
                  ? 'border-rose-400 ring-2 ring-rose-100'
                  : step.status === 'RUNNING'
                  ? 'border-blue-400 shadow-md ring-2 ring-blue-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              {/* Step Header */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
                      Step {step.step_order}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                      {step.tool_name}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {step.tool_name === 'search_information' && 'Search for Information'}
                    {step.tool_name === 'update_record' && 'Update Project Record'}
                    {step.tool_name === 'send_notification' && 'Send Team Notification'}
                    {!['search_information', 'update_record', 'send_notification'].includes(step.tool_name) &&
                      step.tool_name}
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <StatusBadge status={isWaitingApproval ? 'WAITING_FOR_APPROVAL' : step.status} />
                </div>
              </div>

              {/* Waiting for approval view */}
              {isWaitingApproval && (
                <div className="mt-4">
                  <ApprovalCard
                    step={{ ...step, status: 'WAITING_FOR_APPROVAL' }}
                    onApprove={onApprove}
                    onReject={onReject}
                    isLoading={isActionLoading}
                  />
                </div>
              )}

              {/* Failed view */}
              {isFailed && (
                <div className="mt-4">
                  <RecoveryBox
                    step={step}
                    onRetry={onRetry}
                    onAbort={onAbort}
                    isLoading={isActionLoading}
                  />
                </div>
              )}

              {/* Completed Output Summary */}
              {step.status === 'COMPLETED' && step.output && (
                <div className="mt-3.5 rounded-lg bg-emerald-50/70 border border-emerald-200 p-3 text-xs text-emerald-900">
                  <div className="flex items-center justify-between mb-1.5 font-semibold text-emerald-800">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      Result:
                    </span>
                    <span className="text-[11px] font-medium text-emerald-700">Saved to History</span>
                  </div>

                  <div className="bg-white/80 p-2.5 rounded border border-emerald-100 font-mono text-[11px] text-slate-800 overflow-x-auto">
                    {typeof step.output === 'string'
                      ? step.output
                      : JSON.stringify(step.output, null, 2)}
                  </div>
                </div>
              )}

              {/* Expandable Technical Details Drawer */}
              {!isWaitingApproval && !isFailed && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => toggleDetails(step.id)}
                    className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 font-medium"
                  >
                    <FileCode2 className="h-3.5 w-3.5 text-slate-400" />
                    {isExpanded ? 'Hide Task Details' : 'View Task Details'}
                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>

                  <span className="text-[11px] text-slate-400">
                    Action: {step.tool_name}
                  </span>
                </div>
              )}

              {isExpanded && !isWaitingApproval && (
                <div className="mt-2.5 rounded bg-slate-900 p-3 font-mono text-xs text-slate-200 overflow-x-auto">
                  <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                    <FileCode2 className="h-3.5 w-3.5" />
                    <span>Task Details (Checked & Approved):</span>
                  </div>
                  <pre>{JSON.stringify(step.arguments, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
