import React, { useState } from 'react';
import type { Tool } from '../types';
import { RiskBadge } from './StatusBadge';
import {
  Wrench,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  FileCode2,
} from 'lucide-react';

interface ToolRegistryTableProps {
  tools: Tool[];
}

export const ToolRegistryTable: React.FC<ToolRegistryTableProps> = ({ tools }) => {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const toggleRow = (toolId: string) => {
    setExpandedRow(expandedRow === toolId ? null : toolId);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
            <Wrench className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Approved Action List</h3>
            <p className="text-xs text-slate-500">
              List of allowed actions. The AI can only use actions from this approved list.
            </p>
          </div>
        </div>
        <span className="text-xs font-medium text-slate-500 bg-white px-2.5 py-1 rounded-md border border-slate-200">
          {tools.length} Approved Actions
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
            <tr>
              <th className="py-3 px-4 w-10"></th>
              <th className="py-3 px-4">Action Name</th>
              <th className="py-3 px-4">Description</th>
              <th className="py-3 px-4">Risk Level</th>
              <th className="py-3 px-4">Requires Approval?</th>
              <th className="py-3 px-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {tools.map((tool) => {
              const isExpanded = expandedRow === tool.id;
              return (
                <React.Fragment key={tool.id}>
                  <tr
                    onClick={() => toggleRow(tool.id)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    <td className="py-3.5 px-4 text-slate-400">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-blue-600" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      <span className="bg-slate-100 px-2 py-1 rounded border border-slate-200">
                        {tool.name}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 max-w-md leading-relaxed">
                      {tool.description}
                    </td>
                    <td className="py-3.5 px-4">
                      <RiskBadge level={tool.risk_level} />
                    </td>
                    <td className="py-3.5 px-4">
                      {tool.requires_approval ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
                          <ShieldAlert className="h-3 w-3" />
                          Yes (You Approve First)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 border border-slate-200">
                          <ShieldCheck className="h-3 w-3 text-slate-400" />
                          No (Runs Automatically)
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200">
                        Ready
                      </span>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="bg-slate-50/90">
                      <td colSpan={6} className="p-4 pl-12">
                        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 mb-2">
                            <FileCode2 className="h-4 w-4 text-blue-600" />
                            <span>Expected Information Format:</span>
                          </div>
                          <pre className="p-3 bg-slate-900 text-slate-100 rounded-md font-mono text-xs overflow-x-auto">
                            {JSON.stringify(tool.input_schema, null, 2)}
                          </pre>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
