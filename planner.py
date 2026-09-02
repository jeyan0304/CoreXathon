import os
import re
import json
from typing import Dict, Any, List
from google import genai
from google.genai import types
from tool_contracts import PlanOutput, PlannedStep, StepArguments, REGISTERED_TOOLS

PLANNER_PROMPT = """
You are a workflow planning assistant.
Convert the user goal into a structured sequence of executable tool steps.
Available tools:
- search_information: Query records/status. Args: {"query": string}
- update_record: Update record status. Args: {"record_id": string, "status": string}
- send_notification: Alert/message team. Args: {"recipient": string, "message": string}
Rules:
1. ONLY select from the available tools above. Never invent tools.
2. Output MUST strictly match PlanOutput schema.
3. Keep the plan sequential and under 8 steps.
4. If a goal asks for an unregistered action, return empty steps list with explanation in reasoning.
"""

_client = None

def get_client():
    global _client
    if _client is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            return None
        try:
            _client = genai.Client(api_key=api_key)
        except Exception:
            return None
    return _client

def deterministic_fallback_planner(user_goal: str) -> Dict[str, Any]:
    """
    Deterministic rule-based heuristic fallback engine.
    Guarantees zero downtime by returning a valid schema-compliant PlanOutput dict
    when remote AI is unconfigured, rate-limited (429), or capacity-constrained (503).
    """
    cleaned_goal = user_goal.strip() if user_goal else ""
    lower_goal = cleaned_goal.lower()

    if not cleaned_goal:
        plan = PlanOutput(
            goal="",
            steps=[],
            reasoning="Empty user goal provided."
        )
        return plan.model_dump()

    # Check for explicitly unregistered or destructive actions without standard workflow intentions
    unregistered_keywords = ["delete", "drop", "destroy", "shutdown", "rm -rf", "wipe", "truncate", "kill"]
    has_unregistered = any(re.search(rf"\b{kw}\b", lower_goal) for kw in unregistered_keywords)
    has_standard = any(kw in lower_goal for kw in ["find", "search", "check", "notify", "update", "status"])

    if has_unregistered and not has_standard:
        plan = PlanOutput(
            goal=cleaned_goal,
            steps=[],
            reasoning=f"Goal requests unregistered or unsupported actions. Permitted tools are: {', '.join(REGISTERED_TOOLS.keys())}."
        )
        return plan.model_dump()

    steps: List[PlannedStep] = []
    step_num = 1

    # Heuristic detection for Search Intent
    search_keywords = ["find", "search", "check", "query", "lookup", "look up", "get", "fetch", "read", "inspect", "view"]
    wants_search = any(re.search(rf"\b{kw}\b", lower_goal) for kw in search_keywords)

    # Heuristic detection for Update Intent
    update_keywords = ["update", "set", "modify", "change", "mark", "edit", "alter"]
    wants_update = any(re.search(rf"\b{kw}\b", lower_goal) for kw in update_keywords)

    # Heuristic detection for Notify Intent
    notify_keywords = ["notify", "send", "alert", "message", "inform", "email", "ping"]
    wants_notify = any(re.search(rf"\b{kw}\b", lower_goal) for kw in notify_keywords)

    # Extract target entity/project name if present
    project_match = re.search(r"\bproject\s+([a-zA-Z0-9_\-]+)", cleaned_goal, re.IGNORECASE)
    record_match = re.search(r"\brecord\s+([a-zA-Z0-9_\-]+)", cleaned_goal, re.IGNORECASE)
    named_project_match = re.search(r"\b([a-zA-Z0-9_\-]+)\s+project\b", cleaned_goal, re.IGNORECASE)

    excluded_words = ["status", "record", "database", "the", "a", "an", "info", "details", "completion", "update", "notification", "finished", "completed"]
    if project_match and project_match.group(1).lower() not in excluded_words:
        raw_entity = project_match.group(1)
        entity_name = f"project_{raw_entity.lower()}"
        entity_display = f"project {raw_entity}"
    elif record_match:
        raw_entity = record_match.group(1)
        entity_name = f"record_{raw_entity.lower()}"
        entity_display = f"record {raw_entity}"
    elif named_project_match and named_project_match.group(1).lower() not in ["find", "check", "the", "a", "this", "our", "my", "update", "delete", "notify"]:
        raw_entity = named_project_match.group(1)
        entity_name = f"project_{raw_entity.lower()}"
        entity_display = f"project {raw_entity}"
    else:
        entity_name = "project_record"
        entity_display = "project"

    # Extract target status if present
    status_match = re.search(r"(?:to|as|status\s+to|status\s+as)\s+([a-zA-Z0-9_\-]+)", cleaned_goal, re.IGNORECASE)
    if status_match:
        target_status = status_match.group(1).lower().rstrip(".,")
    elif "finished" in lower_goal:
        target_status = "finished"
    elif "completed" in lower_goal or "complete" in lower_goal:
        target_status = "completed"
    elif "in_progress" in lower_goal or "in progress" in lower_goal:
        target_status = "in_progress"
    else:
        target_status = "completed"

    # Extract recipient if present
    recipient_match = re.search(r"(?:notify|alert|message|email|inform|ping)\s+(?:the\s+)?([a-zA-Z0-9_\-@]+)", cleaned_goal, re.IGNORECASE)
    if recipient_match:
        recipient = recipient_match.group(1).lower().rstrip(".,")
        if recipient in ["about", "that", "on", "if", "when"]:
            recipient = "team"
    else:
        recipient = "team"

    # 1. Search Step
    if wants_search:
        steps.append(
            PlannedStep(
                step_id=f"step_{step_num}",
                tool="search_information",
                arguments=StepArguments(query=f"Search status for {entity_display}")
            )
        )
        step_num += 1

    # 2. Update Step
    if wants_update:
        steps.append(
            PlannedStep(
                step_id=f"step_{step_num}",
                tool="update_record",
                arguments=StepArguments(record_id=entity_name, status=target_status)
            )
        )
        step_num += 1

    # 3. Notification Step
    if wants_notify:
        steps.append(
            PlannedStep(
                step_id=f"step_{step_num}",
                tool="send_notification",
                arguments=StepArguments(
                    recipient=recipient,
                    message=f"Status update for {entity_display}: set to {target_status}."
                )
            )
        )
        step_num += 1

    # Default fallback step if ambiguous
    if not steps:
        steps.append(
            PlannedStep(
                step_id="step_1",
                tool="search_information",
                arguments=StepArguments(query=cleaned_goal)
            )
        )

    reasoning = (
        f"Deterministic fallback planner generated {len(steps)} sequential step(s) "
        f"matching registered tool contracts for goal: '{cleaned_goal}'."
    )

    plan = PlanOutput(
        goal=cleaned_goal,
        steps=steps,
        reasoning=reasoning
    )
    return plan.model_dump()

def generate_plan(user_goal: str) -> Dict[str, Any]:
    """
    Primary plan generation function with zero-downtime deterministic fallback.
    Tries Google Gemini API first if configured; intercepts any 429, 503, timeout,
    or schema failure and returns a deterministic, schema-compliant PlanOutput.
    """
    if not user_goal or not user_goal.strip():
        plan = PlanOutput(
            goal="",
            steps=[],
            reasoning="Empty user goal provided."
        )
        return plan.model_dump()

    client = get_client()
    if client:
        try:
            for model_name in ['gemini-2.5-flash', 'gemini-3.6-flash']:
                try:
                    response = client.models.generate_content(
                        model=model_name,
                        contents=user_goal,
                        config=types.GenerateContentConfig(
                            system_instruction=PLANNER_PROMPT,
                            response_mime_type="application/json",
                            response_schema=PlanOutput,
                            temperature=0.1,
                        ),
                    )
                    plan_dict = json.loads(response.text)
                    validated_plan = PlanOutput(**plan_dict)

                    if len(validated_plan.steps) > 8:
                        return deterministic_fallback_planner(user_goal)
                    for step in validated_plan.steps:
                        if step.tool not in REGISTERED_TOOLS:
                            return deterministic_fallback_planner(user_goal)
                    return validated_plan.model_dump()
                except Exception:
                    continue
        except Exception:
            pass

    # Seamless fallback for zero downtime
    return deterministic_fallback_planner(user_goal)
