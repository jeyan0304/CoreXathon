import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import type { ActiveTab } from './components/Navbar';
import { DashboardPage } from './pages/DashboardPage';
import { WorkflowExecutionPage } from './pages/WorkflowExecutionPage';
import { ToolRegistryPage } from './pages/ToolRegistryPage';
import { AuditTrailPage } from './pages/AuditTrailPage';
import { apiService } from './services/api';
import { ShieldCheck } from 'lucide-react';

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('workflow');
  const [auditFilter, setAuditFilter] = useState<string | undefined>(undefined);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);

  // Poll or check for pending approvals to badge the nav
  useEffect(() => {
    const checkApprovals = async () => {
      const res = await apiService.getWorkflows();
      if (res.success) {
        const waiting = res.data.filter((w) => w.status === 'WAITING_FOR_APPROVAL').length;
        setPendingApprovalsCount(waiting);
      }
    };

    checkApprovals();
    const interval = setInterval(checkApprovals, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleNavigateToAudit = (workflowId?: string) => {
    setAuditFilter(workflowId);
    setActiveTab('audit');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingApprovalsCount={pendingApprovalsCount}
      />

      {/* Sub-header Banner - Team Roles & Status */}
      <div className="border-b border-slate-200 bg-white/60 px-4 py-2 text-xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-slate-500">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
            <span className="font-semibold text-slate-700">Team Contract:</span>
            <span>Person 1 (Frontend + AI Integration)</span>
            <span className="text-slate-300">|</span>
            <span>Person 2 (Backend + Supabase)</span>
            <span className="text-slate-300">|</span>
            <span>Person 3 (AI Agent)</span>
          </div>

          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span className="font-medium text-slate-700">
              Safety Checkpoint: Active
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12">
        {activeTab === 'dashboard' && (
          <DashboardPage
            onStartNewWorkflow={() => setActiveTab('workflow')}
            onSelectWorkflow={() => setActiveTab('workflow')}
            onNavigateToTools={() => setActiveTab('tools')}
            onNavigateToAudit={handleNavigateToAudit}
          />
        )}

        {activeTab === 'workflow' && (
          <WorkflowExecutionPage onNavigateToAudit={handleNavigateToAudit} />
        )}

        {activeTab === 'tools' && <ToolRegistryPage />}

        {activeTab === 'audit' && (
          <AuditTrailPage initialWorkflowFilter={auditFilter} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-2">
          <span>
            CoreX • <strong>Core Idea:</strong> The AI plans tasks, but you stay in control of what actually runs.
          </span>
          <span className="text-slate-400">
            Safe • Transparent • Recoverable
          </span>
        </div>
      </footer>
    </div>
  );
}

export default App;
