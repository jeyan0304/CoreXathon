import React from 'react';
import type { PlannedStepPreview, Workflow } from '../types';
import { RiskBadge } from './StatusBadge';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Play,
  FileCode2,
  CheckCircle2,
} from 'lucide-react';

interface PlanPreviewProps {
  workflow: Workflow;
  plan: PlannedStepPreview[];
  onStartExecution: () => void;
  onReset: () => void;
  isStarting?: boolean;
}

export const PlanPreview: React.FC<PlanPreviewProps> = ({
  workflow,
  plan,
  onStartExecution,
  onReset,
  isStarting = false,
}) => {
  return (
    <div className="rounded-xl border border-blue-200 bg-gradient-to-b from-blue-50/40 via-white to-white p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
              <Sparkles className="h-3.5 w-3.5 text-blue-600" />
              Proposed Step-by-Step Plan
            </span>
            <span className="text-xs font-mono text-slate-500">ID: {workflow.id}</span>
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            Plan Ready for Your Review
          </h3>
          <p className="text-xs text-slate-600 max-w-2xl">
            Goal: <span className="font-semibold text-slate-900">"{workflow.goal}"</span>
          </p>
        </div>

        {/* Safety Checkpoint Status */}
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
          <div>
            <span className="font-bold block text-emerald-800">Safety Checkpoint</span>
            <span className="text-emerald-700">3 actions verified on list • 1 approval checkpoint ready</span>
          </div>
        </div>
      </div>

      {/* Core idea banner */}
      <div className="my-4 rounded-lg bg-slate-100/80 border border-slate-200 px-4 py-2.5 text-xs text-slate-600 flex items-center justify-between">
        <span className="italic">
          "The AI proposes the steps; you stay in control of what actually runs."
        </span>
        <span className="text-[11px] font-medium text-slate-500">100% Transparent</span>
      </div>

      {/* Plan Steps Sequence */}
      <div className="space-y-3 mt-4">
        {plan.map((step, idx) => (
          <div
            key={idx}
            className={`rounded-lg border p-4 transition-all ${
              step.requires_approval
                ? 'border-amber-300 bg-amber-50/30'
                : 'border-slate-200 bg-white'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">
                  {step.step_order}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      {step.tool_name}
                    </span>
                    <RiskBadge level={step.risk_level} />
                    {step.requires_approval ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded">
                        <ShieldAlert className="h-3 w-3 text-amber-600" />
                        Human Approval Required
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        Safe Automatic Action
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                    {step.reasoning}
                  </p>
                </div>
              </div>
            </div>

            {/* Proposed Task Details */}
            <div className="mt-3 pl-10">
              <div className="rounded bg-slate-50 border border-slate-200 p-2.5 text-[11px] font-mono text-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <FileCode2 className="h-3.5 w-3.5 text-slate-400" />
                  <span>Task Details:</span>
                  <span className="text-slate-900 font-semibold truncate max-w-md">
                    {JSON.stringify(step.arguments)}
                  </span>
                </div>
                <span className="text-emerald-700 text-[10px] uppercase font-bold tracking-wider">
                  Details Checked
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Action Footer */}
      <div className="mt-6 pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onReset}
          className="text-xs font-medium text-slate-600 hover:text-slate-900 underline underline-offset-2"
        >
          Edit Goal
        </button>

        <button
          type="button"
          onClick={onStartExecution}
          disabled={isStarting}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-all disabled:opacity-50"
        >
          <Play className="h-4 w-4 fill-white" />
          {isStarting ? 'Starting Tasks...' : 'Start Tasks'}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
