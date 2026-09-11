import os
import re
import json
import concurrent.futures
from typing import Dict, Any, List, Optional
try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None
    types = None
from tool_contracts import PlanOutput, PlannedStep, REGISTERED_TOOLS

PLANNER_PROMPT = """
You are a workflow planning assistant.
Convert the user goal into a structured sequence of executable tool steps.
Available tools:
- search_information: Query records/status. Args: {"query": string}
- update_record: Update record status. Args: {"record_id": string, "status": string}
- send_notification: Alert/message team. Args: {"recipient": string, "message": string}
Rules:
1. ONLY select from the available tools above. Never invent tools.
2. Output MUST strictly match PlanOutput schema with 'tool_name' and non-null arguments.
3. Keep the plan sequential and under 8 steps.
4. If a goal asks for an unregistered action, return empty steps list with explanation in reasoning.
"""

_client = None

def get_client():
    global _client
    if genai is None or types is None:
        return None
    if _client is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            return None
        try:
            retry_cls = getattr(types, "HttpRetryOptions", getattr(types, "RetryOptions", None))
            retry_opts = retry_cls(attempts=1) if retry_cls else None
            http_options = types.HttpOptions(
                timeout=15000,
                retry_options=retry_opts
            )
            _client = genai.Client(api_key=api_key, http_options=http_options)
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

    # Check for explicitly unregistered or destructive actions (immediate security block)
    unregistered_keywords = ["delete", "drop", "destroy", "shutdown", "rm -rf", "wipe", "truncate", "kill"]
    has_unregistered = any(
        re.search(rf"\b{re.escape(kw)}\b", lower_goal) if not any(c in kw for c in " -") else kw in lower_goal
        for kw in unregistered_keywords
    )

    if has_unregistered:
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
    excluded_words = {
        "status", "record", "database", "the", "a", "an", "info", "details",
        "completion", "update", "notification", "finished", "completed",
        "and", "to", "of", "for", "in", "on", "at", "with", "from", "by",
        "as", "is", "it", "or", "but", "so", "then", "all", "our", "my",
        "this", "that", "these", "those", "team"
    }

    project_match = re.search(r"\bproject(?:[\s_:]+)([a-zA-Z0-9_\-]+)", cleaned_goal, re.IGNORECASE)
    record_match = re.search(r"\brecord(?:[\s_:]+)([a-zA-Z0-9_\-]+)", cleaned_goal, re.IGNORECASE)
    named_project_match = re.search(r"\b([a-zA-Z0-9_\-]+)\s+project\b", cleaned_goal, re.IGNORECASE)

    if record_match and record_match.group(1).lower() not in excluded_words:
        raw_entity = record_match.group(1)
        entity_name = raw_entity.lower() if raw_entity.lower().startswith("record_") else f"record_{raw_entity.lower()}"
        entity_display = f"record {raw_entity}"
    elif project_match and project_match.group(1).lower() not in excluded_words:
        raw_entity = project_match.group(1)
        entity_name = raw_entity.lower() if raw_entity.lower().startswith("project_") else f"project_{raw_entity.lower()}"
        entity_display = f"project {raw_entity}"
    elif named_project_match and named_project_match.group(1).lower() not in excluded_words and named_project_match.group(1).lower() not in ["find", "check", "the", "a", "this", "our", "my", "update", "delete", "notify"]:
        raw_entity = named_project_match.group(1)
        entity_name = raw_entity.lower() if raw_entity.lower().startswith("project_") else f"project_{raw_entity.lower()}"
        entity_display = f"project {raw_entity}"
    else:
        entity_name = "project_record"
        entity_display = "project"

    # Extract target status if present with stopword filtering
    status_stopwords = {
        "the", "a", "an", "team", "all", "user", "and", "or", "in", "for", "of", "to",
        "email", "recipient", "project", "record", "database", "info", "notification",
        "message", "channel", "slack", "me", "him", "her", "them", "us", "everyone"
    }

    target_status = None
    explicit_status_match = re.search(
        r"(?:status\s+(?:to|as|is|=)|set\s+(?:status\s+)?(?:to|as)|mark\s+(?:status\s+)?as|change\s+status\s+to|update\s+(?:status\s+)?to)\s+([a-zA-Z0-9_\-]+)",
        cleaned_goal,
        re.IGNORECASE
    )
    if explicit_status_match:
        candidate = explicit_status_match.group(1).lower().rstrip(".,")
        if candidate not in status_stopwords:
            target_status = candidate

    if not target_status:
        known_statuses = [
            "finished", "completed", "complete", "in_progress", "in progress",
            "done", "active", "pending", "failed", "closed", "resolved",
            "approved", "cancelled"
        ]
        for s in known_statuses:
            if re.search(rf"\b{re.escape(s)}\b", lower_goal):
                target_status = "completed" if s == "complete" else ("in_progress" if s == "in progress" else s)
                break

    if not target_status:
        fallback_status_match = re.search(r"\b(?:to|as)\s+([a-zA-Z0-9_\-]+)", cleaned_goal, re.IGNORECASE)
        if fallback_status_match:
            candidate = fallback_status_match.group(1).lower().rstrip(".,")
            if candidate not in status_stopwords and len(candidate) > 2:
                target_status = candidate

    if not target_status:
        target_status = "completed"

    # Extract recipient if present
    recipient = "team"
    recipient_match = re.search(
        r"(?:send\s+(?:an?\s+)?(?:email|notification|message|alert)\s+to|(?:notify|alert|message|email|inform|ping))\s+(?:to\s+)?(?:the\s+)?(.+?)(?=\s+(?:regarding|about|that|saying|with|for\s+the|for\s+project|\.|$)|$)",
        cleaned_goal,
        re.IGNORECASE
    )
    if recipient_match:
        raw_recip = recipient_match.group(1).strip().rstrip(".,")
        raw_recip = re.sub(r"^(?:to|the|a|an)\s+", "", raw_recip, flags=re.IGNORECASE).strip()
        if raw_recip and raw_recip.lower() not in ["about", "that", "on", "if", "when", "to", "the", "a", "an", "all", "our"]:
            if "@" in raw_recip or re.match(r"^[a-zA-Z0-9_\-]+$", raw_recip):
                recipient = raw_recip.lower()
            else:
                recipient = re.sub(r"[^\w]+", "_", raw_recip.strip()).strip("_").lower()

    if not recipient or len(recipient) < 3 or recipient in ["to", "the", "about", "that", "all"]:
        recipient = "team"

    # Construct notification message
    regarding_match = re.search(r"(?:regarding|about|saying|with\s+message)\s+(.+)", cleaned_goal, re.IGNORECASE)
    if regarding_match:
        extracted_msg = regarding_match.group(1).strip().rstrip(".")
        notification_message = extracted_msg[0].upper() + extracted_msg[1:] if extracted_msg else cleaned_goal
    elif wants_update:
        notification_message = f"Status update for {entity_display}: set to {target_status}."
    elif wants_search:
        notification_message = f"Information report for {entity_display}."
    else:
        notification_message = cleaned_goal

    # 1. Search Step
    if wants_search:
        steps.append(
            PlannedStep(
                step_id=f"step_{step_num}",
                tool_name="search_information",
                arguments={"query": f"Search status for {entity_display}"}
            )
        )
        step_num += 1

    # 2. Update Step
    if wants_update:
        steps.append(
            PlannedStep(
                step_id=f"step_{step_num}",
                tool_name="update_record",
                arguments={"record_id": entity_name, "status": target_status}
            )
        )
        step_num += 1

    # 3. Notification Step
    if wants_notify:
        steps.append(
            PlannedStep(
                step_id=f"step_{step_num}",
                tool_name="send_notification",
                arguments={
                    "recipient": recipient,
                    "message": notification_message
                }
            )
        )
        step_num += 1

    # Default fallback step if ambiguous
    if not steps:
        steps.append(
            PlannedStep(
                step_id="step_1",
                tool_name="search_information",
                arguments={"query": cleaned_goal}
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

def _call_gemini_model(client: Any, model_name: str, user_goal: str) -> Optional[Dict[str, Any]]:
    """Calls Gemini model with strict schema enforcement."""
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
        return None
    for step in validated_plan.steps:
        if step.tool_name not in REGISTERED_TOOLS:
            return None
    return validated_plan.model_dump()

def _try_ai_planning(user_goal: str) -> Optional[Dict[str, Any]]:
    """Attempts AI plan generation across configured models."""
    client = get_client()
    if not client:
        return None

    for model_name in ['gemini-2.5-flash', 'gemini-2.5-pro']:
        try:
            res = _call_gemini_model(client, model_name, user_goal)
            if res is not None:
                return res
        except Exception:
            continue
    return None

def generate_plan(user_goal: str) -> Dict[str, Any]:
    """
    Primary plan generation function with strict 15-second timeout and zero-downtime fallback.
    Guarantees response within 15 seconds by enforcing an execution watchdog.
    """
    if not user_goal or not user_goal.strip():
        plan = PlanOutput(
            goal="",
            steps=[],
            reasoning="Empty user goal provided."
        )
        return plan.model_dump()

    # Pre-emptively reject destructive or unregistered actions via deterministic safety rules
    lower_goal = user_goal.lower()
    unregistered_keywords = ["delete", "drop", "destroy", "shutdown", "rm -rf", "wipe", "truncate", "kill"]
    if any(re.search(rf"\b{re.escape(kw)}\b", lower_goal) if not any(c in kw for c in " -") else kw in lower_goal for kw in unregistered_keywords):
        return deterministic_fallback_planner(user_goal)

    # Strict 15-second timeout enforcement without blocking on worker thread completion
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    try:
        future = executor.submit(_try_ai_planning, user_goal)
        result = future.result(timeout=15.0)
        if result is not None:
            return result
    except (concurrent.futures.TimeoutError, Exception):
        pass
    finally:
        executor.shutdown(wait=False, cancel_futures=True)

    # Seamless deterministic fallback for zero downtime
    return deterministic_fallback_planner(user_goal)
