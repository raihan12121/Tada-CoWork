from dataclasses import dataclass, field
import json
from typing import Dict, Set, Any


@dataclass
class OrganizationPolicy:
    connector_allowlist: Set[str] = field(default_factory=set)
    connector_blocklist: Set[str] = field(default_factory=set)
    kill_switch: bool = False
    retention_days: int = 30
    data_region: str = "local"

    connector_tools: Set[str] = field(default_factory=lambda: {
        "google_drive", "github", "slack", "webhook", "gmail", "outlook"
    })

    def allows(self, tool_name: str) -> bool:
        if tool_name in self.connector_blocklist:
            return False
        if tool_name not in self.connector_tools:
            return True
        return not self.connector_allowlist or tool_name in self.connector_allowlist


class OrganizationPolicyManager:
    def __init__(self):
        self._policies: Dict[str, OrganizationPolicy] = {}

    def get(self, organization_id: str) -> OrganizationPolicy:
        return self._policies.setdefault(organization_id, OrganizationPolicy())

    def configure(self, organization_id: str, **changes) -> OrganizationPolicy:
        policy = self.get(organization_id)
        if "connector_allowlist" in changes:
            policy.connector_allowlist = set(changes["connector_allowlist"])
        if "connector_blocklist" in changes:
            policy.connector_blocklist = set(changes["connector_blocklist"])
        for field_name in ("kill_switch", "retention_days", "data_region"):
            if field_name in changes and changes[field_name] is not None:
                setattr(policy, field_name, changes[field_name])
        return policy

    def load_row(self, row: Any) -> OrganizationPolicy:
        return self.configure(
            row.id,
            connector_allowlist=json.loads(row.connector_allowlist_json or "[]"),
            connector_blocklist=json.loads(row.connector_blocklist_json or "[]"),
            retention_days=row.retention_days,
            data_region=row.data_region,
            kill_switch=row.kill_switch,
        )


org_policy_manager = OrganizationPolicyManager()
