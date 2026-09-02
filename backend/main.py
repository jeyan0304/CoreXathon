"""FastAPI boundary for the deterministic workflow engine."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from control_gate import ControlGateError, WorkflowControlGate
from database import DatabaseError, getDatabase


logger = logging.getLogger("workflow_backend")
app = FastAPI(title="AI Workflow Automation Platform", version="1.0.0")
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
    logger.error("Database operation failed", extra={"path": request.url.path})
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
) -> JSONResponse:
    return success(gate.createWorkflow(userId, payload.goal), 201)


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
    return success(gate.startWorkflow(userId, workflowId))


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
    return success(gate.approveStep(userId, workflowId, stepId))


@app.post("/api/workflows/{workflowId}/steps/{stepId}/reject-action")
def rejectAction(
    workflowId: UUID,
    stepId: UUID,
    userId: UUID = Depends(getCurrentUserId),
    gate: WorkflowControlGate = Depends(getControlGate),
) -> JSONResponse:
    return success(gate.rejectStep(userId, workflowId, stepId))


@app.post("/api/workflows/{workflowId}/steps/{stepId}/retry-step")
def retryStep(
    workflowId: UUID,
    stepId: UUID,
    userId: UUID = Depends(getCurrentUserId),
    gate: WorkflowControlGate = Depends(getControlGate),
) -> JSONResponse:
    return success(gate.retryStep(userId, workflowId, stepId))


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


@app.get("/api/workflows")
def listWorkflows(
    userId: UUID = Depends(getCurrentUserId),
    gate: WorkflowControlGate = Depends(getControlGate),
) -> JSONResponse:
    return success(gate.listWorkflows(userId))


@app.get("/api/audit-logs")
def listAllAuditLogs(
    userId: UUID = Depends(getCurrentUserId),
    gate: WorkflowControlGate = Depends(getControlGate),
) -> JSONResponse:
    return success(gate.listAllAuditLogs(userId))
