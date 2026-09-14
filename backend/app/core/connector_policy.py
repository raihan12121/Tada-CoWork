from sqlalchemy import select
from app.db.session import AsyncSessionLocal, DBConnectorReview
from app.tools.registry import tool_registry


async def connector_is_allowed(tool_name: str) -> tuple[bool, str | None]:
    """Enforce marketplace review state when an admin has registered one.

    Built-in first-party tools are trusted by default. Once a review record is
    created, only its explicit ``approved`` state can enable that connector;
    this makes scope changes and blocking decisions effective immediately.
    """
    tool = tool_registry.get_tool(tool_name)
    if not tool or getattr(tool, "connector_type", "generic") == "generic":
        return True, None
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(DBConnectorReview).where(DBConnectorReview.connector_name == tool_name))
        review = result.scalar_one_or_none()
    if review and review.review_status != "approved":
        return False, f"Connector '{tool_name}' is not approved by the organization marketplace policy."
    return True, None
