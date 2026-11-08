import hashlib
import math
import re
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from sqlalchemy import delete, select

from app.db.session import AsyncSessionLocal, DBMemoryItem, DBWorkspace
from app.models.schemas import MemoryCandidate, MemoryItemModel, MemoryType, MemoryUpdate

EMBEDDING_DIMENSIONS = 256

# Function words carry almost no retrieval signal; excluding them keeps the
# hashed vector focused on topical content.
_STOPWORDS = frozenset(
    ["a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "can", "do", "does", "for", "from", "has", "have", "how", "i", "if", "in", "into", "is", "it", "its", "me", "my", "not", "of", "on", "or", "our", "so", "than", "that", "the", "their", "them", "then", "there", "these", "they", "this", "to", "was", "we", "were", "what", "when", "where", "which", "who", "will", "with", "you", "your"]
)


def _bucket(token: str, dimensions: int) -> tuple:
    """Stable signed hash bucket (Python's built-in hash is seeded per process)."""
    digest = hashlib.sha256(token.encode("utf-8")).digest()
    index = int.from_bytes(digest[:4], "big") % dimensions
    sign = 1.0 if digest[4] & 1 else -1.0
    return index, sign


def compute_simple_embedding(text: str, dimensions: int = EMBEDDING_DIMENSIONS) -> List[float]:
    """Deterministic hashed bag-of-words + character-trigram embedding.

    Character trigrams add morphological recall ("reporting" ~ "reports",
    "invoice" ~ "invoicing") that a pure word-frequency vector misses, without
    pulling in torch/sentence-transformers. Signed hashing keeps collisions
    roughly zero-mean instead of always inflating scores.
    """
    words = [
        word
        for word in re.findall(r"[a-z0-9]+", (text or "").lower())
        if word not in _STOPWORDS
    ]
    counts: Dict[str, float] = {}
    for word in words:
        key = f"w:{word}"
        counts[key] = counts.get(key, 0.0) + 2.0
        padded = f"<{word}>"
        for i in range(len(padded) - 2):
            gram = f"c:{padded[i:i + 3]}"
            counts[gram] = counts.get(gram, 0.0) + 1.0

    vector = [0.0] * dimensions
    for token, count in counts.items():
        index, sign = _bucket(token, dimensions)
        # Sublinear term frequency: repeated terms saturate instead of dominating.
        vector[index] += sign * (1.0 + math.log(count))

    norm = math.sqrt(sum(value * value for value in vector))
    if norm:
        vector = [value / norm for value in vector]
    return vector


def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    dot = sum(a * b for a, b in zip(v1, v2, strict=False))
    norm1 = math.sqrt(sum(a * a for a in v1)) or 1.0
    norm2 = math.sqrt(sum(b * b for b in v2)) or 1.0
    return dot / (norm1 * norm2)

class LongTermMemoryManager:
    def __init__(self):
        # Long-term memory is explicitly opt-in per Memory.md.
        self.enabled_workspaces: Dict[str, bool] = {"default": False}

    def set_memory_enabled(self, workspace_id: str, enabled: bool):
        self.enabled_workspaces[workspace_id] = enabled

    def is_memory_enabled(self, workspace_id: str) -> bool:
        return self.enabled_workspaces.get(workspace_id, False)

    async def load_workspace_settings(self) -> None:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(DBWorkspace))
            for workspace in result.scalars().all():
                self.enabled_workspaces[workspace.id] = bool(workspace.memory_enabled)

    async def persist_memory_enabled(self, workspace_id: str, enabled: bool) -> None:
        self.set_memory_enabled(workspace_id, enabled)
        async with AsyncSessionLocal() as db:
            workspace = await db.get(DBWorkspace, workspace_id)
            if not workspace:
                workspace = DBWorkspace(id=workspace_id, organization_id="default", name=workspace_id, memory_enabled=enabled)
                db.add(workspace)
            else:
                workspace.memory_enabled = enabled
            await db.commit()

    async def add_memory_item(
        self,
        memory_type: MemoryType,
        content: str,
        workspace_id: str = "default",
        key: Optional[str] = None,
        source_session_id: Optional[str] = None
    ) -> MemoryItemModel:
        async with AsyncSessionLocal() as db:
            item_id = str(uuid.uuid4())
            db_item = DBMemoryItem(
                id=item_id,
                type=memory_type,
                key=key,
                content=content,
                source_session_id=source_session_id,
                workspace_id=workspace_id,
                is_active=True,
                created_at=datetime.now(timezone.utc)
            )
            db.add(db_item)
            await db.commit()

            return MemoryItemModel(
                id=item_id,
                type=memory_type,
                key=key,
                content=content,
                source_session_id=source_session_id,
                workspace_id=workspace_id,
                is_active=True,
                created_at=db_item.created_at
            )

    async def retrieve_relevant_memory(
        self,
        query: str,
        workspace_id: str = "default",
        limit: int = 5
    ) -> List[MemoryItemModel]:
        """
        Retrieves top-k relevant facts/preferences/summaries partitioned by workspace.
        """
        if not self.is_memory_enabled(workspace_id):
            return []

        async with AsyncSessionLocal() as db:
            stmt = select(DBMemoryItem).where(
                DBMemoryItem.workspace_id == workspace_id,
                DBMemoryItem.is_active
            )
            result = await db.execute(stmt)
            items = result.scalars().all()

            if not items:
                return []

            q_vec = compute_simple_embedding(query)
            scored = []
            for item in items:
                i_vec = compute_simple_embedding(f"{item.key or ''} {item.content}")
                score = cosine_similarity(q_vec, i_vec)
                scored.append((score, item))

            scored.sort(key=lambda x: x[0], reverse=True)
            top_items = [
                MemoryItemModel(
                    id=item.id,
                    type=item.type, # type: ignore
                    key=item.key,
                    content=item.content,
                    source_session_id=item.source_session_id,
                    workspace_id=item.workspace_id,
                    is_active=item.is_active,
                    created_at=item.created_at,
                    last_used_at=item.last_used_at
                )
                for score, item in scored[:limit]
            ]
            now = datetime.now(timezone.utc)
            for _, item in scored[:limit]:
                item.last_used_at = now
            await db.commit()
            return top_items

    async def list_all_memory(self, workspace_id: str = "default") -> List[MemoryItemModel]:
        async with AsyncSessionLocal() as db:
            stmt = select(DBMemoryItem).where(DBMemoryItem.workspace_id == workspace_id)
            result = await db.execute(stmt)
            items = result.scalars().all()
            return [
                MemoryItemModel(
                    id=i.id,
                    type=i.type, # type: ignore
                    key=i.key,
                    content=i.content,
                    source_session_id=i.source_session_id,
                    workspace_id=i.workspace_id,
                    is_active=i.is_active,
                    created_at=i.created_at,
                    last_used_at=i.last_used_at
                )
                for i in items
            ]

    async def delete_memory_item(self, item_id: str) -> bool:
        async with AsyncSessionLocal() as db:
            stmt = select(DBMemoryItem).where(DBMemoryItem.id == item_id)
            result = await db.execute(stmt)
            item = result.scalar_one_or_none()
            if not item:
                return False
            del_stmt = delete(DBMemoryItem).where(DBMemoryItem.id == item_id)
            await db.execute(del_stmt)
            await db.commit()
            return True

    async def update_memory_item(self, item_id: str, changes: MemoryUpdate) -> Optional[MemoryItemModel]:
        async with AsyncSessionLocal() as db:
            stmt = select(DBMemoryItem).where(DBMemoryItem.id == item_id)
            result = await db.execute(stmt)
            item = result.scalar_one_or_none()
            if not item:
                return None
            if changes.content is not None:
                item.content = changes.content.strip()
            if changes.key is not None:
                item.key = changes.key
            if changes.is_active is not None:
                item.is_active = changes.is_active
            await db.commit()
            return MemoryItemModel(
                id=item.id, type=item.type, key=item.key, content=item.content,
                source_session_id=item.source_session_id, workspace_id=item.workspace_id,
                is_active=item.is_active, created_at=item.created_at, last_used_at=item.last_used_at,
            )

    def propose_candidates_from_task(self, task: str, deliverables: List[str]) -> List[MemoryCandidate]:
        """
        Lightweight extraction pass at task end proposing candidate memory items.
        (Shown to user for confirmation before storing - Memory.md §4).
        """
        candidates = []
        task_lower = task.lower()
        if "report" in task_lower and "format" in task_lower:
            candidates.append(MemoryCandidate(
                type="preference",
                key="report_format",
                content="Prefers 3-section executive report formatting with key findings first.",
                rationale="Observed formatting structure in report deliverable."
            ))
        if "competitor" in task_lower:
            candidates.append(MemoryCandidate(
                type="summary",
                key="competitive_landscape",
                content="Completed competitive research across industry software alternatives.",
                rationale="Extracted high-level summary from competitive research task."
            ))
        if "expense" in task_lower or "receipt" in task_lower:
            candidates.append(MemoryCandidate(
                type="preference",
                key="expense_categorization",
                content="Categorizes expense line items with date, vendor, category, and tax breakdown.",
                rationale="Extracted table schema from expense spreadsheet generation."
            ))
        return candidates

long_term_memory = LongTermMemoryManager()
