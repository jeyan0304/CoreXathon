import React, { useState } from 'react';
import type { WorkflowStep } from '../types';
import {
  ShieldAlert,
  CheckCircle,
  XCircle,
  Code2,
  Lock,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';

interface ApprovalCardProps {
  step: WorkflowStep;
  onApprove: (stepId: string) => Promise<void> | void;
  onReject: (stepId: string, reason?: string) => Promise<void> | void;
  isLoading?: boolean;
}

export const ApprovalCard: React.FC<ApprovalCardProps> = ({
  step,
  onApprove,
  onReject,
  isLoading = false,
}) => {
  const [showRawJson, setShowRawJson] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const handleApproveClick = async () => {
    try {
      console.log(`[ApprovalCard] Invoking approval for step: ${step.id} (${step.tool_name})`);
      await onApprove(step.id);
    } catch (err) {
      console.error(`[ApprovalCard] Failed during approve action for step: ${step.id}`, err);
    }
  };

  const handleRejectSubmit = async () => {
    try {
      console.log(`[ApprovalCard] Invoking rejection for step: ${step.id} (${step.tool_name})`);
      await onReject(step.id, rejectReason || 'Operator rejected change');
    } catch (err) {
      console.error(`[ApprovalCard] Failed during reject action for step: ${step.id}`, err);
    } finally {
      setRejecting(false);
    }
  };

  const tableVal = step.arguments.table != null ? String(step.arguments.table) : null;
  const recordIdVal = step.arguments.record_id != null ? String(step.arguments.record_id) : null;
  const summaryVal = step.arguments.change_summary != null ? String(step.arguments.change_summary) : null;

  return (
    <div className="relative overflow-hidden rounded-xl border-2 border-amber-300 bg-gradient-to-br from-amber-50/70 via-sky-50/50 to-amber-50/40 p-5 shadow-md">
      {/* Header Banner */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-amber-200/80 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-white shadow-sm">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded bg-amber-200/80 px-2 py-0.5 text-xs font-bold text-amber-900 tracking-wide uppercase">
                <ShieldAlert className="h-3.5 w-3.5 text-amber-700" />
                Human Approval Required
              </span>
              <span className="text-xs font-mono text-slate-500">Step {step.step_order}</span>
            </div>
            <h4 className="mt-1 text-base font-semibold text-slate-900">
              Action Paused: Approval Required for{' '}
              <span className="font-mono text-blue-700 font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                {step.tool_name}
              </span>
            </h4>
          </div>
        </div>

        <div className="text-right">
          <span className="text-xs text-slate-500">Safety Checkpoint</span>
          <p className="text-xs font-semibold text-slate-700">Paused for Your Safety</p>
        </div>
      </div>

      {/* Description / Safety Checkpoint notice */}
      <p className="mt-3 text-xs text-slate-600 leading-relaxed">
        The AI wants to make a sensitive change to live data. To keep things safe, you must review and approve the exact details below before anything happens.
      </p>

      {/* Structured task details preview */}
      <div className="mt-3.5 rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2">
          <span>Proposed Task Details:</span>
          <button
            type="button"
            onClick={() => setShowRawJson(!showRawJson)}
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            <Code2 className="h-3.5 w-3.5" />
            {showRawJson ? 'Hide Raw Details' : 'Inspect Raw Details'}
            {showRawJson ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>

        {/* Structured summary */}
        <div className="space-y-2 text-xs">
          {tableVal && (
            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Target Record Type:</span>
              <span className="font-mono font-medium text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                {tableVal}
              </span>
            </div>
          )}
          {recordIdVal && (
            <div className="flex items-center justify-between py-1 border-b border-slate-100">
              <span className="text-slate-500">Item ID:</span>
              <span className="font-mono font-medium text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                {recordIdVal}
              </span>
            </div>
          )}
          {summaryVal && (
            <div className="py-1 border-b border-slate-100">
              <span className="text-slate-500 block mb-0.5">Summary of Change:</span>
              <span className="text-slate-800 italic">
                "{summaryVal}"
              </span>
            </div>
          )}
        </div>

        {/* Raw JSON drawer */}
        {showRawJson && (
          <div className="mt-3 pt-3 border-t border-slate-200">
            <pre className="p-3 bg-slate-900 text-slate-100 text-xs font-mono rounded overflow-x-auto max-h-48">
              {JSON.stringify(step.arguments, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Reject Modal / Input */}
      {rejecting ? (
        <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg">
          <label className="block text-xs font-semibold text-rose-900 mb-1">
            Reason for Rejection (saved to history log):
          </label>
          <input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Needs further verification or data mismatch"
            className="w-full text-xs p-2 border border-rose-300 rounded bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-rose-500 mb-2"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRejectSubmit}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs text-white bg-rose-600 hover:bg-rose-700 rounded font-semibold flex items-center gap-1.5"
            >
              <XCircle className="h-3.5 w-3.5" />
              Confirm Rejection & Stop
            </button>
          </div>
        </div>
      ) : (
        /* Action buttons */
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setRejecting(true)}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 hover:border-rose-300 transition-colors shadow-sm disabled:opacity-50"
          >
            <XCircle className="h-4 w-4 text-rose-500" />
            Reject Change
          </button>
          <button
            type="button"
            onClick={handleApproveClick}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 transition-colors disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Approving & Running...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                Approve & Run Action
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
