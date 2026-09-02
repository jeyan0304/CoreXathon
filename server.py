from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from planner import generate_plan
from tool_contracts import REGISTERED_TOOLS, PlanOutput

app = FastAPI(title="AI Workflow Planner Engine")

class GoalRequest(BaseModel):
    goal: str

@app.get("/tools")
def get_tools():
    """Returns registered tools and their deterministic policy metadata."""
    return {
        "tools": [
            {
                "name": name,
                "permission": meta["permission"],
                "risk": meta["risk"],
                "requires_approval": meta["requires_approval"]
            }
            for name, meta in REGISTERED_TOOLS.items()
        ]
    }

@app.post("/plan", response_model=PlanOutput)
def create_plan(request: GoalRequest):
    """Generates a validated, structured plan from a natural language goal."""
    if not request.goal or not request.goal.strip():
        raise HTTPException(status_code=400, detail="Goal cannot be empty")
        
    try:
        result = generate_plan(request.goal)
        return result
    except Exception as exc:
        # Guarantee zero downtime and safe schema return without unhandled 500 exceptions
        fallback_plan = PlanOutput(
            goal=request.goal,
            steps=[],
            reasoning=f"Workflow planning fallback generated safely: {str(exc)}"
        )
        return fallback_plan.model_dump()