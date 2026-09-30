import json
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from sqlalchemy import select, delete
from app.db.session import AsyncSessionLocal, DBSkill
from app.models.schemas import SkillModel, SkillCreate, SkillRunRequest, SessionModel, SessionCreate, StepBase, PlanModel
from app.engine.session_manager import session_manager

class SkillManager:
    async def list_skills(self, workspace_id: str = "default") -> List[SkillModel]:
        async with AsyncSessionLocal() as db:
            stmt = select(DBSkill).where(DBSkill.workspace_id == workspace_id, DBSkill.is_active == True).order_by(DBSkill.created_at.desc())
            res = await db.execute(stmt)
            rows = res.scalars().all()
            return [
                SkillModel(
                    id=r.id,
                    workspace_id=r.workspace_id,
                    name=r.name,
                    description=r.description,
                    source_session_id=r.source_session_id,
                    parameters_schema=json.loads(r.parameters_schema_json or "{}"),
                    steps_definition=json.loads(r.steps_definition_json or "[]"),
                    is_active=r.is_active,
                    created_at=r.created_at,
                    updated_at=r.updated_at,
                )
                for r in rows
            ]

    async def get_skill(self, skill_id: str) -> Optional[SkillModel]:
        async with AsyncSessionLocal() as db:
            stmt = select(DBSkill).where(DBSkill.id == skill_id)
            res = await db.execute(stmt)
            r = res.scalar_one_or_none()
            if not r:
                return None
            return SkillModel(
                id=r.id,
                workspace_id=r.workspace_id,
                name=r.name,
                description=r.description,
                source_session_id=r.source_session_id,
                parameters_schema=json.loads(r.parameters_schema_json or "{}"),
                steps_definition=json.loads(r.steps_definition_json or "[]"),
                is_active=r.is_active,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )

    async def create_skill(self, data: SkillCreate) -> SkillModel:
        skill_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        async with AsyncSessionLocal() as db:
            db_skill = DBSkill(
                id=skill_id,
                workspace_id=data.workspace_id,
                name=data.name.strip(),
                description=data.description.strip(),
                parameters_schema_json=json.dumps(data.parameters_schema),
                steps_definition_json=json.dumps(data.steps_definition),
                is_active=True,
                created_at=now,
                updated_at=now,
            )
            db.add(db_skill)
            await db.commit()
            return SkillModel(
                id=skill_id,
                workspace_id=data.workspace_id,
                name=data.name.strip(),
                description=data.description.strip(),
                parameters_schema=data.parameters_schema,
                steps_definition=data.steps_definition,
                is_active=True,
                created_at=now,
                updated_at=now,
            )

    async def create_skill_from_session(
        self,
        session_id: str,
        name: str,
        description: str,
        workspace_id: str = "default"
    ) -> SkillModel:
        """Teach-by-demonstration: record an approved plan into a reusable Skill."""
        session = await session_manager.get_session(session_id)
        if not session or not session.plan:
            raise ValueError("Session or plan not found")

        steps_definition = [
            {
                "step_order": s.step_order,
                "description": s.description,
                "tool": s.tool,
                "risk_level": s.risk_level,
                "dependencies": s.dependencies,
            }
            for s in session.plan.steps
        ]

        skill_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        async with AsyncSessionLocal() as db:
            db_skill = DBSkill(
                id=skill_id,
                workspace_id=workspace_id,
                name=name.strip(),
                description=description.strip(),
                source_session_id=session_id,
                parameters_schema_json=json.dumps({}),
                steps_definition_json=json.dumps(steps_definition),
                is_active=True,
                created_at=now,
                updated_at=now,
            )
            db.add(db_skill)
            await db.commit()
            return SkillModel(
                id=skill_id,
                workspace_id=workspace_id,
                name=name.strip(),
                description=description.strip(),
                source_session_id=session_id,
                parameters_schema={},
                steps_definition=steps_definition,
                is_active=True,
                created_at=now,
                updated_at=now,
            )

    async def run_skill(self, skill_id: str, req: SkillRunRequest) -> SessionModel:
        skill = await self.get_skill(skill_id)
        if not skill:
            raise ValueError("Skill not found")

        param_str = "\n".join(f"- {k}: {v}" for k, v in req.parameters.items()) if req.parameters else "Default settings"
        task_prompt = f"Run Skill [{skill.name}]: {skill.description}\n\nParameters:\n{param_str}"

        # Create session with required tools
        enabled_tools = sorted({s.get("tool") for s in skill.steps_definition if s.get("tool")})
        session = await session_manager.create_session(
            SessionCreate(
                task=task_prompt,
                workspace_id=skill.workspace_id,
                provider_account_id=req.provider_account_id,
                enabled_tools=enabled_tools,
            )
        )

        # Start execution
        await session_manager.start_execution(session.id)
        updated = await session_manager.get_session(session.id)
        return updated or session

    async def delete_skill(self, skill_id: str) -> bool:
        async with AsyncSessionLocal() as db:
            stmt = delete(DBSkill).where(DBSkill.id == skill_id)
            res = await db.execute(stmt)
            await db.commit()
            return res.rowcount > 0

skill_manager = SkillManager()
