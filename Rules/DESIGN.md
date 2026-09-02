A. System Architecture
Plaintext
User Input (Goal) 
       ↓
[ FRONTEND ] 
       ↓
[ BACKEND API ]  ←--→  [ AI PLANNER (OpenAI) ]
       ↓                       (Returns Structured Plan)
[ POLICY / CONTROL GATE ] 
       ↓ (Validates schemas, checks permissions)
[ STATE MANAGER ] ←--→ [ SUPABASE POSTGRESQL ]
       ↓ (Persists steps, states, audit logs)
[ TOOL EXECUTOR ] 
       ↓ (Halts if Approval required)
[ HUMAN APPROVAL ] (Frontend UI prompts user)
       ↓
[ EXTERNAL API / ACTION ]
       ↓
[ RECOVERY ENGINE ] (Handles retries/failures)
Responsibilities:

Frontend: Renders state, captures user intent, handles approval clicks.

Backend: Validates AI output, enforces security rules, orchestrates the engine.

AI Planner: Translates goals to steps.

Supabase: Source of truth for all workflow states and audit logs.

B. AI Brain vs Control Brain
AI Brain: Understands intent, plans the sequence, reasons about required arguments, and selects tools from the registry.

Control Brain: Validates the arguments, checks the user's authorization, halts for required approvals, actually executes the tool function, persists the data, and records the audit event.

C. Frontend Pages / Screens
We are using a Light Theme. Design language: Calm, safe, modern, professional (white backgrounds, subtle gray borders, clear blue/green/red status indicators, ample whitespace).

Dashboard: Overview of recent workflows, their statuses, and pending approvals.

Create Workflow / Goal Input: A clean, focused text area for natural language input ("What do you want to automate?").

AI-Generated Plan: A preview screen showing the steps the AI intends to take, allowing the user to click "Start Execution".

Workflow Execution (Timeline): The primary view. A vertical stepper showing steps in real-time.

Human Approval: A modal or inline card that interrupts the timeline, displaying the proposed action in clear text with large Approve/Reject buttons.

Failure and Recovery: Inline error states on the timeline with a distinct "Retry Step" button.

Tool Registry: A read-only table showing available tools, schemas, and risk levels.

Audit Trail: A chronological table of all system events, filterable by workflow or user.

D. MOST IMPORTANT FRONTEND FLOW
The Hackathon Demo Path:
Dashboard → Create Workflow → Enter Goal → Generate AI Plan → Review Plan → Run Workflow → Execution Timeline visible → Tool 1 SUCCESS (Green Check) → Tool 2 APPROVAL REQUIRED (Yellow Pause Icon) → Approval UI appears → User clicks Approve → Tool 2 SUCCESS → Tool 3 FAILURE (Red X) → User clicks Retry → Tool 3 SUCCESS → Workflow Completed (Confetti/Green Status) → User navigates to Audit Trail to review the logs.

E. Tool Registry UI
Layout: Simple data table.

Columns: Tool Name (search_information), Description, Risk Level (Low/High), Approval Required (Yes/No badge), Status (Active).

Row Expansion: Clicking a row reveals the JSON Input Schema.

F. Approval UI
Visuals: High-contrast card (e.g., light blue background to distinguish from standard steps).

Data Displayed: "Action Paused: Approval Required for update_record".

Context: Shows the exact JSON payload the AI generated so the human knows exactly what is being approved.

Controls: Primary Button (Approve), Secondary Button (Reject).

G. Execution Timeline
Visuals: Vertical line connecting step cards.

States:

Pending: Gray circle.

Running: Blue spinning indicator.

Waiting for Approval: Yellow pulsing indicator.

Failed: Red X with error message box.

Completed: Green checkmark.

Details: Each card shows the tool name and a brief summary of the output.

H. Failure/Recovery UI
Display: When a step fails, the card border turns red.

Data: Displays the exact error message (e.g., "Network timeout" or "Schema validation failed").

Controls: A "Retry Step" button and an "Abort Workflow" button.

I. Audit UI
Layout: Chronological data table.

Columns: Timestamp, Actor (AI, System, or User Email), Action (e.g., WORKFLOW_STARTED, TOOL_EXECUTED, HUMAN_APPROVED), Result (Success/Failure).

J. Database / Data Model (Logical)
users: Standard auth table.

tools: id, name, description, input_schema, requires_approval.

workflows: id, user_id, goal, status, created_at.

workflow_steps: id, workflow_id, tool_id, step_order, arguments, output, status, retry_count.

audit_logs: id, workflow_id, step_id, actor, action, details, created_at.

K. API Boundaries
Frontend → Backend: POST /api/workflows (Start), POST /api/workflows/:id/approve (Approve), POST /api/workflows/:id/retry (Retry).

Backend → AI: POST /v1/chat/completions (OpenAI API for planning/tool arguments).

Backend → Tool execution: Internal function routing based on tool_id.

Backend → Supabase: Direct PostgreSQL queries/mutations for state and auditing.

L. Failure Handling Architecture
AI Timeout: Backend aborts API call after 15s, marks step FAILED.

Malformed AI Output: Backend attempts to parse JSON. If it fails Zod validation, step marked FAILED.

Tool/Backend Failure: Try/catch blocks around tool execution. Errors are caught, saved to the output column, and step is marked FAILED.

Resume: When "Retry" is hit, backend fetches the workflow, identifies the first step not COMPLETED, and resumes execution from that exact node.

M. Scaling Approach
Current: Synchronous sequential execution for the MVP.

Future: Implement a message queue (like RabbitMQ or Redis/BullMQ). The Planner puts steps on the queue; stateless worker nodes pick up steps, execute them, and update the database, allowing infinite horizontal scaling for concurrent workflows.

N. Security Architecture
UI is just a view: The frontend cannot force a tool to run. It only sends an approval intent to the backend.

Backend Enforcement: The /approve endpoint verifies the user's session token and checks if they have permission to approve that specific tool.

Validation: All AI output is treated as untrusted user input and strictly validated against defined schemas before execution.