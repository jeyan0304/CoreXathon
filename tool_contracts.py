from typing import List, Optional
from pydantic import BaseModel, Field
class SearchInfoInput(BaseModel):
    query: str = Field(..., description="Query term to search status or records")
class UpdateRecordInput(BaseModel):
    record_id: str = Field(..., description="Unique record identifier")
    status: str = Field(..., description="New status string to set")
class SendNotificationInput(BaseModel):
    recipient: str = Field(..., description="Target email, channel, or team handle")
    message: str = Field(..., description="Notification body text")
class StepArguments(BaseModel):
    query: Optional[str] = Field(default=None, description="Used by search_information")
    record_id: Optional[str] = Field(default=None, description="Used by update_record")
    status: Optional[str] = Field(default=None, description="Used by update_record")
    recipient: Optional[str] = Field(default=None, description="Used by send_notification")
    message: Optional[str] = Field(default=None, description="Used by send_notification")
class PlannedStep(BaseModel):
    step_id: str = Field(..., description="Sequential step ID")
    tool: str = Field(..., description="Registered tool name")
    arguments: StepArguments = Field(..., description="Tool arguments matching registered tools")
class PlanOutput(BaseModel):
    goal: str = Field(..., description="User goal")
    steps: List[PlannedStep] = Field(..., description="Ordered list of steps")
    reasoning: str = Field(..., description="Brief plan reasoning")
REGISTERED_TOOLS = {
    "search_information": {"permission": "READ", "risk": "LOW", "requires_approval": False, "schema": SearchInfoInput},
    "update_record": {"permission": "WRITE", "risk": "HIGH", "requires_approval": True, "schema": UpdateRecordInput},
    "send_notification": {"permission": "SEND", "risk": "HIGH", "requires_approval": True, "schema": SendNotificationInput}
}
