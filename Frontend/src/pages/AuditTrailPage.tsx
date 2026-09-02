import React, { useState, useEffect } from 'react';
import type { AuditLog } from '../types';
import { apiService } from '../services/api';
import { AuditLogTable } from '../components/AuditLogTable';
import { Loader } from '../components/Loader';
import { RotateCcw, ShieldCheck } from 'lucide-react';

interface AuditTrailPageProps {
  initialWorkflowFilter?: string;
}

export const AuditTrailPage: React.FC<AuditTrailPageProps> = ({
  initialWorkflowFilter,
}) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    apiService.getAuditLogs(initialWorkflowFilter).then((res) => {
      if (isMounted) {
        if (res.success) setLogs(res.data);
        else setError(res.error);
        setLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [initialWorkflowFilter]);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const res = await apiService.getAuditLogs(initialWorkflowFilter);
      if (res.success) {
        setLogs(res.data);
        setError(null);
      } else {
        setError(res.error);
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Loader message="Loading history logs..." />;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Header card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 mb-2">
              <ShieldCheck className="h-3.5 w-3.5" />
              Activity History
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              History Log
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 max-w-3xl leading-relaxed">
              Every action, approval, error, and retry is permanently recorded with a timestamp so you always know what happened.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Refresh Logs
          </button>
        </div>
      </div>

      {/* Audit Log Table */}
      {error && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</p>}
      <AuditLogTable logs={logs} />
    </div>
  );
};
