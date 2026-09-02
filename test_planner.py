import planner
from fastapi.testclient import TestClient
from server import app as plannerApp


def testPlannerClientEnforcesFifteenSecondTimeoutWithoutSdkRetries(monkeypatch):
    captured = {}

    def createClient(**kwargs):
        captured.update(kwargs)
        return object()

    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(planner.genai, "Client", createClient)
    monkeypatch.setattr(planner, "_client", None)

    planner.get_client()

    httpOptions = captured["http_options"]
    assert httpOptions.timeout == 15_000
    assert httpOptions.retry_options.attempts == 1


def testPlannerFallsBackAfterOneBoundedRemoteAttempt(monkeypatch):
    class Models:
        def __init__(self):
            self.calls = 0

        def generate_content(self, **kwargs):
            self.calls += 1
            raise TimeoutError("provider timeout")

    class Client:
        def __init__(self):
            self.models = Models()

    client = Client()
    monkeypatch.setattr(planner, "get_client", lambda: client)

    result = planner.generate_plan("Check project status")

    assert client.models.calls == 1
    assert result["steps"][0]["tool"] == "search_information"


def testPlannerToolEndpointMatchesLockedNotificationApprovalContract():
    response = TestClient(plannerApp).get("/tools")

    assert response.status_code == 200
    tools = {tool["name"]: tool for tool in response.json()["tools"]}
    assert tools["send_notification"]["requires_approval"] is False


def testFallbackParsesEmailRecipientInsteadOfTheWordTo():
    result = planner.deterministic_fallback_planner(
        "Send an email to the foreign minister of India regarding the Nepal disaster"
    )

    step = result["steps"][0]
    assert step["tool"] == "send_notification"
    assert step["arguments"]["recipient"] == "foreign_minister_of_india"
    assert step["arguments"]["message"] == (
        "Send an email to the foreign minister of India regarding the Nepal disaster"
    )
