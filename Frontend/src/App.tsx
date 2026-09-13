import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import type { ActiveTab } from './components/Navbar';
import { DashboardPage } from './pages/DashboardPage';
import { WorkflowExecutionPage } from './pages/WorkflowExecutionPage';
import { ToolRegistryPage } from './pages/ToolRegistryPage';
import { AuditTrailPage } from './pages/AuditTrailPage';
import { apiService } from './services/api';
import { getAccessToken, signOut } from './services/auth';
import { SignInPage } from './components/SignInPage';

export function App() {
  const [authenticated, setAuthenticated] = useState(() => Boolean(getAccessToken()));
  const [activeTab, setActiveTab] = useState<ActiveTab>('workflow');
  const [auditFilter, setAuditFilter] = useState<string | undefined>(undefined);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);

  useEffect(() => {
    const handleUnauthorized = () => setAuthenticated(false);
    window.addEventListener('corexathon:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('corexathon:unauthorized', handleUnauthorized);
  }, []);

  // Poll or check for pending approvals to badge the nav using recursive setTimeout
  useEffect(() => {
    if (!authenticated) return;
    let isSubscribed = true;
    let timerId: ReturnType<typeof setTimeout> | undefined;

    const checkApprovals = async () => {
      try {
        const res = await apiService.getWorkflows();
        if (isSubscribed && res.success) {
          const waiting = res.data.filter((w) => w.status === 'WAITING_FOR_APPROVAL').length;
          setPendingApprovalsCount(waiting);
        }
      } catch (err) {
        console.error('Failed to poll approvals:', err);
      } finally {
        if (isSubscribed) {
          timerId = setTimeout(checkApprovals, 2000);
        }
      }
    };

    checkApprovals();
    return () => {
      isSubscribed = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [authenticated]);

  if (!authenticated) {
    return <SignInPage onSignedIn={() => setAuthenticated(true)} />;
  }

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
          <button type="button" className="text-slate-500 hover:text-slate-800" onClick={() => void signOut()}>Sign out</button>
        </div>
      </footer>
    </div>
  );
}

export default App;
