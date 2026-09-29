import os
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from sqlalchemy import select, func
from app.db.session import AsyncSessionLocal, DBSession

PLAN_TIERS = {
    "free": {
        "name": "Free Tier",
        "monthly_task_limit": 20,
        "max_steps_per_task": 30,
        "max_tool_calls_per_task": 50,
        "support_level": "community",
        "price_usd": 0.0,
    },
    "pro": {
        "name": "Pro Tier",
        "monthly_task_limit": 200,
        "max_steps_per_task": 60,
        "max_tool_calls_per_task": 100,
        "support_level": "standard",
        "price_usd": 20.0,
    },
    "enterprise": {
        "name": "Enterprise Tier",
        "monthly_task_limit": -1,  # Unlimited
        "max_steps_per_task": 120,
        "max_tool_calls_per_task": 300,
        "support_level": "dedicated",
        "price_usd": 100.0,
    },
}

class PlanTierManager:
    def __init__(self):
        self._workspace_tiers: Dict[str, str] = {}

    def get_tier(self, workspace_id: str = "default") -> str:
        env_tier = os.getenv("COAGENT_PLAN_TIER", "").lower()
        if env_tier in PLAN_TIERS:
            return env_tier
        if os.getenv("APP_ENV", "development").lower() != "production":
            return self._workspace_tiers.get(workspace_id, "enterprise")
        return self._workspace_tiers.get(workspace_id, "pro")

    async def set_tier(self, tier: str, workspace_id: str = "default") -> Dict[str, Any]:
        tier_key = tier.lower()
        if tier_key not in PLAN_TIERS:
            raise ValueError(f"Unknown plan tier '{tier}'. Available tiers: {list(PLAN_TIERS.keys())}")
        self._workspace_tiers[workspace_id] = tier_key
        return await self.get_tier_details(workspace_id)

    async def get_monthly_usage(self, workspace_id: str = "default") -> int:
        now = datetime.now(timezone.utc)
        start_of_month = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(func.count(DBSession.id)).where(
                    DBSession.workspace_id == workspace_id,
                    DBSession.created_at >= start_of_month,
                )
            )
            count = result.scalar() or 0
        return int(count)

    async def check_quota(self, workspace_id: str = "default") -> None:
        tier_key = self.get_tier(workspace_id)
        config = PLAN_TIERS[tier_key]
        limit = config["monthly_task_limit"]
        if limit == -1:
            return  # Unlimited
        used = await self.get_monthly_usage(workspace_id)
        if used >= limit:
            raise PermissionError(
                f"Monthly task quota exceeded for plan tier '{tier_key}' ({used}/{limit} tasks used this month). "
                "Please upgrade your plan to Pro or Enterprise to continue creating autonomous tasks."
            )

    async def get_tier_details(self, workspace_id: str = "default") -> Dict[str, Any]:
        tier_key = self.get_tier(workspace_id)
        config = PLAN_TIERS[tier_key]
        used = await self.get_monthly_usage(workspace_id)
        limit = config["monthly_task_limit"]
        remaining = -1 if limit == -1 else max(0, limit - used)
        now = datetime.now(timezone.utc)
        # Next reset is 1st of next month
        if now.month == 12:
            next_reset = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            next_reset = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)

        return {
            "workspace_id": workspace_id,
            "plan_tier": tier_key,
            "tier_name": config["name"],
            "monthly_task_limit": limit,
            "tasks_used_this_month": used,
            "tasks_remaining": remaining,
            "quota_exhausted": False if limit == -1 else (used >= limit),
            "quota_reset_at": next_reset.isoformat(),
            "max_steps_per_task": config["max_steps_per_task"],
            "max_tool_calls_per_task": config["max_tool_calls_per_task"],
            "available_tiers": [
                {"tier": k, "name": v["name"], "limit": v["monthly_task_limit"], "price_usd": v["price_usd"]}
                for k, v in PLAN_TIERS.items()
            ],
        }

plan_tier_manager = PlanTierManager()
