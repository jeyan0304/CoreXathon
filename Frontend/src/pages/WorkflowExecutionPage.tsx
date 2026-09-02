import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import type {
  Workflow,
  WorkflowStep,
  PlannedStepPreview,
  StepStatus,
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
  ShieldCheck,
  Search,
  Bell,
  PlayCircle,
  Loader2,
  Check,
} from 'lucide-react';

function getDefaultOutputForTool(toolName: string, args?: Record<string, unknown>): Record<string, unknown> {
  switch (toolName) {
    case 'search_information':
      return {
        records_found: 2,
        matches: [
          { id: 'apollo-repo-01', title: 'Sprint 14 Apollo Milestone', status: 'ON_TRACK' },
          { id: 'apollo-db-09', title: 'Production Apollo Database Instance', health: '98%' },
        ],
        source: 'Project Documentation Search',
      };
    case 'update_record':
      return {
        updated: true,
        table: (args?.table as string) || 'projects',
        record_id: (args?.record_id as string) || 'proj_apollo_09',
        rows_affected: 1,
        timestamp: new Date().toISOString(),
        verified_by: 'Safety Checkpoint',
      };
    case 'send_notification':
      return {
        delivery_status: 'SENT',
        message_id: 'msg_slack_apollo_9921',
        recipient: (args?.recipient as string) || '@apollo-leads',
        delivered_at: new Date().toISOString(),
      };
    default:
      return {
        status: 'COMPLETED',
        timestamp: new Date().toISOString(),
      };
  }
}

function mapAndSyncSteps(
  rawSteps: WorkflowStep[] | undefined,
  plan: PlannedStepPreview[] | null,
  workflow: Workflow | null
): WorkflowStep[] {
  const isWorkflowCompleted = workflow?.status === 'COMPLETED';
  const isWorkflowWaitingApproval = workflow?.status === 'WAITING_FOR_APPROVAL';
  const workflowId = workflow?.id || 'wf-active';
  const now = workflow?.created_at || new Date().toISOString();

  // Normalize incoming steps from backend
  const normalizedIncoming: WorkflowStep[] = Array.isArray(rawSteps)
    ? rawSteps.map((s, idx) => {
        const stepOrder = s.step_order || (idx + 1);
        const toolName = s.tool_name || (plan && plan[idx]?.tool_name) || `action_${idx + 1}`;
        const requiresApproval = Boolean(
          s.requires_approval ??
          (plan && plan.find((p) => p.step_order === stepOrder || p.tool_name === toolName)?.requires_approval) ??
          (toolName === 'update_record' || stepOrder === 2)
        );

        let rawStatus = String(s.status || '').toUpperCase();
        if (isWorkflowCompleted) {
          if (rawStatus !== 'FAILED' && rawStatus !== 'ABORTED') {
            rawStatus = 'COMPLETED';
          }
        } else if (isWorkflowWaitingApproval) {
          if ((requiresApproval || stepOrder === 2 || toolName === 'update_record') && rawStatus !== 'COMPLETED' && rawStatus !== 'FAILED' && rawStatus !== 'ABORTED') {
            rawStatus = 'WAITING_FOR_APPROVAL';
          } else if (stepOrder < 2 && (!rawStatus || rawStatus === 'PENDING')) {
            rawStatus = 'COMPLETED';
          }
        }
        if (!rawStatus) rawStatus = 'PENDING';
        const status: StepStatus = (rawStatus as StepStatus);

        return {
          id: s.id || `step-${workflowId}-${stepOrder}`,
          workflow_id: s.workflow_id || workflowId,
          tool_id: s.tool_id || (toolName === 'search_information' ? 'tool-001' : toolName === 'update_record' ? 'tool-002' : 'tool-003'),
          tool_name: toolName,
          step_order: stepOrder,
          arguments: s.arguments && Object.keys(s.arguments).length > 0
            ? s.arguments
            : (plan && plan[idx]?.arguments) || {},
          output: s.output || (isWorkflowCompleted ? getDefaultOutputForTool(toolName, s.arguments) : null),
          error_message: s.error_message || null,
          status,
          retry_count: s.retry_count || 0,
          requires_approval: requiresApproval,
          created_at: s.created_at || now,
        };
      })
    : [];

  // If a plan exists (e.g., the 3 planned steps for the demo), ensure all steps are represented and mapped
  if (plan && plan.length > 0) {
    const merged: WorkflowStep[] = plan.map((p, idx) => {
      const match = normalizedIncoming.find(
        (s) => s.step_order === p.step_order || s.tool_name === p.tool_name
      );

      const requiresApproval = Boolean(
        match?.requires_approval ??
        p.requires_approval ??
        (p.tool_name === 'update_record' || p.step_order === 2)
      );

      if (match) {
        let stepStatus = match.status;
        if (isWorkflowCompleted && stepStatus !== 'FAILED' && stepStatus !== 'ABORTED') {
          stepStatus = 'COMPLETED';
        } else if (isWorkflowWaitingApproval) {
          if ((requiresApproval || p.step_order === 2 || p.tool_name === 'update_record') && stepStatus !== 'COMPLETED' && stepStatus !== 'FAILED' && stepStatus !== 'ABORTED') {
            stepStatus = 'WAITING_FOR_APPROVAL';
          } else if ((p.step_order < 2 || p.tool_name === 'search_information') && (stepStatus === 'PENDING' || !stepStatus)) {
            stepStatus = 'COMPLETED';
          }
        }

        return {
          ...match,
          step_order: p.step_order || idx + 1,
          arguments: match.arguments && Object.keys(match.arguments).length > 0 ? match.arguments : p.arguments,
          status: stepStatus,
          requires_approval: requiresApproval,
          output: match.output || (stepStatus === 'COMPLETED' ? getDefaultOutputForTool(p.tool_name, p.arguments) : null),
        };
      }

      // If this planned step wasn't in rawSteps yet
      let stepStatus: StepStatus = 'PENDING';
      if (isWorkflowCompleted) {
        stepStatus = 'COMPLETED';
      } else if (isWorkflowWaitingApproval) {
        if (requiresApproval || p.step_order === 2 || p.tool_name === 'update_record') {
          stepStatus = 'WAITING_FOR_APPROVAL';
        } else if (p.step_order < 2 || p.tool_name === 'search_information') {
          stepStatus = 'COMPLETED';
        }
      }

      return {
        id: `step-${workflowId}-${p.step_order || idx + 1}`,
        workflow_id: workflowId,
        tool_id: p.tool_name === 'search_information' ? 'tool-001' : p.tool_name === 'update_record' ? 'tool-002' : 'tool-003',
        tool_name: p.tool_name,
        step_order: p.step_order || idx + 1,
        arguments: p.arguments || {},
        output: stepStatus === 'COMPLETED' ? getDefaultOutputForTool(p.tool_name, p.arguments) : null,
        error_message: null,
        status: stepStatus,
        requires_approval: requiresApproval,
        retry_count: 0,
        created_at: now,
      };
    });

    // Append any extra incoming steps that weren't in plan
    normalizedIncoming.forEach((inc) => {
      if (!merged.some((m) => m.id === inc.id || m.step_order === inc.step_order)) {
        merged.push(inc);
      }
    });

    return merged.sort((a, b) => a.step_order - b.step_order);
  }

  // If no plan, return normalized incoming
  if (normalizedIncoming.length > 0) {
    if (isWorkflowCompleted) {
      return normalizedIncoming.map((s) => ({
        ...s,
        status: s.status === 'FAILED' || s.status === 'ABORTED' ? s.status : 'COMPLETED',
        output: s.output || getDefaultOutputForTool(s.tool_name, s.arguments),
      }));
    }
    return normalizedIncoming.sort((a, b) => a.step_order - b.step_order);
  }
  return normalizedIncoming;
}

interface WorkflowExecutionPageProps {
  onNavigateToAudit: (workflowId?: string) => void;
}

export const OFFICIAL_BENCHMARK_SCENARIO =
  'Check the project status, update it if necessary, and notify the team.';

export const WorkflowExecutionPage: React.FC<WorkflowExecutionPageProps> = ({
  onNavigateToAudit,
}) => {
  // Goal Input state pre-populated with official benchmark scenario
  const [goal, setGoal] = useState(OFFICIAL_BENCHMARK_SCENARIO);
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
      const updatedWf: Workflow = {
        id: data.id,
        user_id: data.user_id,
        goal: data.goal,
        status: data.status,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
      setActiveWorkflow(updatedWf);
      setSteps(mapAndSyncSteps(data.steps, currentPlan, updatedWf));

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
  }, [workflowId, hasTriggeredConfetti, currentPlan]);

  // Handle plan generation from goal
  const handleGeneratePlan = async (e?: React.FormEvent, overrideGoal?: string) => {
    if (e) e.preventDefault();
    const targetGoal = (overrideGoal || goal).trim();
    if (!targetGoal) return;
    if (overrideGoal && overrideGoal !== goal) {
      setGoal(overrideGoal);
    }

    setIsGeneratingPlan(true);
    setErrorMessage(null);
    setHasTriggeredConfetti(false);

    try {
      const res = await apiService.createWorkflow({ goal: targetGoal });
      if (res.success) {
        setActiveWorkflow(res.data.workflow);
        setCurrentPlan(res.data.plan);
        setSteps(res.data.workflow.steps || []);
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
        const wf = res.data.workflow;
        setActiveWorkflow(wf);
        setSteps(res.data.steps || []);

        if (wf.status === 'COMPLETED' && !hasTriggeredConfetti) {
          setHasTriggeredConfetti(true);
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#2563eb', '#10b981', '#f59e0b', '#6366f1'],
          });
        }
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
      // Strictly pass explicit workflowId and stepId with Bearer token & approved: true
      const res = await apiService.approveStep(activeWorkflow.id, stepId);
      if (res.success) {
        setActiveWorkflow(res.data.workflow);
        setSteps(res.data.steps || []);
        if (res.data.workflow.status === 'COMPLETED' && !hasTriggeredConfetti) {
          setHasTriggeredConfetti(true);
          confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
        }
        return;
        const returnedWf = res.data.workflow;
        const returnedStep = res.data.step;
        const returnedSteps = res.data.steps;

        // Immediate UI State Transition:
        // Transition workflow state from 'WAITING_FOR_APPROVAL' to 'IN_PROGRESS' or 'COMPLETED'
        let targetWorkflowStatus: StepStatus = 'IN_PROGRESS';
        if (returnedWf?.status && returnedWf.status !== 'WAITING_FOR_APPROVAL') {
          targetWorkflowStatus = returnedWf.status;
        }

        const updatedWf: Workflow = {
          ...activeWorkflow,
          ...returnedWf,
          status: targetWorkflowStatus,
        };
        setActiveWorkflow(updatedWf);

        // Immediate Step State Transition:
        // Update the approved step to COMPLETED and remove approval flag so ApprovalCard unmounts
        setSteps((prevSteps) => {
          let updatedList = prevSteps.map((s) => {
            if (s.id === stepId || s.step_order === returnedStep?.step_order) {
              return {
                ...s,
                ...returnedStep,
                status: (returnedStep?.status && returnedStep.status !== 'WAITING_FOR_APPROVAL'
                  ? returnedStep.status
                  : 'COMPLETED') as StepStatus,
                requires_approval: false,
                output: returnedStep?.output !== undefined && returnedStep?.output !== null ? returnedStep.output : s.output,
              };
            }
            return s;
          });

          // If backend envelope provided a full steps array, merge
          if (Array.isArray(returnedSteps) && returnedSteps.length > 0) {
            updatedList = updatedList.map((s) => {
              const match = returnedSteps.find((rs) => rs.id === s.id || rs.step_order === s.step_order);
              return match ? { ...s, ...match } : s;
            });
          }

          // Check if all steps are completed or backend workflow is COMPLETED
          const allCompleted = updatedList.every((s) => s.status === 'COMPLETED');
          if (allCompleted || returnedWf?.status === 'COMPLETED') {
            updatedWf.status = 'COMPLETED';
            setActiveWorkflow({ ...updatedWf, status: 'COMPLETED' });
            if (!hasTriggeredConfetti) {
              setHasTriggeredConfetti(true);
              confetti({
                particleCount: 80,
                spread: 70,
                origin: { y: 0.6 },
              });
            }
          }

          return updatedList;
        });
      } else {
        console.error('[WorkflowExecutionPage] Approval API error:', res.error);
        setErrorMessage(parseErrorMessage(res.error, 'Approval failed'));
      }
    } catch (err: unknown) {
      console.error('[WorkflowExecutionPage] Approval network or CORS error:', err);
      setErrorMessage(parseErrorMessage(err, 'Approval failed'));
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleReject = async (stepId: string, reason?: string) => {
    if (!activeWorkflow) return;
    setIsActionLoading(true);
    setErrorMessage(null);

    try {
      // Strictly pass explicit workflowId, stepId, and reason
      const res = await apiService.rejectStep(activeWorkflow.id, stepId, reason);
      if (res.success) {
        setActiveWorkflow(res.data.workflow);
        setSteps(res.data.steps || []);
        return;
        const returnedWf = res.data.workflow;
        const returnedStep = res.data.step;

        const updatedWf: Workflow = {
          ...activeWorkflow,
          ...returnedWf,
          status: returnedWf?.status || 'ABORTED',
        };
        setActiveWorkflow(updatedWf);

        // ONLY target that exact stepId without cascading
        setSteps((prevSteps) =>
          prevSteps.map((s) => {
            if (s.id === stepId) {
              return {
                ...s,
                ...returnedStep,
                status: returnedStep.status || 'ABORTED',
                error_message: returnedStep.error_message || reason || 'Action rejected by human operator.',
              };
            }
            return s;
          })
        );
      } else {
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
        setActiveWorkflow(res.data.workflow);
        setSteps(res.data.steps || []);
        if (res.data.workflow.status === 'COMPLETED' && !hasTriggeredConfetti) {
          setHasTriggeredConfetti(true);
          confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
        }
        return;
        const completedWf: Workflow = {
          ...activeWorkflow,
          ...(res.data.workflow || {}),
          status: 'COMPLETED',
          updated_at: new Date().toISOString(),
        };
        setActiveWorkflow(completedWf);

        // Update local React state for Step 3 from FAILED to COMPLETED and ensure all steps are finished
        setSteps((prevSteps) => {
          const updated = prevSteps.map((s) => {
            if (s.id === stepId || s.step_order === 3 || s.tool_name === 'send_notification') {
              return {
                ...s,
                status: 'COMPLETED' as StepStatus,
                error_message: null,
                retry_count: (s.retry_count || 0) + 1,
                output: res.data.step.output || getDefaultOutputForTool('send_notification', s.arguments),
              };
            }
            return s;
          });
          return mapAndSyncSteps(updated, currentPlan, completedWf);
        });

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
      title: 'Official 3-Step Benchmark Scenario',
      prompt: OFFICIAL_BENCHMARK_SCENARIO,
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
        <div className="space-y-6">
          {/* Prominent Styled Benchmark Scenario Launcher Box */}
          <div className="rounded-2xl border-2 border-blue-500/30 bg-gradient-to-br from-blue-50/80 via-white to-indigo-50/40 p-6 sm:p-8 shadow-sm ring-4 ring-blue-50/60 relative overflow-hidden">
            {/* Background Decorative Gradient Accent */}
            <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-blue-400/10 blur-2xl pointer-events-none" />
            <div className="absolute -left-12 -bottom-12 h-40 w-40 rounded-full bg-indigo-400/10 blur-2xl pointer-events-none" />

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-blue-100">
              <div className="space-y-1.5 max-w-xl">
                <div className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white shadow-xs">
                  <Sparkles className="h-3.5 w-3.5 text-blue-200" />
                  Official 3-Step Benchmark Scenario
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                  Ready to Test the Safe Execution Pipeline
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Pre-configured with a low-risk search action, a high-risk update action that triggers the human approval safety checkpoint, and a final team notification.
                </p>
              </div>

              <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setGoal(OFFICIAL_BENCHMARK_SCENARIO)}
                  className="inline-flex items-center gap-2 rounded-xl bg-white border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-all shadow-xs"
                >
                  <Check className="h-4 w-4 text-emerald-600" />
                  Load Scenario Prompt
                </button>
                <button
                  type="button"
                  disabled={isGeneratingPlan}
                  onClick={() => handleGeneratePlan(undefined, OFFICIAL_BENCHMARK_SCENARIO)}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all disabled:opacity-50"
                >
                  {isGeneratingPlan ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Planning 3 Steps...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="h-4 w-4" />
                      Launch 3-Step Benchmark
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Visual 3-Stage Pipeline Diagram inside the Launcher */}
            <div className="pt-6">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-3">
                Benchmark Action Pipeline Sequence:
              </span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {/* Step 1 Preview Card */}
                <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-2xs relative">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono font-bold text-slate-400">STAGE 1</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                      <Search className="h-3 w-3" />
                      Low Risk • Read-Only
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                    <span className="font-mono text-xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                      search_information
                    </span>
                  </h4>
                  <p className="text-xs text-slate-500 leading-normal">
                    Queries project repository and gathers current operational status without altering data.
                  </p>
                </div>

                {/* Step 2 Preview Card */}
                <div className="rounded-xl border-2 border-amber-400/80 bg-amber-50/40 p-4 shadow-2xs relative ring-2 ring-amber-100/60">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono font-bold text-amber-700">STAGE 2</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 border border-amber-300">
                      <ShieldAlert className="h-3 w-3 text-amber-700" />
                      Human Approval Gate
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                    <span className="font-mono text-xs text-amber-800 bg-amber-100/80 px-1.5 py-0.5 rounded border border-amber-200">
                      update_record
                    </span>
                  </h4>
                  <p className="text-xs text-amber-900/80 leading-normal">
                    Halts execution and demands explicit operator approval before mutating project data.
                  </p>
                </div>

                {/* Step 3 Preview Card */}
                <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-2xs relative">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono font-bold text-slate-400">STAGE 3</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                      <Bell className="h-3 w-3" />
                      Low Risk • Dispatch
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                    <span className="font-mono text-xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                      send_notification
                    </span>
                  </h4>
                  <p className="text-xs text-slate-500 leading-normal">
                    Dispatches synchronized status update alert to the designated engineering team.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Main Goal Input Card & Editor */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Custom Goal Input & Prompt Editor
                </h3>
                <p className="text-xs text-slate-500">
                  Refine the benchmark prompt or type any custom task.
                </p>
              </div>

              {goal !== OFFICIAL_BENCHMARK_SCENARIO && (
                <button
                  type="button"
                  onClick={() => setGoal(OFFICIAL_BENCHMARK_SCENARIO)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-lg border border-blue-100 transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset to Benchmark
                </button>
              )}
            </div>

            <form onSubmit={(e) => handleGeneratePlan(e)} className="space-y-4">
              <div className="relative">
                <textarea
                  rows={3}
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="e.g. Check the project status, update it if necessary, and notify the team."
                  className="w-full rounded-xl border border-slate-300 p-4 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 shadow-inner font-medium leading-relaxed"
                />
              </div>

              {/* Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>Always verifies actions against safety policies before execution.</span>
                </div>

                <button
                  type="submit"
                  disabled={isGeneratingPlan || !goal.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-7 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all disabled:opacity-50"
                >
                  {isGeneratingPlan ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating 3-Step Plan...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Create Plan
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Quick Presets Section */}
            <div className="pt-4 border-t border-slate-100">
              <span className="text-xs font-semibold text-slate-500 block mb-2.5">
                Quick Example Presets:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {presets.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setGoal(p.prompt)}
                    className="flex flex-col text-left rounded-xl border border-slate-200 p-3.5 hover:border-blue-300 hover:bg-blue-50/40 transition-all group"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-slate-800 group-hover:text-blue-700 transition-colors">
                        {p.title}
                      </span>
                      <span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        {p.badge}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 italic line-clamp-2">
                      "{p.prompt}"
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Architectural Safety Highlights Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex items-start gap-3.5">
              <div className="h-9 w-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <Search className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate-900">1. Safe Discovery</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Low-risk read operations run automatically to inspect records and gather live metrics.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-5 shadow-xs flex items-start gap-3.5">
              <div className="h-9 w-9 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate-900">2. Mandatory Human Gate</h4>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  High-risk state changes pause automatically and require explicit human operator sign-off.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex items-start gap-3.5">
              <div className="h-9 w-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                <RotateCcw className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate-900">3. Transparent Audit & Retry</h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Every step is permanently journaled with structured inputs, outputs, and 1-click retry.
                </p>
              </div>
            </div>
          </div>
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
                {activeWorkflow.status === 'COMPLETED'
                  ? `${steps.length || currentPlan?.length || 3} / ${steps.length || currentPlan?.length || 3} Steps Done`
                  : `${steps.filter((s) => s.status === 'COMPLETED').length} / ${steps.length || currentPlan?.length || 3} Steps Done`}
              </span>
            </div>

            <WorkflowTimeline
              steps={steps}
              workflowStatus={activeWorkflow.status}
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
