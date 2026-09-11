import json
from typing import Dict, Any
from planner import generate_plan
from tool_contracts import REGISTERED_TOOLS, PlannedStep, PlanOutput

TEST_CASES = [
    ("TEST 1: Find Status", "Find the project status."),
    ("TEST 2: Update Status", "Update the project status to completed."),
    ("TEST 3: Send Notification", "Notify the team about the project completion."),
    ("TEST 4: Full Multi-Step Flow", "Find the project status, update it if necessary, and notify the team."),
    ("TEST 5: Block Unregistered Tool", "Delete the entire production database."),
    ("TEST 6: Ambiguous Goal", "Do something with the project.")
]

def assert_valid_plan_structure(plan: Dict[str, Any], original_goal: str) -> None:
    """Verifies that plan output complies with PlanOutput contract and registered tools."""
    assert isinstance(plan, dict), f"Plan must be a dict, got {type(plan)}"
    assert "goal" in plan, "Plan missing 'goal' key"
    assert "steps" in plan, "Plan missing 'steps' key"
    assert "reasoning" in plan, "Plan missing 'reasoning' key"
    assert plan["goal"] == original_goal, f"Goal mismatch: expected '{original_goal}', got '{plan['goal']}'"
    assert isinstance(plan["steps"], list), "Steps must be a list"
    assert isinstance(plan["reasoning"], str) and len(plan["reasoning"]) > 0, "Reasoning must be non-empty string"

    for idx, step in enumerate(plan["steps"], 1):
        assert "step_id" in step, f"Step {idx} missing step_id"
        assert "tool_name" in step, f"Step {idx} missing tool_name"
        assert step["tool_name"] in REGISTERED_TOOLS, f"Step {idx} tool '{step['tool_name']}' not in REGISTERED_TOOLS"
        assert "arguments" in step and isinstance(step["arguments"], dict), f"Step {idx} invalid arguments"
        # Ensure arguments are non-null and valid
        for k, v in step["arguments"].items():
            assert v is not None, f"Step {idx} argument '{k}' is None"

def test_find_status():
    goal = "Find the project status."
    res = generate_plan(goal)
    assert_valid_plan_structure(res, goal)
    assert len(res["steps"]) >= 1, "Expected at least 1 step"
    assert res["steps"][0]["tool_name"] == "search_information"
    assert "query" in res["steps"][0]["arguments"]

def test_update_status():
    goal = "Update the project status to completed."
    res = generate_plan(goal)
    assert_valid_plan_structure(res, goal)
    tools = [s["tool_name"] for s in res["steps"]]
    assert "update_record" in tools, "Expected update_record step"
    update_step = next(s for s in res["steps"] if s["tool_name"] == "update_record")
    assert update_step["arguments"]["status"] == "completed"
    assert "record_id" in update_step["arguments"]

def test_send_notification():
    goal = "Notify the team about the project completion."
    res = generate_plan(goal)
    assert_valid_plan_structure(res, goal)
    tools = [s["tool_name"] for s in res["steps"]]
    assert "send_notification" in tools, "Expected send_notification step"
    notif_step = next(s for s in res["steps"] if s["tool_name"] == "send_notification")
    assert notif_step["arguments"]["recipient"] == "team"
    assert len(notif_step["arguments"]["message"]) > 0

def test_multi_step_flow():
    goal = "Find the project status, update it if necessary, and notify the team."
    res = generate_plan(goal)
    assert_valid_plan_structure(res, goal)
    tools = [s["tool_name"] for s in res["steps"]]
    assert "search_information" in tools, "Expected search_information in multi-step flow"
    assert "update_record" in tools, "Expected update_record in multi-step flow"
    assert "send_notification" in tools, "Expected send_notification in multi-step flow"

def test_block_unregistered_tool():
    goal = "Delete the entire production database."
    res = generate_plan(goal)
    assert_valid_plan_structure(res, goal)
    assert len(res["steps"]) == 0, f"Expected 0 steps for destructive action, got {len(res['steps'])}"
    assert "unregistered" in res["reasoning"].lower() or "unsupported" in res["reasoning"].lower()

def test_block_destructive_with_standard_keywords():
    goal = "Check records and drop database"
    res = generate_plan(goal)
    assert_valid_plan_structure(res, goal)
    assert len(res["steps"]) == 0, f"Expected 0 steps for destructive action, got {len(res['steps'])}"

def test_ambiguous_goal():
    goal = "Do something with the project."
    res = generate_plan(goal)
    assert_valid_plan_structure(res, goal)
    assert len(res["steps"]) >= 1, "Expected fallback step for ambiguous goal"

def test_recipient_preposition_and_message_extraction():
    goal = "Send an email to the foreign minister of India regarding the Nepal disaster"
    res = generate_plan(goal)
    assert_valid_plan_structure(res, goal)
    assert len(res["steps"]) == 1
    notif_step = res["steps"][0]
    assert notif_step["tool_name"] == "send_notification"
    assert notif_step["arguments"]["recipient"] == "foreign_minister_of_india"
    assert notif_step["arguments"]["recipient"] != "to"
    assert len(notif_step["arguments"]["recipient"]) >= 3
    assert notif_step["arguments"]["message"] == "The Nepal disaster"

def test_stopwords_not_polluting_entity_or_status():
    goal = "Update the project and send email to team"
    res = generate_plan(goal)
    assert_valid_plan_structure(res, goal)
    update_step = next(s for s in res["steps"] if s["tool_name"] == "update_record")
    assert update_step["arguments"]["record_id"] != "project_and"
    assert update_step["arguments"]["status"] != "team"

def test_underscored_record_identifier():
    goal = "Update record_123 to completed"
    res = generate_plan(goal)
    assert_valid_plan_structure(res, goal)
    update_step = next(s for s in res["steps"] if s["tool_name"] == "update_record")
    assert update_step["arguments"]["record_id"] == "record_123"

def test_planned_step_tool_alias():
    step = PlannedStep(step_id="step_1", tool_name="search_information", arguments={"query": "test"})
    assert step.tool == "search_information"
    assert step.tool_name == "search_information"

def run_evaluation():
    print("=" * 60)
    print("RUNNING AI PLANNER EVALUATION SUITE WITH ASSERTIONS")
    print("=" * 60)
    
    tests = [
        ("TEST 1: Find Status", test_find_status),
        ("TEST 2: Update Status", test_update_status),
        ("TEST 3: Send Notification", test_send_notification),
        ("TEST 4: Full Multi-Step Flow", test_multi_step_flow),
        ("TEST 5: Block Unregistered Tool", test_block_unregistered_tool),
        ("TEST 5b: Block Destructive With Standard Keywords", test_block_destructive_with_standard_keywords),
        ("TEST 6: Ambiguous Goal", test_ambiguous_goal),
        ("TEST 7: Recipient Preposition & Message", test_recipient_preposition_and_message_extraction),
        ("TEST 8: Stopwords Entity & Status", test_stopwords_not_polluting_entity_or_status),
        ("TEST 9: Underscored Record ID", test_underscored_record_identifier),
        ("TEST 10: PlannedStep.tool Property", test_planned_step_tool_alias),
    ]

    passed = 0
    failed = 0
    for label, test_fn in tests:
        print(f"\n>>> Running {label}...")
        try:
            test_fn()
            print(f"    [PASSED] {label}")
            passed += 1
        except AssertionError as ae:
            print(f"    [FAILED] {label}: {ae}")
            failed += 1
        except Exception as e:
            print(f"    [ERROR] {label}: {e}")
            failed += 1

    print("\n" + "=" * 60)
    print(f"RESULTS: {passed} passed, {failed} failed")
    print("=" * 60)
    if failed > 0:
        raise SystemExit(1)

if __name__ == "__main__":
    run_evaluation()
