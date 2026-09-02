"""Deterministic policy gate for AI-proposed workflow plans."""

from __future__ import annotations

from enum import Enum
from typing import Any, Callable, Dict, List, Optional
from uuid import UUID

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError, ValidationError

from database import DatabaseError


MAX_STEPS = 10
MAX_RETRIES = 3


class WorkflowStatus(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    WAITING_FOR_APPROVAL = "WAITING_FOR_APPROVAL"
    FAILED = "FAILED"
    RETRYING = "RETRYING"
    COMPLETED = "COMPLETED"
    ABORTED = "ABORTED"


ALLOWED_TRANSITIONS = {
    WorkflowStatus.PENDING: {WorkflowStatus.RUNNING, WorkflowStatus.ABORTED},
    WorkflowStatus.RUNNING: {
        WorkflowStatus.WAITING_FOR_APPROVAL,
        WorkflowStatus.FAILED,
        WorkflowStatus.COMPLETED,
        WorkflowStatus.ABORTED,
    },
    WorkflowStatus.WAITING_FOR_APPROVAL: {
        WorkflowStatus.RUNNING,
        WorkflowStatus.ABORTED,
    },
    WorkflowStatus.FAILED: {WorkflowStatus.RETRYING, WorkflowStatus.ABORTED},
    WorkflowStatus.RETRYING: {
        WorkflowStatus.RUNNING,
        WorkflowStatus.FAILED,
        WorkflowStatus.ABORTED,
    },
    WorkflowStatus.COMPLETED: set(),
    WorkflowStatus.ABORTED: set(),
}


class ControlGateError(RuntimeError):
    def __init__(self, code: str, message: str, statusCode: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.statusCode = statusCode


def _searchInformation(arguments: Dict[str, Any], step: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "query": arguments["query"],
        "result": "Project status information found.",
        "source": "demo_data",
    }


def _updateRecord(arguments: Dict[str, Any], step: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "record_id": arguments["record_id"],
        "status": arguments["status"],
        "updated": True,
    }


def _sendNotification(arguments: Dict[str, Any], step: Dict[str, Any]) -> Dict[str, Any]:
    if arguments.get("fail_once") and step["retry_count"] == 0:
        raise RuntimeError("Simulated notification network failure.")
    return {
        "recipient": arguments["recipient"],
        "delivery_status": "sent",
    }


DEFAULT_EXECUTORS: Dict[str, Callable[[Dict[str, Any], Dict[str, Any]], Dict[str, Any]]] = {
    "search_information": _searchInformation,
    "update_record": _updateRecord,
    "send_notification": _sendNotification,
}


class WorkflowControlGate:
    """The only component authorized to route a registered tool call."""

    def __init__(self, database: Any, executors: Optional[Dict[str, Callable]] = None) -> None:
        self.database = database
        self.executors = dict(executors or DEFAULT_EXECUTORS)

    def _actor(self, userId: Any) -> str:
        return "USER:%s" % userId

    def _requireWorkflow(self, userId: Any, workflowId: Any) -> Dict[str, Any]:
        workflow = self.database.getWorkflow(workflowId)
        if workflow is None:
            raise ControlGateError("WORKFLOW_NOT_FOUND", "Workflow not found.", 404)
        if workflow["user_id"] != str(userId):
            raise ControlGateError(
                "FORBIDDEN", "You do not have access to this workflow.", 403
            )
        return workflow

    def _requireStep(self, workflowId: Any, stepId: Any) -> Dict[str, Any]:
        step = self.database.getStep(stepId)
        if step is None or step["workflow_id"] != str(workflowId):
            raise ControlGateError("STEP_NOT_FOUND", "Workflow step not found.", 404)
        return step

    def _transitionWorkflow(
        self,
        workflow: Dict[str, Any],
        target: WorkflowStatus,
        actor: str,
        action: str,
        details: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        latest = self.database.getWorkflow(workflow["id"])
        if latest is None:
            raise ControlGateError("WORKFLOW_NOT_FOUND", "Workflow not found.", 404)
        current = WorkflowStatus(latest["status"])
        if target == current:
            return latest
        if target not in ALLOWED_TRANSITIONS[current]:
            raise ControlGateError(
                "INVALID_STATE_TRANSITION",
                "Workflow cannot transition from %s to %s." % (current.value, target.value),
                409,
            )
        updated = self.database.compareAndSetWorkflowStatus(
            workflow["id"], current.value, target.value
        )
        if updated is None:
            raise ControlGateError(
                "INVALID_STATE_TRANSITION",
                "Workflow state changed before this operation could complete.",
                409,
            )
        self.database.appendAuditLog(
            workflow["id"],
            None,
            actor,
            action,
            {"from": current.value, "to": target.value, **(details or {})},
        )
        return updated

    def _setStep(
        self,
        step: Dict[str, Any],
        changes: Dict[str, Any],
        actor: str,
        action: str,
        details: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        updated = self.database.updateStep(step["id"], changes)
        self.database.appendAuditLog(
            step["workflow_id"], step["id"], actor, action, details or changes
        )
        return updated

    def _validateArguments(self, tool: Dict[str, Any], arguments: Any) -> None:
        if not isinstance(arguments, dict):
            raise ControlGateError(
                "INVALID_TOOL_ARGUMENTS", "Tool arguments must be a JSON object."
            )
        try:
            Draft202012Validator.check_schema(tool["input_schema"])
            Draft202012Validator(tool["input_schema"]).validate(arguments)
        except (SchemaError, ValidationError) as error:
            raise ControlGateError(
                "INVALID_TOOL_ARGUMENTS", "AI generated bad data."
            ) from error

    def createWorkflow(self, userId: UUID, goal: str) -> Dict[str, Any]:
        if not isinstance(goal, str) or not goal.strip():
            raise ControlGateError("INVALID_REQUEST", "Goal must not be empty.")
        try:
            workflow = self.database.createWorkflow(
                userId, goal.strip(), WorkflowStatus.PENDING.value
            )
            self.database.appendAuditLog(
                workflow["id"],
                None,
                self._actor(userId),
                "WORKFLOW_CREATED",
                {"status": WorkflowStatus.PENDING.value},
            )
            return workflow
        except DatabaseError as error:
            raise ControlGateError("DATABASE_ERROR", "Workflow could not be created.", 503) from error

    def authenticateToken(self, token: str) -> UUID:
        userId = self.database.authenticateToken(token)
        if userId is None:
            raise ControlGateError(
                "UNAUTHORIZED", "A valid authenticated user is required.", 401
            )
        return UUID(userId)

    def getWorkflow(self, userId: UUID, workflowId: Any) -> Dict[str, Any]:
        workflow = self._requireWorkflow(userId, workflowId)
        return {**workflow, "steps": self.database.listSteps(workflowId)}

    def storePlan(
        self, userId: UUID, workflowId: Any, proposedSteps: Any
    ) -> List[Dict[str, Any]]:
        workflow = self._requireWorkflow(userId, workflowId)
        if workflow["status"] != WorkflowStatus.PENDING.value:
            raise ControlGateError(
                "INVALID_STATE_TRANSITION", "A plan can only be stored while pending.", 409
            )
        if self.database.listSteps(workflowId):
            raise ControlGateError("PLAN_ALREADY_EXISTS", "This workflow already has a plan.", 409)
        validated = self.validatePlan(proposedSteps)

        steps = [
            self.database.createStep(
                workflowId,
                tool["id"],
                index,
                arguments,
                WorkflowStatus.PENDING.value,
            )
            for index, (tool, arguments) in enumerate(validated, start=1)
        ]
        self.database.appendAuditLog(
            workflowId,
            None,
            "AI",
            "PLAN_CREATED",
            {"step_count": len(steps)},
        )
        return steps

    def validatePlan(self, proposedSteps: Any) -> List[Any]:
        """Validate an untrusted AI plan without persisting workflow state."""
        if not isinstance(proposedSteps, list) or not proposedSteps:
            raise ControlGateError("MALFORMED_PLAN", "Plan must contain a list of steps.")
        if len(proposedSteps) > MAX_STEPS:
            raise ControlGateError(
                "STEP_LIMIT_EXCEEDED", "A workflow cannot contain more than 10 steps."
            )

        validated = []
        for proposed in proposedSteps:
            if not isinstance(proposed, dict) or set(proposed) != {"tool_name", "arguments"}:
                raise ControlGateError("MALFORMED_PLAN", "Each plan step is malformed.")
            tool = self.database.getToolByName(proposed["tool_name"])
            if tool is None or tool["name"] not in self.executors:
                raise ControlGateError(
                    "UNKNOWN_TOOL", "The requested tool is not registered."
                )
            self._validateArguments(tool, proposed["arguments"])
            validated.append((tool, proposed["arguments"]))
        return validated

    def _executeStep(
        self, workflow: Dict[str, Any], step: Dict[str, Any], actor: str
    ) -> Dict[str, Any]:
        if step["status"] == WorkflowStatus.COMPLETED.value:
            return step
        if step["retry_count"] >= MAX_RETRIES:
            raise ControlGateError(
                "RETRY_LIMIT_REACHED", "The maximum of 3 retries has been reached.", 409
            )
        tool = self.database.getTool(step["tool_id"])
        try:
            if tool is None or tool["name"] not in self.executors:
                raise ControlGateError(
                    "UNKNOWN_TOOL", "The requested tool is not registered."
                )
            self._validateArguments(tool, step["arguments"])
        except ControlGateError as error:
            message = "Tool failed deterministic validation before execution."
            failedStep = self._setStep(
                step,
                {"status": WorkflowStatus.FAILED.value, "output": {"error": message}},
                "SYSTEM",
                "TOOL_VALIDATION_FAILED",
                {"code": error.code, "message": error.message},
            )
            currentWorkflow = self.database.getWorkflow(workflow["id"])
            self._transitionWorkflow(
                currentWorkflow,
                WorkflowStatus.FAILED,
                "SYSTEM",
                "WORKFLOW_FAILED",
                {"step_id": step["id"], "reason": error.code},
            )
            return failedStep

        if tool["requires_approval"] and not self.database.hasAuditAction(
            workflow["id"], step["id"], "APPROVAL_GRANTED"
        ):
            waitingStep = self._setStep(
                step,
                {"status": WorkflowStatus.WAITING_FOR_APPROVAL.value},
                "SYSTEM",
                "APPROVAL_REQUESTED",
                {"tool_name": tool["name"], "arguments": step["arguments"]},
            )
            self._transitionWorkflow(
                workflow,
                WorkflowStatus.WAITING_FOR_APPROVAL,
                "SYSTEM",
                "WORKFLOW_WAITING_FOR_APPROVAL",
                {"step_id": step["id"]},
            )
            return waitingStep

        runningStep = self._setStep(
            step,
            {"status": WorkflowStatus.RUNNING.value},
            "SYSTEM",
            "TOOL_EXECUTION_STARTED",
            {"tool_name": tool["name"]},
        )
        try:
            output = self.executors[tool["name"]](runningStep["arguments"], runningStep)
        except Exception as error:
            failedStep = self._setStep(
                runningStep,
                {
                    "status": WorkflowStatus.FAILED.value,
                    "output": {"error": str(error)},
                },
                "SYSTEM",
                "TOOL_EXECUTION_FAILED",
                {"tool_name": tool["name"], "error": str(error)},
            )
            currentWorkflow = self.database.getWorkflow(workflow["id"])
            self._transitionWorkflow(
                currentWorkflow,
                WorkflowStatus.FAILED,
                "SYSTEM",
                "WORKFLOW_FAILED",
                {"step_id": step["id"]},
            )
            return failedStep

        return self._setStep(
            runningStep,
            {"status": WorkflowStatus.COMPLETED.value, "output": output},
            "SYSTEM",
            "TOOL_EXECUTION_SUCCEEDED",
            {"tool_name": tool["name"], "output": output},
        )

    def _continueWorkflow(self, workflowId: Any, actor: str) -> Dict[str, Any]:
        workflow = self.database.getWorkflow(workflowId)
        for step in self.database.listSteps(workflowId):
            if step["status"] == WorkflowStatus.COMPLETED.value:
                continue
            result = self._executeStep(workflow, step, actor)
            workflow = self.database.getWorkflow(workflowId)
            if result["status"] in {
                WorkflowStatus.WAITING_FOR_APPROVAL.value,
                WorkflowStatus.FAILED.value,
            }:
                return workflow

        workflow = self.database.getWorkflow(workflowId)
        return self._transitionWorkflow(
            workflow,
            WorkflowStatus.COMPLETED,
            "SYSTEM",
            "WORKFLOW_COMPLETED",
        )

    def startWorkflow(self, userId: UUID, workflowId: Any) -> Dict[str, Any]:
        workflow = self._requireWorkflow(userId, workflowId)
        if not self.database.listSteps(workflowId):
            raise ControlGateError("PLAN_REQUIRED", "A validated plan is required.", 409)
        workflow = self._transitionWorkflow(
            workflow,
            WorkflowStatus.RUNNING,
            self._actor(userId),
            "WORKFLOW_STARTED",
        )
        return self._continueWorkflow(workflow["id"], self._actor(userId))

    def approveStep(self, userId: UUID, workflowId: Any, stepId: Any) -> Dict[str, Any]:
        workflow = self._requireWorkflow(userId, workflowId)
        step = self._requireStep(workflowId, stepId)
        if workflow["status"] != WorkflowStatus.WAITING_FOR_APPROVAL.value or step["status"] != WorkflowStatus.WAITING_FOR_APPROVAL.value:
            raise ControlGateError("APPROVAL_NOT_PENDING", "This step is not awaiting approval.", 409)
        actor = self._actor(userId)
        claimedStep = self.database.claimApproval(stepId)
        if claimedStep is None:
            raise ControlGateError(
                "APPROVAL_NOT_PENDING", "This step is not awaiting approval.", 409
            )
        try:
            self.database.appendAuditLog(
                workflowId,
                stepId,
                actor,
                "APPROVAL_GRANTED",
                {"approved_by": str(userId)},
            )
        except DatabaseError:
            self.database.updateStep(
                stepId, {"status": WorkflowStatus.WAITING_FOR_APPROVAL.value}
            )
            raise
        workflow = self._transitionWorkflow(
            workflow, WorkflowStatus.RUNNING, actor, "WORKFLOW_RESUMED"
        )
        return self._continueWorkflow(workflow["id"], actor)

    def rejectStep(self, userId: UUID, workflowId: Any, stepId: Any) -> Dict[str, Any]:
        workflow = self._requireWorkflow(userId, workflowId)
        step = self._requireStep(workflowId, stepId)
        if workflow["status"] != WorkflowStatus.WAITING_FOR_APPROVAL.value or step["status"] != WorkflowStatus.WAITING_FOR_APPROVAL.value:
            raise ControlGateError("APPROVAL_NOT_PENDING", "This step is not awaiting approval.", 409)
        actor = self._actor(userId)
        self.database.appendAuditLog(
            workflowId, stepId, actor, "APPROVAL_REJECTED", {"rejected_by": str(userId)}
        )
        self._abortIncompleteSteps(workflowId, actor, "Approval was rejected.")
        return self._transitionWorkflow(
            workflow, WorkflowStatus.ABORTED, actor, "WORKFLOW_ABORTED"
        )

    def retryStep(self, userId: UUID, workflowId: Any, stepId: Any) -> Dict[str, Any]:
        workflow = self._requireWorkflow(userId, workflowId)
        step = self._requireStep(workflowId, stepId)
        if workflow["status"] != WorkflowStatus.FAILED.value or step["status"] != WorkflowStatus.FAILED.value:
            raise ControlGateError("STEP_NOT_RETRYABLE", "Only the failed step can be retried.", 409)
        if step["retry_count"] >= MAX_RETRIES:
            raise ControlGateError("RETRY_LIMIT_REACHED", "The maximum of 3 retries has been reached.", 409)
        actor = self._actor(userId)
        workflow = self._transitionWorkflow(
            workflow, WorkflowStatus.RETRYING, actor, "RETRY_STARTED", {"step_id": step["id"]}
        )
        step = self.database.updateStep(
            step["id"],
            {"status": WorkflowStatus.RETRYING.value, "retry_count": step["retry_count"] + 1},
        )
        workflow = self._transitionWorkflow(
            workflow, WorkflowStatus.RUNNING, actor, "WORKFLOW_RESUMED"
        )
        self.database.updateStep(step["id"], {"status": WorkflowStatus.PENDING.value})
        return self._continueWorkflow(workflow["id"], actor)

    def resumeWorkflow(self, userId: UUID, workflowId: Any) -> Dict[str, Any]:
        workflow = self._requireWorkflow(userId, workflowId)
        failed = next(
            (step for step in self.database.listSteps(workflowId) if step["status"] == WorkflowStatus.FAILED.value),
            None,
        )
        if workflow["status"] == WorkflowStatus.FAILED.value and failed is not None:
            return self.retryStep(userId, workflowId, failed["id"])
        raise ControlGateError("WORKFLOW_NOT_RESUMABLE", "Workflow is not resumable.", 409)

    def abortWorkflow(self, userId: UUID, workflowId: Any) -> Dict[str, Any]:
        workflow = self._requireWorkflow(userId, workflowId)
        actor = self._actor(userId)
        self._abortIncompleteSteps(workflowId, actor, "Workflow was aborted by its owner.")
        return self._transitionWorkflow(
            workflow, WorkflowStatus.ABORTED, actor, "WORKFLOW_ABORTED"
        )

    def _abortIncompleteSteps(self, workflowId: Any, actor: str, reason: str) -> None:
        for step in self.database.listSteps(workflowId):
            if step["status"] not in {WorkflowStatus.COMPLETED.value, WorkflowStatus.ABORTED.value}:
                self._setStep(
                    step,
                    {"status": WorkflowStatus.ABORTED.value},
                    actor,
                    "STEP_ABORTED",
                    {"reason": reason},
                )

    def listPendingApprovals(self, userId: UUID) -> List[Dict[str, Any]]:
        return self.database.listPendingApprovals(userId)

    def listTools(self) -> List[Dict[str, Any]]:
        return self.database.listTools()

    def getTimeline(self, userId: UUID, workflowId: Any) -> List[Dict[str, Any]]:
        self._requireWorkflow(userId, workflowId)
        return self.database.listAuditLogs(workflowId)

    def getAuditLogs(self, userId: UUID, workflowId: Any) -> List[Dict[str, Any]]:
        return self.getTimeline(userId, workflowId)
