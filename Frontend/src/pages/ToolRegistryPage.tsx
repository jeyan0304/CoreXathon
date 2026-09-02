import React, { useState, useEffect } from 'react';
import type { Tool } from '../types';
import { apiService } from '../services/api';
import { ToolRegistryTable } from '../components/ToolRegistryTable';
import { Loader } from '../components/Loader';
import { ShieldCheck, Info } from 'lucide-react';

export const ToolRegistryPage: React.FC = () => {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTools = async () => {
      setLoading(true);
      try {
        const res = await apiService.getTools();
        if (res.success) setTools(res.data);
      } finally {
        setLoading(false);
      }
    };

    loadTools();
  }, []);

  if (loading) {
    return <Loader message="Loading approved actions..." />;
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Header card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 mb-2">
              <ShieldCheck className="h-3.5 w-3.5" />
              Approved Action List
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Approved Action List
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 max-w-3xl leading-relaxed">
              The AI is only allowed to use actions from this approved list.
              Any unknown or made-up actions are immediately stopped before they can run.
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 max-w-xs">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800 mb-1">
              <Info className="h-3.5 w-3.5 text-blue-600" />
              <span>Safety Rule:</span>
            </div>
            <span>
              Actions marked with <strong>Requires Approval = Yes</strong> will pause and ask for your sign-off first.
            </span>
          </div>
        </div>
      </div>

      {/* Tool Table */}
      <ToolRegistryTable tools={tools} />
    </div>
  );
};
