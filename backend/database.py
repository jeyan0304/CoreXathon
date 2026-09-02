"""Persistence adapters for the workflow control layer.

The Supabase service-role key is used only by this server-side module.  The
in-memory adapter mirrors the same interface and exists for deterministic
tests and local demos; it is never selected when Supabase credentials exist.
"""

from __future__ import annotations

import copy
import os
from datetime import datetime, timezone
from threading import RLock
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4


class DatabaseError(RuntimeError):
    """A sanitized persistence failure safe for the control layer."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uuid(value: Any) -> str:
    return str(value)


class InMemoryDatabase:
    """Thread-safe adapter used by tests and explicit local demo mode."""

    def __init__(self) -> None:
        self._lock = RLock()
        self.users: Dict[str, Dict[str, Any]] = {}
        self.tools: Dict[str, Dict[str, Any]] = {}
        self.workflows: Dict[str, Dict[str, Any]] = {}
        self.steps: Dict[str, Dict[str, Any]] = {}
        self.auditLogs: Dict[str, Dict[str, Any]] = {}

    def _copy(self, value: Any) -> Any:
        return copy.deepcopy(value)

    def createUser(self, userId: UUID, email: str) -> Dict[str, Any]:
        row = {"id": _uuid(userId), "email": email, "created_at": _now()}
        with self._lock:
            self.users[row["id"]] = row
        return self._copy(row)

    def authenticateToken(self, token: str) -> Optional[str]:
        """Local demo tokens are UUIDs that must map to a persisted user."""
        with self._lock:
            return token if token in self.users else None

    def createTool(
        self,
        name: str,
        description: str,
        inputSchema: Dict[str, Any],
        requiresApproval: bool = False,
        toolId: Optional[UUID] = None,
    ) -> Dict[str, Any]:
        with self._lock:
            if any(tool["name"] == name for tool in self.tools.values()):
                raise DatabaseError("A tool with that name already exists.")
            row = {
                "id": _uuid(toolId or uuid4()),
                "name": name,
                "description": description,
                "input_schema": self._copy(inputSchema),
                "requires_approval": requiresApproval,
                "created_at": _now(),
            }
            self.tools[row["id"]] = row
        return self._copy(row)

    def seedDemoTools(self) -> None:
        definitions = [
            (
                "search_information",
                "Search approved information sources.",
                {
                    "type": "object",
                    "properties": {"query": {"type": "string", "minLength": 1}},
                    "required": ["query"],
                    "additionalProperties": False,
                },
                False,
            ),
            (
                "update_record",
                "Update an approved project record.",
                {
                    "type": "object",
                    "properties": {
                        "record_id": {"type": "string", "minLength": 1},
                        "status": {"type": "string", "minLength": 1},
                    },
                    "required": ["record_id", "status"],
                    "additionalProperties": False,
                },
                True,
            ),
            (
                "send_notification",
                "Send a notification to an approved recipient.",
                {
                    "type": "object",
                    "properties": {
                        "recipient": {"type": "string", "minLength": 3},
                        "message": {"type": "string", "minLength": 1},
                        "fail_once": {"type": "boolean"},
                    },
                    "required": ["recipient", "message"],
                    "additionalProperties": False,
                },
                False,
            ),
        ]
        for definition in definitions:
            if self.getToolByName(definition[0]) is None:
                self.createTool(*definition)

    def listTools(self) -> List[Dict[str, Any]]:
        with self._lock:
            rows = sorted(self.tools.values(), key=lambda row: row["name"])
        return self._copy(rows)

    def getTool(self, toolId: Any) -> Optional[Dict[str, Any]]:
        with self._lock:
            row = self.tools.get(_uuid(toolId))
        return self._copy(row)

    def getToolByName(self, name: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            row = next((tool for tool in self.tools.values() if tool["name"] == name), None)
        return self._copy(row)

    def createWorkflow(self, userId: Any, goal: str, status: str) -> Dict[str, Any]:
        row = {
            "id": _uuid(uuid4()),
            "user_id": _uuid(userId),
            "goal": goal,
            "status": status,
            "created_at": _now(),
        }
        with self._lock:
            self.workflows[row["id"]] = row
        return self._copy(row)

    def getWorkflow(self, workflowId: Any) -> Optional[Dict[str, Any]]:
        with self._lock:
            row = self.workflows.get(_uuid(workflowId))
        return self._copy(row)

    def updateWorkflow(self, workflowId: Any, changes: Dict[str, Any]) -> Dict[str, Any]:
        allowed = {"status"}
        if not changes or not set(changes).issubset(allowed):
            raise DatabaseError("Invalid workflow update.")
        with self._lock:
            row = self.workflows.get(_uuid(workflowId))
            if row is None:
                raise DatabaseError("Workflow not found.")
            row.update(self._copy(changes))
        return self._copy(row)

    def compareAndSetWorkflowStatus(
        self, workflowId: Any, expectedStatus: str, targetStatus: str
    ) -> Optional[Dict[str, Any]]:
        with self._lock:
            row = self.workflows.get(_uuid(workflowId))
            if row is None or row["status"] != expectedStatus:
                return None
            row["status"] = targetStatus
            return self._copy(row)

    def createStep(
        self,
        workflowId: Any,
        toolId: Any,
        stepOrder: int,
        arguments: Dict[str, Any],
        status: str,
    ) -> Dict[str, Any]:
        row = {
            "id": _uuid(uuid4()),
            "workflow_id": _uuid(workflowId),
            "tool_id": _uuid(toolId),
            "step_order": stepOrder,
            "arguments": self._copy(arguments),
            "output": None,
            "status": status,
            "retry_count": 0,
            "created_at": _now(),
        }
        with self._lock:
            self.steps[row["id"]] = row
        return self._copy(row)

    def getStep(self, stepId: Any) -> Optional[Dict[str, Any]]:
        with self._lock:
            row = self.steps.get(_uuid(stepId))
        return self._copy(row)

    def listSteps(self, workflowId: Any) -> List[Dict[str, Any]]:
        workflowId = _uuid(workflowId)
        with self._lock:
            rows = sorted(
                (row for row in self.steps.values() if row["workflow_id"] == workflowId),
                key=lambda row: row["step_order"],
            )
        return self._copy(rows)

    def updateStep(self, stepId: Any, changes: Dict[str, Any]) -> Dict[str, Any]:
        allowed = {"status", "output", "retry_count"}
        if not changes or not set(changes).issubset(allowed):
            raise DatabaseError("Invalid workflow step update.")
        with self._lock:
            row = self.steps.get(_uuid(stepId))
            if row is None:
                raise DatabaseError("Workflow step not found.")
            row.update(self._copy(changes))
        return self._copy(row)

    def claimApproval(self, stepId: Any) -> Optional[Dict[str, Any]]:
        """Atomically claim one waiting step so approval cannot execute twice."""
        with self._lock:
            row = self.steps.get(_uuid(stepId))
            if row is None or row["status"] != "WAITING_FOR_APPROVAL":
                return None
            row["status"] = "PENDING"
            return self._copy(row)

    def appendAuditLog(
        self,
        workflowId: Any,
        stepId: Optional[Any],
        actor: str,
        action: str,
        details: Dict[str, Any],
    ) -> Dict[str, Any]:
        row = {
            "id": _uuid(uuid4()),
            "workflow_id": _uuid(workflowId),
            "step_id": _uuid(stepId) if stepId is not None else None,
            "actor": actor,
            "action": action,
            "details": self._copy(details),
            "created_at": _now(),
        }
        with self._lock:
            self.auditLogs[row["id"]] = row
        return self._copy(row)

    def listAuditLogs(self, workflowId: Any) -> List[Dict[str, Any]]:
        workflowId = _uuid(workflowId)
        with self._lock:
            rows = sorted(
                (row for row in self.auditLogs.values() if row["workflow_id"] == workflowId),
                key=lambda row: (row["created_at"], row["id"]),
            )
        return self._copy(rows)

    def hasAuditAction(self, workflowId: Any, stepId: Any, action: str) -> bool:
        workflowId, stepId = _uuid(workflowId), _uuid(stepId)
        with self._lock:
            return any(
                row["workflow_id"] == workflowId
                and row["step_id"] == stepId
                and row["action"] == action
                for row in self.auditLogs.values()
            )

    def listWorkflows(self, userId: Any) -> List[Dict[str, Any]]:
        userId = _uuid(userId)
        with self._lock:
            rows = sorted(
                (row for row in self.workflows.values() if row["user_id"] == userId),
                key=lambda row: row["created_at"],
                reverse=True,
            )
        return self._copy(rows)

    def listAllAuditLogs(self, userId: Any) -> List[Dict[str, Any]]:
        userId = _uuid(userId)
        with self._lock:
            owned = {
                workflow["id"]
                for workflow in self.workflows.values()
                if workflow["user_id"] == userId
            }
            rows = sorted(
                (row for row in self.auditLogs.values() if row["workflow_id"] in owned),
                key=lambda row: row["created_at"],
                reverse=True,
            )
        return self._copy(rows)

    def listPendingApprovals(self, userId: Any) -> List[Dict[str, Any]]:
        userId = _uuid(userId)
        with self._lock:
            owned = {
                workflow["id"]
                for workflow in self.workflows.values()
                if workflow["user_id"] == userId
            }
            rows = [
                step
                for step in self.steps.values()
                if step["workflow_id"] in owned
                and step["status"] == "WAITING_FOR_APPROVAL"
            ]
        return self._copy(sorted(rows, key=lambda row: row["created_at"]))


class SupabaseDatabase:
    """Five-table persistence adapter backed by Supabase/PostgreSQL."""

    def __init__(self, client: Any) -> None:
        self.client = client

    def _execute(self, query: Any) -> List[Dict[str, Any]]:
        try:
            response = query.execute()
            return response.data or []
        except Exception as error:
            raise DatabaseError("The database operation failed.") from error

    def _one(self, rows: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        return rows[0] if rows else None

    def createUser(self, userId: UUID, email: str) -> Dict[str, Any]:
        row = {"id": _uuid(userId), "email": email}
        result = self._one(self._execute(self.client.table("users").insert(row)))
        if result is None:
            raise DatabaseError("The user could not be created.")
        return result

    def authenticateToken(self, token: str) -> Optional[str]:
        try:
            response = self.client.auth.get_user(token)
            user = getattr(response, "user", None)
            return str(user.id) if user is not None else None
        except Exception:
            return None

    def createTool(self, name: str, description: str, inputSchema: Dict[str, Any], requiresApproval: bool = False, toolId: Optional[UUID] = None) -> Dict[str, Any]:
        row = {"id": _uuid(toolId or uuid4()), "name": name, "description": description, "input_schema": inputSchema, "requires_approval": requiresApproval}
        result = self._one(self._execute(self.client.table("tools").insert(row)))
        if result is None:
            raise DatabaseError("The tool could not be created.")
        return result

    def seedDemoTools(self) -> None:
        helper = InMemoryDatabase()
        helper.seedDemoTools()
        for tool in helper.listTools():
            if self.getToolByName(tool["name"]) is None:
                self.createTool(tool["name"], tool["description"], tool["input_schema"], tool["requires_approval"])

    def listTools(self) -> List[Dict[str, Any]]:
        return self._execute(self.client.table("tools").select("*").order("name"))

    def getTool(self, toolId: Any) -> Optional[Dict[str, Any]]:
        return self._one(self._execute(self.client.table("tools").select("*").eq("id", _uuid(toolId)).limit(1)))

    def getToolByName(self, name: str) -> Optional[Dict[str, Any]]:
        return self._one(self._execute(self.client.table("tools").select("*").eq("name", name).limit(1)))

    def createWorkflow(self, userId: Any, goal: str, status: str) -> Dict[str, Any]:
        row = {"id": _uuid(uuid4()), "user_id": _uuid(userId), "goal": goal, "status": status}
        result = self._one(self._execute(self.client.table("workflows").insert(row)))
        if result is None:
            raise DatabaseError("The workflow could not be created.")
        return result

    def getWorkflow(self, workflowId: Any) -> Optional[Dict[str, Any]]:
        return self._one(self._execute(self.client.table("workflows").select("*").eq("id", _uuid(workflowId)).limit(1)))

    def updateWorkflow(self, workflowId: Any, changes: Dict[str, Any]) -> Dict[str, Any]:
        result = self._one(self._execute(self.client.table("workflows").update(changes).eq("id", _uuid(workflowId))))
        if result is None:
            raise DatabaseError("Workflow not found.")
        return result

    def compareAndSetWorkflowStatus(self, workflowId: Any, expectedStatus: str, targetStatus: str) -> Optional[Dict[str, Any]]:
        rows = self._execute(
            self.client.table("workflows")
            .update({"status": targetStatus})
            .eq("id", _uuid(workflowId))
            .eq("status", expectedStatus)
        )
        return self._one(rows)

    def createStep(self, workflowId: Any, toolId: Any, stepOrder: int, arguments: Dict[str, Any], status: str) -> Dict[str, Any]:
        row = {"id": _uuid(uuid4()), "workflow_id": _uuid(workflowId), "tool_id": _uuid(toolId), "step_order": stepOrder, "arguments": arguments, "output": None, "status": status, "retry_count": 0}
        result = self._one(self._execute(self.client.table("workflow_steps").insert(row)))
        if result is None:
            raise DatabaseError("The workflow step could not be created.")
        return result

    def getStep(self, stepId: Any) -> Optional[Dict[str, Any]]:
        return self._one(self._execute(self.client.table("workflow_steps").select("*").eq("id", _uuid(stepId)).limit(1)))

    def listSteps(self, workflowId: Any) -> List[Dict[str, Any]]:
        return self._execute(self.client.table("workflow_steps").select("*").eq("workflow_id", _uuid(workflowId)).order("step_order"))

    def updateStep(self, stepId: Any, changes: Dict[str, Any]) -> Dict[str, Any]:
        result = self._one(self._execute(self.client.table("workflow_steps").update(changes).eq("id", _uuid(stepId))))
        if result is None:
            raise DatabaseError("Workflow step not found.")
        return result

    def claimApproval(self, stepId: Any) -> Optional[Dict[str, Any]]:
        rows = self._execute(
            self.client.table("workflow_steps")
            .update({"status": "PENDING"})
            .eq("id", _uuid(stepId))
            .eq("status", "WAITING_FOR_APPROVAL")
        )
        return self._one(rows)

    def appendAuditLog(self, workflowId: Any, stepId: Optional[Any], actor: str, action: str, details: Dict[str, Any]) -> Dict[str, Any]:
        row = {"id": _uuid(uuid4()), "workflow_id": _uuid(workflowId), "step_id": _uuid(stepId) if stepId is not None else None, "actor": actor, "action": action, "details": details}
        result = self._one(self._execute(self.client.table("audit_logs").insert(row)))
        if result is None:
            raise DatabaseError("The audit event could not be recorded.")
        return result

    def listAuditLogs(self, workflowId: Any) -> List[Dict[str, Any]]:
        return self._execute(self.client.table("audit_logs").select("*").eq("workflow_id", _uuid(workflowId)).order("created_at"))

    def hasAuditAction(self, workflowId: Any, stepId: Any, action: str) -> bool:
        rows = self._execute(self.client.table("audit_logs").select("id").eq("workflow_id", _uuid(workflowId)).eq("step_id", _uuid(stepId)).eq("action", action).limit(1))
        return bool(rows)

    def listWorkflows(self, userId: Any) -> List[Dict[str, Any]]:
        return self._execute(
            self.client.table("workflows")
            .select("*")
            .eq("user_id", _uuid(userId))
            .order("created_at", desc=True)
        )

    def listAllAuditLogs(self, userId: Any) -> List[Dict[str, Any]]:
        workflows = self._execute(self.client.table("workflows").select("id").eq("user_id", _uuid(userId)))
        workflowIds = [row["id"] for row in workflows]
        if not workflowIds:
            return []
        return self._execute(
            self.client.table("audit_logs")
            .select("*")
            .in_("workflow_id", workflowIds)
            .order("created_at", desc=True)
        )

    def listPendingApprovals(self, userId: Any) -> List[Dict[str, Any]]:
        workflows = self._execute(self.client.table("workflows").select("id").eq("user_id", _uuid(userId)))
        workflowIds = [row["id"] for row in workflows]
        if not workflowIds:
            return []
        return self._execute(self.client.table("workflow_steps").select("*").in_("workflow_id", workflowIds).eq("status", "WAITING_FOR_APPROVAL").order("created_at"))


_database: Optional[Any] = None


def getDatabase() -> Any:
    """Return the configured server database without exposing its credentials."""
    global _database
    if _database is not None:
        return _database

    url = os.getenv("SUPABASE_URL")
    serviceRoleKey = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if url and serviceRoleKey:
        try:
            from supabase import create_client
        except ImportError as error:
            raise DatabaseError("The Supabase dependency is not installed.") from error
        _database = SupabaseDatabase(create_client(url, serviceRoleKey))
        return _database

    if os.getenv("ALLOW_IN_MEMORY_DATABASE") == "true":
        _database = InMemoryDatabase()
        _database.seedDemoTools()
        return _database

    raise DatabaseError("Supabase server credentials are not configured.")
