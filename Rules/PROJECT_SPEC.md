PROJECT_SPEC.md
A. Problem Statement
We are building an agent-assisted workflow engine that plans and executes multi-step tasks using registered tools. The system must remain strictly controllable and recoverable, requiring human approval for sensitive actions and maintaining a detailed audit trail.

B. Problem We Are Solving
Organizations want to leverage AI for workflow automation, but current AI agents operate as unpredictable "black boxes." Uncontrolled AI execution introduces severe risks: hallucinated actions, unintended data modification, and infinite loops. Businesses need the reasoning power of AI paired with the deterministic safety of traditional software.

C. Target Users
IT/Software Teams: Automating infrastructure and deployment workflows.

Business Employees: Automating data entry, reporting, and customer communication.

Managers/Team Leaders: Overseeing team operations and approving sensitive automated actions.

Developers: Creating and registering safe, bounded tools for the AI to utilize.

D. Target Customers
Organizations that want AI-powered workflow automation but require strong control over permissions, sensitive actions, failures, approvals, and auditing. This is for enterprises where security and compliance cannot be delegated to an LLM.

E. Core Product Idea
AI proposes; deterministic control decides what is actually allowed to execute.
The AI acts strictly as a reasoning and planning engine. The application backend acts as a strict policy gate, enforcing schemas, permissions, and approvals before any real-world action occurs.

F. Mandatory PS Requirements
[x] Tool registry with schemas: A database table defining tools, their expected inputs (JSON schema), and metadata. Why: Ensures AI only uses known tools with correct data.

[x] Permission metadata: Tool definitions include risk levels and roles. Why: Prevents unauthorized users/agents from triggering sensitive tools.

[x] At least 3 working tools: search_information, update_record, and send_notification. Why: Proves the orchestration engine works end-to-end.

[x] Goal-to-step planning: AI translates a prompt like "Update the Q3 report" into discrete steps. Why: Core agentic behavior.

[x] Validated tool arguments: Deterministic logic checks AI output against the tool's schema. Why: Prevents malformed API calls.

[x] Registered-tool-only execution: The system rejects any hallucinated tool not in the database. Why: Security constraint.

[x] Permission checks: Backend verifies if the current context allows the tool. Why: Zero-trust architecture.

[x] Persistent workflow state: Current progress is saved in Supabase. Why: Survives browser refreshes and server restarts.

[x] Persistent execution state: Individual step statuses (e.g., RUNNING, FAILED) are saved. Why: Granular tracking.

[x] Retry: Users can manually re-trigger a failed step. Why: Real-world APIs fail.

[x] Resume after failure: Workflows pause on failure and continue from the exact failure point. Why: Prevents re-running expensive or mutating steps.

[x] Human approval checkpoint: High-risk tools pause the workflow until a human clicks "Approve." Why: Keeps a human in the loop for critical actions.

[x] Audit trail: Every execution, approval, and failure is logged. Why: Compliance and observability.

[x] Execution timeline: UI visually represents the plan, current step, and history. Why: User trust and transparency.

[x] Safety controls: Hardcoded backend rules restricting what can run. Why: Failsafe against prompt injection.

[x] Execution/loop limits: Max step count (e.g., 10) enforced deterministically. Why: Prevents infinite agent loops.

[x] Malformed AI output handling: If the AI outputs invalid JSON, it is caught, logged as a failure, and halted. Why: Graceful degradation.

[x] AI timeout handling: LLM requests have a strict timeout limit. Why: Prevents hung workflows.

[x] Meaningful component failure handling: If the database or tool API goes down, the step fails cleanly. Why: System resilience.

[x] Deterministic vs AI boundary: Strict separation in code between AI reasoning and execution logic. Why: Architectural integrity.

[x] Testing/evaluation approach: Core logic tested against mocked AI responses and real DB constraints. Why: Ensures hackathon demo stability.

G. Core User Flow
User enters goal → AI understands goal → AI generates structured plan → Plan is validated → Tools are selected → Policy/control gate checks the action → Low-risk action executes automatically → Sensitive action pauses for approval → Human approves/rejects → Tool executes if approved → State is persisted → Failure can trigger retry → Workflow can resume → Audit event is recorded → Execution timeline is updated → Workflow completes.

H. Example Demo Workflow
Goal: "Check the project status, update it if necessary, and notify the team."

AI Plan: Step 1: search_information, Step 2: update_record, Step 3: send_notification.

Execution 1: search_information runs cleanly (Low Risk).

Execution 2: update_record is flagged as Sensitive. Workflow pauses.

Approval: UI prompts the judge/user. User clicks "Approve". Tool executes.

Execution 3 (Deliberate Failure): send_notification fails due to a simulated network error.

Recovery: User clicks "Retry" on the failed step. It succeeds.

Completion: Timeline turns green; audit trail shows the approval, the failure, the retry, and the success.

I. Functional Requirements
Users can create a workflow via natural language text input.

System displays the AI-generated plan before execution (optional auto-start).

System executes steps sequentially.

System halts and generates a UI prompt for tools marked requires_approval.

System logs all state changes to a PostgreSQL database.

Users can view a paginated/filtered audit log of all system actions.

J. Non-Functional Requirements
Reliability: Workflows must not corrupt state if the user closes the browser.

Security: Users cannot execute tools they lack permissions for.

Auditability: 100% of state changes have a corresponding audit timestamp.

Explainability: The UI must show why a workflow is paused (e.g., "Awaiting approval for update_record").

Recoverability: Workflows can be resumed from the exact point of failure.

K. AI Requirements
AI Does: Parse user intent, break tasks into logical steps, select from a provided list of registered tools, and generate JSON-formatted arguments for those tools.

AI Does NOT: Connect directly to APIs, execute code, evaluate permissions, or decide if approval is bypassed.

Structured Output: AI must return strictly formatted JSON arrays matching the requested schema.

Malformed Output: Handled by a deterministic parser. If parsing fails, the step is marked FAILED with a validation error.

Timeout: AI calls exceeding 15 seconds will abort and mark the step FAILED.

L. Security Requirements
Authentication: Users must be logged in (or simulated as logged in for the demo) to trigger workflows.

Authorization & Permissions: Handled via Supabase RLS and backend middleware.

Sensitive Actions: Backend rejects execution of sensitive tools unless a corresponding approved_by record exists.

Secret Protection: API keys stored only in backend environment variables.

Input Validation: AI-generated arguments validated against Zod schemas before execution.

M. State Model
PENDING: Step is queued but not yet evaluated.

RUNNING: Step is currently interacting with AI or executing a tool.

WAITING_FOR_APPROVAL: Step requires a human to click Approve.

FAILED: Tool execution, validation, or network call failed.

RETRYING: User initiated a retry; transitions back to RUNNING.

COMPLETED: Step executed successfully.

ABORTED: User or system cancelled the workflow entirely.

N. Acceptance Criteria
End-to-end Test:

User enters: "Check the project status, update it if necessary, and notify the team."

AI creates a 3-step plan.

Tool 1 (search_information) succeeds automatically.

Tool 2 (update_record) pauses and displays a WAITING_FOR_APPROVAL state.

User clicks Approve; Tool 2 executes successfully.

Tool 3 (send_notification) is injected with a deliberate failure; state becomes FAILED.

User clicks Retry; Tool 3 succeeds.

Workflow transitions to COMPLETED.

The Audit Trail screen shows 1 plan creation, 1 approval, 1 failure, 1 retry, and 3 successes.

O. Evaluation Checklist Mapping
Working Product: End-to-end demo flow is functional.

System Design: Strict AI vs. Deterministic separation.

Core Programming: Clean state transitions and validation logic.

AI Engineering: Effective prompt engineering for structured JSON output.

Reliability: State persistence and failure recovery UI.

Security: Backend-enforced approvals and permissions.

Testing: End-to-end criteria established.

Observability: Visual execution timeline and audit trail.

Presentation: A clear, polished UI that tells the story of controlled AI.

P. Scope Control
MUST HAVE: Goal ingestion, AI planning, 3 registered tools, schema validation, approval checkpoint, retry/resume, audit log, visual timeline.

SHOULD HAVE: Real-time UI updates (WebSockets/Supabase real-time).

NICE TO HAVE: Dark mode toggle, complex data visualizations for tool outputs.

OUT OF SCOPE: Dynamic tool creation via UI, parallel step execution, branching workflows (if/else logic in the plan).