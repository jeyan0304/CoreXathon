"""FastAPI boundary for the deterministic workflow engine."""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import Depends, FastAPI, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from control_gate import ControlGateError, WorkflowControlGate
from database import DatabaseError, getDatabase


repositoryRoot = Path(__file__).resolve().parent.parent
if str(repositoryRoot) not in sys.path:
    sys.path.append(str(repositoryRoot))

from planner import generate_plan


logger = logging.getLogger("workflow_backend")
app = FastAPI(title="AI Workflow Automation Platform", version="1.0.0")

# --- CORS Configuration Added Here ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# -------------------------------------

_controlGate: Optional[WorkflowControlGate] = None


class CreateWorkflowRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    goal: str = Field(min_length=1, max_length=4000)


class PlanStepRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tool_name: str = Field(min_length=1)
    arguments: Dict[str, Any]


class StorePlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    steps: List[PlanStepRequest] = Field(min_length=1, max_length=10)


def success(data: Any, statusCode: int = 200) -> JSONResponse:
    return JSONResponse(status_code=statusCode, content={"success": True, "data": data})


def failure(statusCode: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=statusCode,
        content={"success": False, "error": {"code": code, "message": message}},
    )


@app.exception_handler(ControlGateError)
async def handleControlGateError(request: Request, error: ControlGateError) -> JSONResponse:
    return failure(error.statusCode, error.code, error.message)


@app.exception_handler(RequestValidationError)
async def handleValidationError(request: Request, error: RequestValidationError) -> JSONResponse:
    return failure(422, "INVALID_REQUEST", "Request data is invalid.")


@app.exception_handler(StarletteHTTPException)
async def handleHttpError(request: Request, error: StarletteHTTPException) -> JSONResponse:
    if error.status_code == 404:
        return failure(404, "NOT_FOUND", "Endpoint not found.")
    if error.status_code == 405:
        return failure(405, "METHOD_NOT_ALLOWED", "Method not allowed.")
    return failure(error.status_code, "HTTP_ERROR", "The request could not be completed.")


@app.exception_handler(DatabaseError)
async def handleDatabaseError(request: Request, error: DatabaseError) -> JSONResponse:
    logger.error(
        "Database operation failed",
        extra={"path": request.url.path},
        exc_info=error,
    )
    return failure(503, "DATABASE_ERROR", "The database is temporarily unavailable.")


@app.exception_handler(Exception)
async def handleUnexpectedError(request: Request, error: Exception) -> JSONResponse:
    logger.exception("Unhandled backend error", extra={"path": request.url.path})
    return failure(500, "INTERNAL_ERROR", "An unexpected server error occurred.")


def getControlGate() -> WorkflowControlGate:
    global _controlGate
    if _controlGate is None:
        database = getDatabase()
        database.seedDemoTools()
        _controlGate = WorkflowControlGate(database)
    return _controlGate


def getPlanner():
    return generate_plan


def normalizePlannerSteps(plan: Any) -> List[Dict[str, Any]]:
    if not isinstance(plan, dict) or not isinstance(plan.get("steps"), list):
        raise ControlGateError("PLANNING_FAILED", "The planner returned malformed output.", 422)

    normalized = []
    for step in plan["steps"]:
        if not isinstance(step, dict):
            raise ControlGateError("PLANNING_FAILED", "The planner returned malformed output.", 422)
        toolName = step.get("tool_name") or step.get("tool")
        arguments = step.get("arguments")
        if not isinstance(toolName, str) or not isinstance(arguments, dict):
            raise ControlGateError("PLANNING_FAILED", "The planner returned malformed output.", 422)
        normalized.append(
            {
                "tool_name": toolName,
                "arguments": {key: value for key, value in arguments.items() if value is not None},
            }
        )

    if not normalized:
        raise ControlGateError(
            "PLANNING_FAILED",
            "The planner did not produce executable registered-tool steps.",
            422,
        )
    return normalized


def workflowSnapshot(
    gate: WorkflowControlGate, userId: UUID, workflowId: UUID
) -> Dict[str, Any]:
    """Return the single authoritative workflow representation for UI clients."""
    workflow = gate.getWorkflow(userId, workflowId)
    return {"workflow": {key: value for key, value in workflow.items() if key != "steps"}, "steps": workflow["steps"]}


def getCurrentUserId(
    authorization: Optional[str] = Header(default=None),
    gate: WorkflowControlGate = Depends(getControlGate),
) -> UUID:
    """Demo authentication boundary.

    The bearer value is a user UUID. In deployment this dependency should be
    replaced with Supabase JWT verification; ownership is still rechecked by
    the control gate on every workflow operation.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise ControlGateError(
            "UNAUTHORIZED", "A valid bearer user ID is required.", 401
        )
    token = authorization.removeprefix("Bearer ").strip()
    try:
        UUID(token)
    except (ValueError, AttributeError) as error:
        raise ControlGateError(
            "UNAUTHORIZED", "A valid bearer user ID is required.", 401
        ) from error
    return gate.authenticateToken(token)


@app.get("/health")
def health() -> JSONResponse:
    return success({"status": "ok"})


@app.post("/api/workflows", status_code=201)
def createWorkflow(
    payload: CreateWorkflowRequest,
    userId: UUID = Depends(getCurrentUserId),
    gate: WorkflowControlGate = Depends(getControlGate),
    planner=Depends(getPlanner),
) -> JSONResponse:
    try:
        plan = planner(payload.goal)
    except Exception as error:
        raise ControlGateError(
            "PLANNING_FAILED", "The planner could not generate a workflow plan.", 502
        ) from error
    steps = normalizePlannerSteps(plan)
    if os.getenv("WORKFLOW_DEMO_FAIL_FIRST_NOTIFICATION") == "true":
        for step in steps:
            if step["tool_name"] == "send_notification":
                step["arguments"]["fail_once"] = True
    gate.validatePlan(steps)
    workflow = gate.createWorkflow(userId, payload.goal)
    persistedSteps = gate.storePlan(userId, workflow["id"], steps)
    responseSteps = workflowSnapshot(gate, userId, workflow["id"])["steps"]
    return success(
        {
            "workflow": workflow,
            "steps": responseSteps,
            "reasoning": plan.get("reasoning", ""),
        },
        201,
    )


@app.get("/api/workflows/{workflowId}")
def getWorkflow(
    workflowId: UUID,
    userId: UUID = Depends(getCurrentUserId),
    gate: WorkflowControlGate = Depends(getControlGate),
) -> JSONResponse:
    return success(gate.getWorkflow(userId, workflowId))


@app.post("/api/workflows/{workflowId}/plans", status_code=201)
def storePlan(
    workflowId: UUID,
    payload: StorePlanRequest,
    userId: UUID = Depends(getCurrentUserId),
    gate: WorkflowControlGate = Depends(getControlGate),
) -> JSONResponse:
    steps = [step.model_dump() for step in payload.steps]
    return success(gate.storePlan(userId, workflowId, steps), 201)


@app.post("/api/workflows/{workflowId}/start-execution")
def startExecution(
    workflowId: UUID,
    userId: UUID = Depends(getCurrentUserId),
    gate: WorkflowControlGate = Depends(getControlGate),
) -> JSONResponse:
    gate.startWorkflow(userId, workflowId)
    return success(workflowSnapshot(gate, userId, workflowId))


@app.get("/api/workflows/{workflowId}/execution-status")
def getExecutionStatus(
    workflowId: UUID,
    userId: UUID = Depends(getCurrentUserId),
    gate: WorkflowControlGate = Depends(getControlGate),
) -> JSONResponse:
    return success(gate.getWorkflow(userId, workflowId))


@app.get("/api/workflows/{workflowId}/execution-timeline")
def getExecutionTimeline(
    workflowId: UUID,
    userId: UUID = Depends(getCurrentUserId),
    gate: WorkflowControlGate = Depends(getControlGate),
) -> JSONResponse:
    return success(gate.getTimeline(userId, workflowId))


@app.get("/api/pending-approvals")
def getPendingApprovals(
    userId: UUID = Depends(getCurrentUserId),
    gate: WorkflowControlGate = Depends(getControlGate),
) -> JSONResponse:
    return success(gate.listPendingApprovals(userId))


@app.post("/api/workflows/{workflowId}/steps/{stepId}/approve-action")
def approveAction(
    workflowId: UUID,
    stepId: UUID,
    userId: UUID = Depends(getCurrentUserId),
    gate: WorkflowControlGate = Depends(getControlGate),
) -> JSONResponse:
    gate.approveStep(userId, workflowId, stepId)
    return success(workflowSnapshot(gate, userId, workflowId))


@app.post("/api/workflows/{workflowId}/steps/{stepId}/reject-action")
def rejectAction(
    workflowId: UUID,
    stepId: UUID,
    userId: UUID = Depends(getCurrentUserId),
    gate: WorkflowControlGate = Depends(getControlGate),
) -> JSONResponse:
    gate.rejectStep(userId, workflowId, stepId)
    return success(workflowSnapshot(gate, userId, workflowId))


@app.post("/api/workflows/{workflowId}/steps/{stepId}/retry-step")
def retryStep(
    workflowId: UUID,
    stepId: UUID,
    userId: UUID = Depends(getCurrentUserId),
    gate: WorkflowControlGate = Depends(getControlGate),
) -> JSONResponse:
    gate.retryStep(userId, workflowId, stepId)
    return success(workflowSnapshot(gate, userId, workflowId))


@app.post("/api/workflows/{workflowId}/resume-workflow")
def resumeWorkflow(
    workflowId: UUID,
    userId: UUID = Depends(getCurrentUserId),
    gate: WorkflowControlGate = Depends(getControlGate),
) -> JSONResponse:
    return success(gate.resumeWorkflow(userId, workflowId))


@app.post("/api/workflows/{workflowId}/abort-workflow")
def abortWorkflow(
    workflowId: UUID,
    userId: UUID = Depends(getCurrentUserId),
    gate: WorkflowControlGate = Depends(getControlGate),
) -> JSONResponse:
    return success(gate.abortWorkflow(userId, workflowId))


@app.get("/api/tools")
def getTools(
    userId: UUID = Depends(getCurrentUserId),
    gate: WorkflowControlGate = Depends(getControlGate),
) -> JSONResponse:
    return success(gate.listTools())


@app.get("/api/workflows/{workflowId}/audit-logs")
def getAuditLogs(
    workflowId: UUID,
    userId: UUID = Depends(getCurrentUserId),
    gate: WorkflowControlGate = Depends(getControlGate),
) -> JSONResponse:
    return success(gate.getAuditLogs(userId, workflowId))
