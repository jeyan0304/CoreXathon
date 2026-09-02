A. General Coding Rules
Keep code simple: Write code that is easy to read, not code that looks clever.

Use clear names: Name variables exactly what they are.

Keep functions focused: One function does one thing. Do not mix database saving and AI calling in the same function.

Handle errors explicitly: Always use try/catch blocks. Never ignore an error silently.

B. Naming Rules
Files / Components: PascalCase (e.g., WorkflowTimeline.tsx).

Functions / Variables: camelCase (e.g., executeTool, isApproved).

Database Tables / Columns: snake_case (e.g., workflow_steps, user_id).

API Endpoints: kebab-case nouns (e.g., /api/workflow-runs).

AI Tools: snake_case (e.g., search_information).

C. Folder / Project Structure
/components: Reusable UI pieces (Buttons, Modals, Timeline).

/pages: Main application screens (Dashboard, Workflow Execution).

/api or /server: Backend endpoints and orchestration logic.

/lib: Shared utilities (database client setup, AI configuration).

/types: TypeScript interfaces shared across the whole app.

D. Frontend Conventions
UI State: Use React state for immediate UI changes. Use the database for workflow progress.

Loading States: Always show a spinner or skeleton when waiting for the backend.

Approval UI: Must be clearly visible. Do not hide approvals in small dropdowns.

API Communication: Use standard fetch or a lightweight wrapper. Always handle the non-200 response cases.

E. Backend Conventions
Validation: Use Zod to validate all incoming requests and all AI outputs.

Database Access: Never trust the frontend. Always re-verify IDs and permissions in the backend before updating a row.

State Updates: When updating a step to FAILED, always write the reason to the audit log in the exact same function.

F. AI Conventions
AI SHOULD: Parse text, generate step-by-step plans, and format data to match our tools.

AI SHOULD NOT: Decide if a user is an admin.

AI SHOULD NOT: Bypass an approval requirement.

AI SHOULD NOT: Execute tools itself. It only outputs text/JSON saying "I want to execute this tool."

G. Tool Conventions
Every tool must be registered in the database with:

Name: Unique identifier (e.g., update_record).

Description: What it does.

Input Schema: The exact JSON structure it requires to run.

Approval Requirement: A simple true/false flag determining if a human must click approve before it runs.

H. State Conventions
We use simple, clear words for workflow status:

PENDING: Waiting to start.

RUNNING: Currently doing work.

WAITING_FOR_APPROVAL: Paused, waiting for a human to click approve.

FAILED: Something went wrong.

RETRYING: Trying a failed step again.

COMPLETED: Finished successfully.

I. Git / Collaboration Rules
Branches: Use short, clear names (e.g., feat-timeline, fix-approval-bug).

Commits: Say what you did (e.g., fix: catch AI timeout error).

Merging: Keep branches small. Merge frequently to avoid massive conflicts at the end of the hackathon.

J. API Contract Rules
Requests: Frontend sends JSON.

Responses: Backend returns JSON with a clear { success: true, data: ... } or { success: false, error: ... } structure.

K. Database Rules
IDs: Use UUIDs for all primary keys.

Timestamps: Every table must have a created_at column.

Audit Records: Never delete audit records. They are append-only.

L. Error Handling Rules
AI Timeout: Catch it, mark step FAILED, tell the user "AI took too long."

Invalid Arguments: Catch it, mark step FAILED, tell the user "AI generated bad data."

Network Failure: Catch it, mark step FAILED, allow the user to click Retry.

M. Testing Rules
Core Flow: The most important test is running the demo flow end-to-end. If the demo flow breaks, stop everything and fix it.

Approvals: Verify that a tool requiring approval CANNOT run until the approval API is explicitly called.

N. Documentation Rules
If you change how a core piece of the app works, tell the team immediately.

Keep the code clean enough that it acts as its own documentation.

O. IMPORTANT SHARED DOCUMENT RULE
PROJECT_SPEC.md, DESIGN.md, and CONVENTIONS.md are the single source of truth for the entire team.
Coding agents and developers MUST NOT casually delete, replace, or modify these files.
If the architecture must change, discuss it with the team first and update these files intentionally.