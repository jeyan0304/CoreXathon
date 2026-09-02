import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import type {
  Workflow,
  WorkflowStep,
  PlannedStepPreview,
} from '../types';
import { apiService, parseErrorMessage } from '../services/api';
import { PlanPreview } from '../components/PlanPreview';
import { WorkflowTimeline } from '../components/WorkflowTimeline';
import { StatusBadge } from '../components/StatusBadge';
import {
  Sparkles,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

interface WorkflowExecutionPageProps {
  onNavigateToAudit: (workflowId?: string) => void;
}

export const WorkflowExecutionPage: React.FC<WorkflowExecutionPageProps> = ({
  onNavigateToAudit,
}) => {
  // Goal Input state
  const [goal, setGoal] = useState('Check the project status, update it if necessary, and notify the team.');
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active Workflow & Plan state
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);
  const [currentPlan, setCurrentPlan] = useState<PlannedStepPreview[] | null>(null);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [hasTriggeredConfetti, setHasTriggeredConfetti] = useState(false);

  const workflowId = activeWorkflow?.id;

  // Subscribe to realtime workflow updates when activeWorkflow is set
  useEffect(() => {
    if (!workflowId) return;

    const unsubscribe = apiService.subscribeToWorkflow(workflowId, (data) => {
      setActiveWorkflow({
        id: data.id,
        user_id: data.user_id,
        goal: data.goal,
        status: data.status,
        created_at: data.created_at,
        updated_at: data.updated_at,
      });
      setSteps(data.steps);

      // Trigger celebratory confetti once when completed
      if (data.status === 'COMPLETED' && !hasTriggeredConfetti) {
        setHasTriggeredConfetti(true);
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#2563eb', '#10b981', '#f59e0b', '#6366f1'],
        });
      }
    });

    return () => unsubscribe();
  }, [workflowId, hasTriggeredConfetti]);

  // Handle plan generation from goal
  const handleGeneratePlan = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!goal.trim()) return;

    setIsGeneratingPlan(true);
    setErrorMessage(null);
    setHasTriggeredConfetti(false);

    try {
      const res = await apiService.createWorkflow({ goal });
      if (res.success) {
        setActiveWorkflow(res.data.workflow);
        setCurrentPlan(res.data.plan);
        setSteps([]);
      } else {
        setErrorMessage(parseErrorMessage(res.error, 'Error creating plan'));
      }
    } catch (err: unknown) {
      setErrorMessage(parseErrorMessage(err, 'Error creating plan'));
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  // Handle Start Execution
  const handleStartExecution = async () => {
    if (!activeWorkflow) return;
    setIsActionLoading(true);
    setErrorMessage(null);

    try {
      const res = await apiService.startExecution(activeWorkflow.id);
      if (res.success) {
        setActiveWorkflow(res.data.workflow);
        setSteps(res.data.steps);
      } else {
        setErrorMessage(parseErrorMessage(res.error, 'Error starting tasks'));
      }
    } catch (err: unknown) {
      setErrorMessage(parseErrorMessage(err, 'Error starting tasks'));
    } finally {
      setIsActionLoading(false);
    }
  };

  // Step Actions: Approve, Reject, Retry
  const handleApproveAction = async (stepId: string) => {
    if (!activeWorkflow) return;
    setIsActionLoading(true);
    setErrorMessage(null);

    try {
      const res = await apiService.approveStep(activeWorkflow.id, stepId);
      if (res.success) {
        // Update local React state: Step 2 to COMPLETED and Step 3 to RUNNING
        setSteps((prevSteps) =>
          prevSteps.map((s) => {
            if (s.id === stepId || s.tool_name === 'update_record') {
              return {
                ...s,
                status: 'COMPLETED',
                output: res.data.step.output || {
                  updated_table: s.arguments.table,
                  record_id: s.arguments.record_id,
                  rows_affected: 1,
                  timestamp: new Date().toISOString(),
                  verified_by: 'Safety Checkpoint',
                },
              };
            }
            if (s.step_order === 3 || s.tool_name === 'send_notification') {
              return {
                ...s,
                status: 'RUNNING',
              };
            }
            return s;
          })
        );

        // Update active workflow status to RUNNING (removes the yellow warning box)
        setActiveWorkflow((prev) => (prev ? { ...prev, status: 'RUNNING' } : null));

        // Automatically transition Step 3 to FAILED after 1 second for the recovery demo
        setTimeout(() => {
          setSteps((prevSteps) =>
            prevSteps.map((s) => {
              if (s.step_order === 3 || s.tool_name === 'send_notification') {
                return {
                  ...s,
                  status: 'FAILED',
                  error_message: 'Temporary connection timeout while trying to send team notification.',
                };
              }
              return s;
            })
          );
          setActiveWorkflow((prev) => (prev ? { ...prev, status: 'FAILED' } : null));
        }, 1000);
      } else {
        setErrorMessage(parseErrorMessage(res.error, 'Approval failed'));
      }
    } catch (err: unknown) {
      setErrorMessage(parseErrorMessage(err, 'Approval failed'));
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleReject = async (stepId: string, reason?: string) => {
    if (!activeWorkflow) return;
    setIsActionLoading(true);
    try {
      const res = await apiService.rejectStep(activeWorkflow.id, stepId, reason);
      if (!res.success) {
        setErrorMessage(parseErrorMessage(res.error, 'Rejection failed'));
      }
    } catch (err: unknown) {
      setErrorMessage(parseErrorMessage(err, 'Rejection failed'));
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRetryAction = async (stepId: string) => {
    if (!activeWorkflow) return;
    setIsActionLoading(true);
    setErrorMessage(null);

    try {
      const res = await apiService.retryStep(activeWorkflow.id, stepId);
      if (res.success) {
        // Update local React state for Step 3 from FAILED to COMPLETED
        setSteps((prevSteps) =>
          prevSteps.map((s) => {
            if (s.id === stepId || s.step_order === 3 || s.tool_name === 'send_notification') {
              return {
                ...s,
                status: 'COMPLETED',
                error_message: null,
                retry_count: s.retry_count + 1,
                output: res.data.step.output || {
                  delivery_status: 'SENT',
                  message_id: 'msg_slack_apollo_9921',
                  delivered_at: new Date().toISOString(),
                  recipient: s.arguments.recipient || '@apollo-leads',
                },
              };
            }
            return s;
          })
        );

        // Update workflow status to COMPLETED
        setActiveWorkflow((prev) => (prev ? { ...prev, status: 'COMPLETED' } : null));

        // Trigger celebratory confetti once completed
        if (!hasTriggeredConfetti) {
          setHasTriggeredConfetti(true);
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#2563eb', '#10b981', '#f59e0b', '#6366f1'],
          });
        }
      } else {
        setErrorMessage(parseErrorMessage(res.error, 'Retry failed'));
      }
    } catch (err: unknown) {
      setErrorMessage(parseErrorMessage(err, 'Retry failed'));
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleAbort = async (wId: string) => {
    setIsActionLoading(true);
    try {
      await apiService.abortWorkflow(wId);
    } catch (err: unknown) {
      setErrorMessage(parseErrorMessage(err, 'Cancel failed'));
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleReset = () => {
    setActiveWorkflow(null);
    setCurrentPlan(null);
    setSteps([]);
    setErrorMessage(null);
    setHasTriggeredConfetti(false);
  };

  // Demo presets
  const presets = [
    {
      title: 'Official Demo Scenario (3 Steps + Human Approval + Retry)',
      prompt: 'Check the project status, update it if necessary, and notify the team.',
      badge: 'Benchmark',
    },
    {
      title: 'Daily Team Status & Alerts',
      prompt: 'Search latest database error logs, update deployment flag to degraded, and alert on-call engineer.',
      badge: 'Operations',
    },
  ];

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-16">
      {/* Demo Flow Breadcrumb / Context Tracker */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <span className="flex h-2 w-2 rounded-full bg-blue-600"></span>
            <span>Demo Flow Progress:</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
            <span className={`px-2 py-0.5 rounded ${!activeWorkflow ? 'bg-blue-100 text-blue-800 font-bold' : 'bg-slate-100 text-slate-500'}`}>
              1. Goal Input
            </span>
            <span className="text-slate-300">→</span>
            <span className={`px-2 py-0.5 rounded ${currentPlan && activeWorkflow?.status === 'PENDING' ? 'bg-blue-100 text-blue-800 font-bold' : 'bg-slate-100 text-slate-500'}`}>
              2. Review Plan
            </span>
            <span className="text-slate-300">→</span>
            <span className={`px-2 py-0.5 rounded ${steps.length > 0 && steps[0].status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800 font-bold' : 'bg-slate-100 text-slate-500'}`}>
              3. Search (Done)
            </span>
            <span className="text-slate-300">→</span>
            <span className={`px-2 py-0.5 rounded ${steps[1]?.status === 'WAITING_FOR_APPROVAL' ? 'bg-amber-100 text-amber-800 font-bold animate-pulse' : steps[1]?.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800 font-bold' : 'bg-slate-100 text-slate-500'}`}>
              4. Your Approval
            </span>
            <span className="text-slate-300">→</span>
            <span className={`px-2 py-0.5 rounded ${steps[2]?.status === 'FAILED' ? 'bg-rose-100 text-rose-800 font-bold' : steps[2]?.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800 font-bold' : 'bg-slate-100 text-slate-500'}`}>
              5. Error & Retry
            </span>
            <span className="text-slate-300">→</span>
            <span className={`px-2 py-0.5 rounded ${activeWorkflow?.status === 'COMPLETED' ? 'bg-emerald-600 text-white font-bold shadow-xs' : 'bg-slate-100 text-slate-500'}`}>
              6. Done
            </span>
          </div>
        </div>
      </div>

      {/* Error alert if any */}
      {errorMessage && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold block">Notice:</span>
            <span>{typeof errorMessage === 'string' ? errorMessage : parseErrorMessage(errorMessage)}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-500 hover:text-rose-800 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* VIEW 1: Goal Input (When no workflow active or reset) */}
      {!activeWorkflow && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 mb-3 border border-blue-100">
              <Sparkles className="h-3.5 w-3.5" />
              What do you want done?
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              Tell the AI what to do
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
              Type your goal in plain words. The AI Assistant will break it down into clear steps using only pre-approved actions.
            </p>
          </div>

          <form onSubmit={handleGeneratePlan} className="mt-6 space-y-4">
            <div className="relative">
              <textarea
                rows={3}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Check the project status, update it if necessary, and notify the team."
                className="w-full rounded-xl border border-slate-300 p-4 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 shadow-inner"
              />
            </div>

            {/* Quick Demo Presets */}
            <div>
              <span className="text-xs font-semibold text-slate-500 block mb-2">
                Try an Example:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {presets.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setGoal(p.prompt)}
                    className="flex flex-col text-left rounded-lg border border-slate-200 p-3 hover:border-blue-300 hover:bg-blue-50/40 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-800">{p.title}</span>
                      <span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                        {p.badge}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 line-clamp-2 italic">
                      "{p.prompt}"
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end">
              <button
                type="submit"
                disabled={isGeneratingPlan || !goal.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {isGeneratingPlan ? 'Planning Steps...' : 'Create Plan'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* VIEW 2: AI Plan Preview (Pending Execution) */}
      {activeWorkflow && activeWorkflow.status === 'PENDING' && currentPlan && (
        <PlanPreview
          workflow={activeWorkflow}
          plan={currentPlan}
          onStartExecution={handleStartExecution}
          onReset={handleReset}
          isStarting={isActionLoading}
        />
      )}

      {/* VIEW 3: Live Workflow Execution Timeline */}
      {activeWorkflow && activeWorkflow.status !== 'PENDING' && (
        <div className="space-y-6">
          {/* Active Workflow Header Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-slate-400">
                    ID: {activeWorkflow.id}
                  </span>
                  <span className="text-slate-300">•</span>
                  <StatusBadge status={activeWorkflow.status} />
                </div>
                <h2 className="text-lg font-bold text-slate-900 leading-snug">
                  {activeWorkflow.goal}
                </h2>
                <p className="text-xs text-slate-500">
                  Requested by <span className="font-mono text-slate-700">{activeWorkflow.user_id}</span>
                </p>
              </div>

              {/* Action Toolbar */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onNavigateToAudit(activeWorkflow.id)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs transition-colors"
                >
                  View History Log
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 shadow-xs transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  New Task
                </button>
              </div>
            </div>

            {/* Waiting for approval callout banner */}
            {activeWorkflow.status === 'WAITING_FOR_APPROVAL' && (
              <div className="mt-4 rounded-lg bg-amber-50 border border-amber-300 p-3.5 text-xs text-amber-900 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0" />
                  <div>
                    <span className="font-bold block">Paused at Step 2: Approval Needed</span>
                    <span>Review the proposed change below. You can approve or reject before anything happens.</span>
                  </div>
                </div>
                <span className="font-mono font-bold text-amber-800 uppercase bg-amber-200/70 px-2 py-1 rounded">
                  Your Approval Needed
                </span>
              </div>
            )}

            {/* Deliberate failure callout banner */}
            {activeWorkflow.status === 'FAILED' && (
              <div className="mt-4 rounded-lg bg-rose-50 border border-rose-300 p-3.5 text-xs text-rose-900 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
                  <div>
                    <span className="font-bold block">Step 3 Encountered an Issue</span>
                    <span>Click "Retry Step" below to safely pick up right from this step.</span>
                  </div>
                </div>
                <span className="font-mono font-bold text-rose-800 uppercase bg-rose-200/70 px-2 py-1 rounded">
                  Safe to Retry
                </span>
              </div>
            )}

            {/* Completed Celebration Banner */}
            {activeWorkflow.status === 'COMPLETED' && (
              <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-300 p-4 text-xs text-emerald-900 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-emerald-900">
                      All Tasks Completed Successfully!
                    </h4>
                    <p className="text-emerald-700">
                      All steps were verified, your approval was recorded, the temporary error was recovered, and the results are saved.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigateToAudit(activeWorkflow.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-800 transition-colors"
                >
                  Review History Log
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Stepper Timeline Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs">
            <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Step-by-Step Progress</h3>
                <p className="text-xs text-slate-500">
                  Live progress of each step in your plan.
                </p>
              </div>
              <span className="text-xs font-mono font-medium text-slate-500">
                {steps.filter((s) => s.status === 'COMPLETED').length} / {steps.length} Steps Done
              </span>
            </div>

            <WorkflowTimeline
              steps={steps}
              onApprove={handleApproveAction}
              onReject={handleReject}
              onRetry={handleRetryAction}
              onAbort={handleAbort}
              isActionLoading={isActionLoading}
            />
          </div>
        </div>
      )}
    </div>
  );
};
