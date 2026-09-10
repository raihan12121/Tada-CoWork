from fastapi import APIRouter, HTTPException
from app.models.schemas import ApprovalResponse
from app.engine.approval_gate import approval_gate_manager

router = APIRouter(prefix="/approvals", tags=["approvals"])

@router.post("/{approval_id}/resolve")
async def resolve_approval(approval_id: str, payload: ApprovalResponse):
    resolved = await approval_gate_manager.resolve_approval(
        approval_id=approval_id,
        decision=payload.decision,
        user_feedback=payload.user_feedback,
        always_allow_category=payload.always_allow_category
    )
    if not resolved:
        raise HTTPException(status_code=404, detail="Pending approval not found or already resolved")
    return {"status": "success", "decision": payload.decision}
