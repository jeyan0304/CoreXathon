from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from control_gate import ControlGateError, WorkflowControlGate
from database import InMemoryDatabase
from main import app, getControlGate


USER_ID = uuid4()
OTHER_USER_ID = uuid4()


@pytest.fixture
def database() -> InMemoryDatabase:
    database = InMemoryDatabase()
    database.createUser(USER_ID, "owner@example.com")
    database.createUser(OTHER_USER_ID, "other@example.com")
    database.seedDemoTools()
    return database


@pytest.fixture
def gate(database: InMemoryDatabase) -> WorkflowControlGate:
    return WorkflowControlGate(database)


@pytest.fixture
def client(gate: WorkflowControlGate):
    app.dependency_overrides[getControlGate] = lambda: gate
    with TestClient(app, raise_server_exceptions=False) as testClient:
        yield testClient
    app.dependency_overrides.clear()


def demoPlan(*, failNotificationOnce: bool = True) -> list[dict]:
    return [
        {
            "tool_name": "search_information",
            "arguments": {"query": "CoreXathon project status"},
        },
        {
            "tool_name": "update_record",
            "arguments": {
                "record_id": "project-corexathon",
                "status": "completed",
            },
        },
        {
            "tool_name": "send_notification",
            "arguments": {
                "recipient": "team@example.com",
                "message": "Project status updated",
                "fail_once": failNotificationOnce,
            },
        },
    ]


def testUnknownToolIsRejectedBeforePlanPersistence(gate: WorkflowControlGate):
    workflow = gate.createWorkflow(USER_ID, "unsafe plan")

    with pytest.raises(ControlGateError) as error:
        gate.storePlan(
            USER_ID,
            workflow["id"],
            [{"tool_name": "delete_everything", "arguments": {}}],
        )

    assert error.value.code == "UNKNOWN_TOOL"
    assert gate.database.listSteps(workflow["id"]) == []


def testInvalidArgumentsAreRejected(gate: WorkflowControlGate):
    workflow = gate.createWorkflow(USER_ID, "search")

    with pytest.raises(ControlGateError) as error:
        gate.storePlan(
            USER_ID,
            workflow["id"],
            [{"tool_name": "search_information", "arguments": {}}],
        )

    assert error.value.code == "INVALID_TOOL_ARGUMENTS"


def testPlanCannotExceedTenSteps(gate: WorkflowControlGate):
    workflow = gate.createWorkflow(USER_ID, "loop forever")
    plan = [
        {"tool_name": "search_information", "arguments": {"query": str(index)}}
        for index in range(11)
    ]

    with pytest.raises(ControlGateError) as error:
        gate.storePlan(USER_ID, workflow["id"], plan)

    assert error.value.code == "STEP_LIMIT_EXCEEDED"


def testSensitiveToolCannotRunUntilExplicitApproval(gate: WorkflowControlGate):
    workflow = gate.createWorkflow(USER_ID, "update project")
    gate.storePlan(
        USER_ID,
        workflow["id"],
        [demoPlan(failNotificationOnce=False)[1]],
    )

    result = gate.startWorkflow(USER_ID, workflow["id"])

    assert result["status"] == "WAITING_FOR_APPROVAL"
    step = gate.database.listSteps(workflow["id"])[0]
    assert step["status"] == "WAITING_FOR_APPROVAL"
    assert step["output"] is None

    gate.approveStep(USER_ID, workflow["id"], step["id"])

    completed = gate.database.getWorkflow(workflow["id"])
    assert completed["status"] == "COMPLETED"
    assert gate.database.getStep(step["id"])["status"] == "COMPLETED"


def testOnlyWorkflowOwnerCanApprove(gate: WorkflowControlGate):
    workflow = gate.createWorkflow(USER_ID, "update project")
    gate.storePlan(USER_ID, workflow["id"], [demoPlan()[1]])
    gate.startWorkflow(USER_ID, workflow["id"])
    step = gate.database.listSteps(workflow["id"])[0]

    with pytest.raises(ControlGateError) as error:
        gate.approveStep(OTHER_USER_ID, workflow["id"], step["id"])

    assert error.value.code == "FORBIDDEN"
    assert gate.database.getStep(step["id"])["status"] == "WAITING_FOR_APPROVAL"


def testApprovalClaimCannotBeUsedTwice(gate: WorkflowControlGate):
    workflow = gate.createWorkflow(USER_ID, "update project")
    gate.storePlan(USER_ID, workflow["id"], [demoPlan()[1]])
    gate.startWorkflow(USER_ID, workflow["id"])
    step = gate.database.listSteps(workflow["id"])[0]

    gate.approveStep(USER_ID, workflow["id"], step["id"])

    with pytest.raises(ControlGateError) as error:
        gate.approveStep(USER_ID, workflow["id"], step["id"])
    assert error.value.code == "APPROVAL_NOT_PENDING"
    assert gate.database.hasAuditAction(
        workflow["id"], step["id"], "APPROVAL_GRANTED"
    )


def testAbortedWorkflowCannotBeReopenedByApproval(gate: WorkflowControlGate):
    workflow = gate.createWorkflow(USER_ID, "update project")
    gate.storePlan(USER_ID, workflow["id"], [demoPlan()[1]])
    gate.startWorkflow(USER_ID, workflow["id"])
    step = gate.database.listSteps(workflow["id"])[0]
    gate.abortWorkflow(USER_ID, workflow["id"])

    with pytest.raises(ControlGateError):
        gate.approveStep(USER_ID, workflow["id"], step["id"])

    assert gate.database.getWorkflow(workflow["id"])["status"] == "ABORTED"
    assert gate.database.getStep(step["id"])["status"] == "ABORTED"
    assert gate.database.hasAuditAction(workflow["id"], step["id"], "STEP_ABORTED")


def testExecutionTimeValidationFailureIsPersisted(gate: WorkflowControlGate):
    workflow = gate.createWorkflow(USER_ID, "search")
    gate.storePlan(
        USER_ID,
        workflow["id"],
        [{"tool_name": "search_information", "arguments": {"query": "status"}}],
    )
    tool = gate.database.getToolByName("search_information")
    gate.database.tools[tool["id"]]["input_schema"] = {
        "type": "object",
        "required": ["new_required_field"],
    }

    result = gate.startWorkflow(USER_ID, workflow["id"])

    step = gate.database.listSteps(workflow["id"])[0]
    assert result["status"] == "FAILED"
    assert step["status"] == "FAILED"
    assert step["output"] == {
        "error": "Tool failed deterministic validation before execution."
    }
    assert gate.database.hasAuditAction(
        workflow["id"], step["id"], "TOOL_VALIDATION_FAILED"
    )


def testRetryLimitIsEnforced(gate: WorkflowControlGate):
    workflow = gate.createWorkflow(USER_ID, "notify")
    gate.storePlan(USER_ID, workflow["id"], [demoPlan()[2]])
    gate.startWorkflow(USER_ID, workflow["id"])
    step = gate.database.listSteps(workflow["id"])[0]
    gate.database.updateStep(step["id"], {"retry_count": 3, "status": "FAILED"})

    with pytest.raises(ControlGateError) as error:
        gate.retryStep(USER_ID, workflow["id"], step["id"])

    assert error.value.code == "RETRY_LIMIT_REACHED"


def testCompleteDemoFlowPersistsRecoveryAndAuditTrail(gate: WorkflowControlGate):
    workflow = gate.createWorkflow(
        USER_ID, "Check the project status, update it, and notify the team"
    )
    gate.storePlan(USER_ID, workflow["id"], demoPlan())

    paused = gate.startWorkflow(USER_ID, workflow["id"])
    steps = gate.database.listSteps(workflow["id"])
    assert [step["status"] for step in steps] == [
        "COMPLETED",
        "WAITING_FOR_APPROVAL",
        "PENDING",
    ]
    assert paused["status"] == "WAITING_FOR_APPROVAL"

    afterApproval = gate.approveStep(USER_ID, workflow["id"], steps[1]["id"])
    assert afterApproval["status"] == "FAILED"
    assert gate.database.getStep(steps[2]["id"])["status"] == "FAILED"

    completed = gate.retryStep(USER_ID, workflow["id"], steps[2]["id"])
    assert completed["status"] == "COMPLETED"
    assert gate.database.getStep(steps[2]["id"])["retry_count"] == 1

    actions = [
        event["action"] for event in gate.database.listAuditLogs(workflow["id"])
    ]
    assert actions.count("PLAN_CREATED") == 1
    assert actions.count("APPROVAL_GRANTED") == 1
    assert actions.count("TOOL_EXECUTION_FAILED") == 1
    assert actions.count("RETRY_STARTED") == 1
    assert actions.count("TOOL_EXECUTION_SUCCEEDED") == 3
    assert actions[-1] == "WORKFLOW_COMPLETED"


def testApiUsesStrictEnvelopesAndKebabCaseRoutes(client: TestClient):
    headers = {"Authorization": f"Bearer {USER_ID}"}
    created = client.post(
        "/api/workflows", json={"goal": "Check status"}, headers=headers
    )
    assert created.status_code == 201
    body = created.json()
    assert body["success"] is True
    workflowId = UUID(body["data"]["id"])

    stored = client.post(
        f"/api/workflows/{workflowId}/plans",
        json={"steps": demoPlan(failNotificationOnce=False)},
        headers=headers,
    )
    assert stored.status_code == 201
    assert stored.json()["success"] is True

    started = client.post(
        f"/api/workflows/{workflowId}/start-execution", headers=headers
    )
    assert started.status_code == 200
    assert started.json()["data"]["status"] == "WAITING_FOR_APPROVAL"

    timeline = client.get(
        f"/api/workflows/{workflowId}/execution-timeline", headers=headers
    )
    assert timeline.status_code == 200
    assert timeline.json()["success"] is True
    assert len(timeline.json()["data"]) > 0

    forbidden = client.get(
        f"/api/workflows/{workflowId}",
        headers={"Authorization": f"Bearer {OTHER_USER_ID}"},
    )
    assert forbidden.status_code == 403
    assert forbidden.json() == {
        "success": False,
        "error": {
            "code": "FORBIDDEN",
            "message": "You do not have access to this workflow.",
        },
    }


def testApiRejectsMissingAuthenticationWithErrorEnvelope(client: TestClient):
    response = client.get("/api/tools")

    assert response.status_code == 401
    assert response.json() == {
        "success": False,
        "error": {
            "code": "UNAUTHORIZED",
            "message": "A valid bearer user ID is required.",
        },
    }


def testApiRejectsUnknownBearerIdentity(client: TestClient):
    response = client.get(
        "/api/tools", headers={"Authorization": f"Bearer {uuid4()}"}
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def testFrameworkErrorsAlsoUseStrictErrorEnvelope(client: TestClient):
    response = client.get("/api/not-a-real-route")

    assert response.status_code == 404
    assert response.json() == {
        "success": False,
        "error": {"code": "NOT_FOUND", "message": "Endpoint not found."},
    }
