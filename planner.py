import os
import json
from typing import Dict, Any
from google import genai
from google.genai import types
from tool_contracts import PlanOutput, REGISTERED_TOOLS
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
        _client = genai.Client(api_key=api_key)
    return _client
def generate_plan(user_goal: str) -> Dict[str, Any]:
    client = get_client()
    if not client:
        return {"error": "CONFIG_ERROR", "message": "GEMINI_API_KEY is not set"}
    try:
        response = client.models.generate_content(
            model='gemini-3.6-flash',
            contents=user_goal,
            config=types.GenerateContentConfig(
                system_instruction=PLANNER_PROMPT,
                response_mime_type="application/json",
                response_schema=PlanOutput,
                temperature=0.1,
            ),
        )
        plan_dict = json.loads(response.text)
        if len(plan_dict.get("steps", [])) > 8:
            return {"error": "LIMIT_EXCEEDED", "message": "Plan exceeded max 8 steps boundary"}
        for step in plan_dict.get("steps", []):
            if step.get("tool") not in REGISTERED_TOOLS:
                return {"error": "UNREGISTERED_TOOL", "message": f"Tool '{step.get('tool')}' is not registered."}
        return plan_dict
    except Exception as exc:
        return {"error": "AI_TIMEOUT_OR_ERROR", "message": str(exc)}
