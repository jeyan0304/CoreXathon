import React, { useState, useEffect } from 'react';
import type { Workflow, Tool } from '../types';
import { apiService } from '../services/api';
import { INITIAL_SAMPLE_WORKFLOWS, INITIAL_REGISTERED_TOOLS } from '../services/mockData';
import { StatusBadge } from '../components/StatusBadge';
import { Loader } from '../components/Loader';
import {
  Play,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';

interface DashboardPageProps {
  onStartNewWorkflow: () => void;
  onSelectWorkflow: (workflowId: string) => void;
  onNavigateToTools: () => void;
  onNavigateToAudit: (workflowId?: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onStartNewWorkflow,
  onSelectWorkflow,
  onNavigateToTools,
  onNavigateToAudit,
}) => {
  const [workflows, setWorkflows] = useState<Workflow[]>(() => INITIAL_SAMPLE_WORKFLOWS);
  const [tools, setTools] = useState<Tool[]>(() => INITIAL_REGISTERED_TOOLS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadDashboardData = async () => {
      try {
        const [wfRes, toolRes] = await Promise.all([
          apiService.getWorkflows(),
          apiService.getTools(),
        ]);
        if (isMounted) {
          if (wfRes.success && wfRes.data && wfRes.data.length > 0) {
            setWorkflows(wfRes.data);
          }
          if (toolRes.success && toolRes.data && toolRes.data.length > 0) {
            setTools(toolRes.data);
          }
        }
      } catch (err) {
        console.warn('[DashboardPage] Background sync failed:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadDashboardData();
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading && workflows.length === 0) {
    return <Loader message="Loading dashboard..." />;
  }

  const completedCount = workflows.filter((w) => w.status === 'COMPLETED').length;
  const pendingApprovalCount = workflows.filter((w) => w.status === 'WAITING_FOR_APPROVAL').length;

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      {/* Top Banner & Quick Action */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white p-6 sm:p-8 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-xl space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-100/80 px-3 py-0.5 text-xs font-bold text-blue-800">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
              AI Assistant with Built-in Safety Checkpoints
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              Smart Task Planner
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Automate everyday tasks with AI while keeping total control.
              The AI plans what needs to be done, and asks for your approval before making any sensitive changes.
            </p>
          </div>

          <div>
            <button
              type="button"
              onClick={onStartNewWorkflow}
              className="inline-flex items-center gap-2.5 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-blue-700 hover:shadow-lg focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all"
            >
              <Sparkles className="h-4 w-4" />
              Start New Task
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Tasks
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Play className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900">{workflows.length}</span>
            <span className="ml-2 text-xs text-slate-500">tasks run</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Completed
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-emerald-600">{completedCount}</span>
            <span className="ml-2 text-xs text-slate-500">successful</span>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
              Pending Approvals
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-amber-800">{pendingApprovalCount}</span>
            <span className="ml-2 text-xs text-amber-700">action required</span>
          </div>
        </div>

        <div
          onClick={onNavigateToTools}
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:border-blue-300 cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Approved Actions
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Wrench className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div>
              <span className="text-2xl font-bold text-slate-900">{tools.length}</span>
              <span className="ml-2 text-xs text-slate-500">allowed actions</span>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </div>
        </div>
      </div>

      {/* Pending Approvals Spotlight */}
      {pendingApprovalCount > 0 && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50/80 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500 text-white shadow-xs animate-pulse">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-950">
                  Approval Required
                </h3>
                <p className="text-xs text-amber-800">
                  One or more tasks are paused waiting for your review before making any sensitive changes.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onStartNewWorkflow}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-700 transition-colors"
            >
              Review Paused Tasks
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Recent Workflows Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50/70 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Recent Task Runs</h2>
            <p className="text-xs text-slate-500">
              Recent tasks planned and run by the system.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onNavigateToAudit()}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800"
          >
            View Full History Log →
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-6">Task Goal</th>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Created</th>
                <th className="py-3 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {workflows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No tasks found. Click "Start New Task" above to begin.
                  </td>
                </tr>
              ) : (
                workflows.map((wf) => (
                  <tr key={wf.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-4 px-6">
                      <div className="font-semibold text-slate-900 max-w-md line-clamp-1">
                        {wf.goal}
                      </div>
                      <span className="font-mono text-[11px] text-slate-400">ID: {wf.id}</span>
                    </td>
                    <td className="py-4 px-4 font-mono text-slate-600 text-[11px]">
                      {wf.user_id}
                    </td>
                    <td className="py-4 px-4">
                      <StatusBadge status={wf.status} size="sm" />
                    </td>
                    <td className="py-4 px-4 text-slate-500 text-[11px] whitespace-nowrap">
                      {new Date(wf.created_at).toLocaleString()}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectWorkflow(wf.id)}
                        className="inline-flex items-center gap-1 rounded-md bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors"
                      >
                        Open
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
