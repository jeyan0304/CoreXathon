from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, model_validator, model_serializer

class SearchInfoInput(BaseModel):
    query: str = Field(..., description="Query term to search status or records")

class UpdateRecordInput(BaseModel):
    record_id: str = Field(..., description="Unique record identifier")
    status: str = Field(..., description="New status string to set")

class SendNotificationInput(BaseModel):
    recipient: str = Field(..., description="Target email, channel, or team handle")
    message: str = Field(..., description="Notification body text")
    fail_once: Optional[bool] = Field(default=None, description="Optional simulated failure flag")

class PlannedStep(BaseModel):
    step_id: str = Field(..., description="Sequential step ID")
    tool_name: str = Field(..., description="Registered tool name")
    arguments: Dict[str, Any] = Field(default_factory=dict, description="Tool arguments matching registered tools")

    @model_validator(mode="before")
    @classmethod
    def handle_tool_alias(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "tool_name" not in data and "tool" in data:
                data["tool_name"] = data["tool"]
            if isinstance(data.get("arguments"), dict):
                data["arguments"] = {k: v for k, v in data["arguments"].items() if v is not None}
        return data

    @model_serializer
    def serialize_step(self) -> Dict[str, Any]:
        cleaned_args = {k: v for k, v in self.arguments.items() if v is not None}
        return {
            "step_id": self.step_id,
            "tool_name": self.tool_name,
            "arguments": cleaned_args,
        }

class PlanOutput(BaseModel):
    goal: str = Field(..., description="User goal")
    steps: List[PlannedStep] = Field(..., description="Ordered list of steps")
    reasoning: str = Field(..., description="Brief plan reasoning")

REGISTERED_TOOLS = {
    "search_information": {
        "permission": "READ",
        "risk": "LOW",
        "requires_approval": False,
        "schema": SearchInfoInput
    },
    "update_record": {
        "permission": "WRITE",
        "risk": "HIGH",
        "requires_approval": True,
        "schema": UpdateRecordInput
    },
    "send_notification": {
        "permission": "SEND",
        "risk": "HIGH",
        "requires_approval": False,
        "schema": SendNotificationInput
    }
}
