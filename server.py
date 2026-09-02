from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from planner import generate_plan
from tool_contracts import REGISTERED_TOOLS

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

@app.post("/plan")
def create_plan(request: GoalRequest):
    """Generates a validated, structured plan from a natural language goal."""
    if not request.goal.strip():
        raise HTTPException(status_code=400, detail="Goal cannot be empty")
        
    result = generate_plan(request.goal)
    
    if "error" in result:
        raise HTTPException(status_code=422, detail=result)
        
    return result