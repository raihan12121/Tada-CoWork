import asyncio
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, Set
from sqlalchemy import select, update
from app.db.session import AsyncSessionLocal, DBApproval
from app.models.schemas import ApprovalRequest, ApprovalResponse, RiskLevel
from app.core.audit import audit_logger

class ApprovalGateManager:
    def __init__(self):
        self._pending_events: Dict[str, asyncio.Event] = {}
        self._pending_responses: Dict[str, ApprovalResponse] = {}
        self._pre_approved_classes: Dict[str, Set[str]] = {} # session_id -> set of pre-approved tool categories

    def get_pre_approved_classes(self, session_id: str) -> Set[str]:
        return self._pre_approved_classes.get(session_id, set())

    def pre_approve_class(self, session_id: str, category: str):
        if session_id not in self._pre_approved_classes:
            self._pre_approved_classes[session_id] = set()
        self._pre_approved_classes[session_id].add(category)

    async def request_approval(
        self,
        session_id: str,
        action_type: str,
        description: str,
        consequence: str,
        target: str,
        risk_level: RiskLevel,
        step_id: Optional[str] = None,
        diff: Optional[str] = None,
        takeover_mode: bool = False,
        takeover_url: Optional[str] = None
    ) -> Tuple[bool, Optional[str]]:
        """
        Pauses the calling coroutine until a human approves or denies the action.
        Returns (approved: bool, feedback: Optional[str]).
        """
        approval_id = str(uuid.uuid4())
        approval_req = ApprovalRequest(
            id=approval_id,
            session_id=session_id,
            step_id=step_id,
            action_type=action_type,
            description=description,
            consequence=consequence,
            target=target,
            diff=diff,
            risk_level=risk_level,
            status="pending",
            takeover_mode=takeover_mode,
            takeover_url=takeover_url,
            requested_at=datetime.utcnow()
        )

        # Save to DB
        async with AsyncSessionLocal() as db:
            db_approval = DBApproval(
                id=approval_id,
                session_id=session_id,
                step_id=step_id,
                action_type=action_type,
                description=description,
                consequence=consequence,
                target=target,
                diff=diff,
                risk_level=risk_level,
                status="pending",
                takeover_mode=takeover_mode,
                takeover_url=takeover_url,
                requested_at=datetime.utcnow()
            )
            db.add(db_approval)
            await db.commit()

        # Audit log entry
        audit_logger.log_event(
            session_id=session_id,
            event_type="approval_requested",
            actor="orchestrator",
            details={
                "approval_id": approval_id,
                "action_type": action_type,
                "target": target,
                "risk_level": risk_level,
                "consequence": consequence
            },
            step_id=step_id
        )

        event = asyncio.Event()
        self._pending_events[approval_id] = event

        try:
            # Wait for human resolution (indefinitely as per design.md §6 - no auto-approve on timeout)
            await event.wait()
            response = self._pending_responses.pop(approval_id, None)
            
            is_approved = response.decision == "approved" if response else False
            feedback = response.user_feedback if response else None

            # Handle pre-approval of medium risk class if requested
            if is_approved and response and response.always_allow_category:
                if risk_level == "medium":
                    self.pre_approve_class(session_id, action_type)

            return is_approved, feedback

        finally:
            self._pending_events.pop(approval_id, None)

    async def resolve_approval(
        self,
        approval_id: str,
        decision: str,
        user_feedback: Optional[str] = None,
        always_allow_category: bool = False,
        actor: str = "user"
    ) -> bool:
        """
        Called via REST API when user clicks Approve or Deny in UI.
        """
        if approval_id not in self._pending_events:
            return False

        resp = ApprovalResponse(
            decision="approved" if decision == "approved" else "denied",
            user_feedback=user_feedback,
            always_allow_category=always_allow_category
        )
        self._pending_responses[approval_id] = resp

        # Update DB
        async with AsyncSessionLocal() as db:
            stmt = update(DBApproval).where(DBApproval.id == approval_id).values(
                status=resp.decision,
                resolved_at=datetime.utcnow(),
                actor=actor,
                user_feedback=user_feedback
            )
            await db.execute(stmt)
            await db.commit()

        # Audit log resolution
        audit_logger.log_event(
            session_id="unknown",
            event_type="approval_resolved",
            actor=actor,
            details={
                "approval_id": approval_id,
                "decision": resp.decision,
                "feedback": user_feedback,
                "pre_approved_category": always_allow_category
            }
        )

        # Wake up waiting executor coroutine
        self._pending_events[approval_id].set()
        return True

    async def get_pending_approval(self, session_id: str) -> Optional[ApprovalRequest]:
        async with AsyncSessionLocal() as db:
            stmt = select(DBApproval).where(
                DBApproval.session_id == session_id,
                DBApproval.status == "pending"
            ).order_by(DBApproval.requested_at.desc())
            res = await db.execute(stmt)
            item = res.scalars().first()
            if not item:
                return None
            return ApprovalRequest(
                id=item.id,
                session_id=item.session_id,
                step_id=item.step_id,
                action_type=item.action_type,
                description=item.description,
                consequence=item.consequence,
                target=item.target,
                diff=item.diff,
                risk_level=item.risk_level, # type: ignore
                status=item.status, # type: ignore
                takeover_mode=item.takeover_mode,
                takeover_url=item.takeover_url,
                requested_at=item.requested_at,
                resolved_at=item.resolved_at,
                actor=item.actor,
                user_feedback=item.user_feedback
            )

from typing import Tuple
approval_gate_manager = ApprovalGateManager()
