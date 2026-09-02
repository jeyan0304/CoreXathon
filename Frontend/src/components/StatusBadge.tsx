import React from 'react';
import type { StepStatus, ToolRiskLevel } from '../types';
import {
  Clock,
  Loader2,
  AlertTriangle,
  XCircle,
  RotateCcw,
  CheckCircle2,
  Ban,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';

interface StatusBadgeProps {
  status: StepStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true,
}) => {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs font-medium px-2.5 py-1 gap-1.5',
    lg: 'text-sm font-medium px-3 py-1.5 gap-2',
  }[size];

  switch (status) {
    case 'PENDING':
      return (
        <span
          className={`inline-flex items-center rounded-full bg-slate-100 text-slate-600 border border-slate-200 ${sizeClasses}`}
        >
          {showIcon && <Clock className="w-3.5 h-3.5 text-slate-400" />}
          Pending
        </span>
      );
    case 'RUNNING':
    case 'IN_PROGRESS':
      return (
        <span
          className={`inline-flex items-center rounded-full bg-blue-50 text-blue-700 border border-blue-200 ${sizeClasses}`}
        >
          {showIcon && <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />}
          Running
        </span>
      );
    case 'WAITING_FOR_APPROVAL':
      return (
        <span
          className={`inline-flex items-center rounded-full bg-amber-50 text-amber-800 border border-amber-300 animate-pulse ${sizeClasses}`}
        >
          {showIcon && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
          Approval Required
        </span>
      );
    case 'FAILED':
      return (
        <span
          className={`inline-flex items-center rounded-full bg-rose-50 text-rose-700 border border-rose-200 ${sizeClasses}`}
        >
          {showIcon && <XCircle className="w-3.5 h-3.5 text-rose-600" />}
          Failed
        </span>
      );
    case 'RETRYING':
      return (
        <span
          className={`inline-flex items-center rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 ${sizeClasses}`}
        >
          {showIcon && <RotateCcw className="w-3.5 h-3.5 text-indigo-600 animate-spin" />}
          Retrying
        </span>
      );
    case 'COMPLETED':
      return (
        <span
          className={`inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 ${sizeClasses}`}
        >
          {showIcon && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
          Completed
        </span>
      );
    case 'ABORTED':
      return (
        <span
          className={`inline-flex items-center rounded-full bg-gray-100 text-gray-700 border border-gray-300 ${sizeClasses}`}
        >
          {showIcon && <Ban className="w-3.5 h-3.5 text-gray-500" />}
          Aborted
        </span>
      );
    default:
      return (
        <span
          className={`inline-flex items-center rounded-full bg-gray-100 text-gray-600 ${sizeClasses}`}
        >
          {status}
        </span>
      );
  }
};

interface RiskBadgeProps {
  level: ToolRiskLevel;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ level }) => {
  if (level === 'HIGH') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200">
        <ShieldAlert className="w-3 h-3 text-rose-500" />
        HIGH RISK
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
      <ShieldCheck className="w-3 h-3 text-emerald-600" />
      LOW RISK
    </span>
  );
};
