import React from 'react';
import type { WorkflowStep } from '../types';
import {
  AlertOctagon,
  RotateCcw,
  Ban,
  AlertCircle,
  Loader2,
} from 'lucide-react';

interface RecoveryBoxProps {
  step: WorkflowStep;
  onRetry: (stepId: string) => Promise<void> | void;
  onAbort?: (workflowId: string) => Promise<void> | void;
  isLoading?: boolean;
}

export const RecoveryBox: React.FC<RecoveryBoxProps> = ({
  step,
  onRetry,
  onAbort,
  isLoading = false,
}) => {
  return (
    <div className="relative overflow-hidden rounded-xl border-2 border-rose-300 bg-rose-50/70 p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-600 text-white shadow-sm">
          <AlertOctagon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800 uppercase tracking-wide">
              Step Ran into an Issue
            </span>
            <span className="text-xs font-mono text-slate-500">
              Attempt {step.retry_count + 1}
            </span>
          </div>
          <h4 className="mt-1 text-sm font-semibold text-slate-900">
            Step Paused on: <span className="font-mono text-rose-700 font-bold">{step.tool_name}</span>
          </h4>
        </div>
      </div>

      {/* Error detail box */}
      <div className="mt-3 rounded-lg border border-rose-200 bg-white p-3 shadow-inner">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1">
          <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
          <span>What happened:</span>
        </div>
        <p className="text-xs text-rose-800 break-words leading-relaxed bg-rose-50/50 p-2 rounded border border-rose-100 font-mono">
          {step.error_message || 'The network connection timed out while running this step.'}
        </p>
      </div>

      {/* Recovery explanation */}
      <div className="mt-2.5 flex items-center justify-between text-xs text-slate-600">
        <p>
          Your progress is safely saved. Retrying will pick up right here without re-doing earlier steps.
        </p>
      </div>

      {/* Action buttons */}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2.5">
        {onAbort && (
          <button
            type="button"
            onClick={() => onAbort(step.workflow_id)}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
          >
            <Ban className="h-3.5 w-3.5 text-slate-500" />
            Cancel Task
          </button>
        )}
        <button
          type="button"
          onClick={() => onRetry(step.id)}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 focus:ring-2 focus:ring-rose-500 focus:ring-offset-1 transition-colors disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Retrying...
            </>
          ) : (
            <>
              <RotateCcw className="h-4 w-4" />
              Retry Step ({step.tool_name})
            </>
          )}
        </button>
      </div>
    </div>
  );
};
