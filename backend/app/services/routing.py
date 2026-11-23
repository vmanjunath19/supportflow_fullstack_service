from dataclasses import dataclass
from typing import Any, Optional
from uuid import UUID


@dataclass(frozen=True)
class RoutingDecision:
    target_team_name: str
    team_id: Optional[UUID]
    escalation_email: Optional[str]
    matched_rule: str
    is_fallback: bool
    escalation_applied: bool


# Exact 5 distinct categories from public.ticket_category enum
CATEGORY_TEAM_RULES: dict[str, str] = {
    "hardware": "IT Field Support",
    "software": "Application Support",
    "network": "Network Operations",
    "access & iam": "Identity & Security",
    "database & cloud": "Cloud & DevOps",
}

FALLBACK_TEAM_NAME = "General Triage Desk"
HIGH_IMPACT_PRIORITIES = {"urgent", "high"}


def evaluate_routing_rule(
    category: str,
    priority: str,
    teams: list[dict[str, Any]],
) -> RoutingDecision:
    """
    Maps the 5 distinct ticket_category enum values + impact overrides to active
    support teams, routing 'Other' or unclassified categories to General Triage Desk.
    """
    active_teams = [t for t in teams if t.get("is_active", True)]
    teams_by_name = {t["name"].strip().lower(): t for t in active_teams}
    teams_by_default_cat = {
        t["default_category"].strip().lower(): t
        for t in active_teams
        if t.get("default_category")
    }

    normalized_category = (category or "").strip().lower()
    normalized_priority = (priority or "").strip().lower()
    is_high_impact = normalized_priority in HIGH_IMPACT_PRIORITIES

    matched_team: Optional[dict[str, Any]] = None
    matched_rule = ""
    is_fallback = False
    escalation_applied = False

    # 1. Impact escalation override: Urgent/High Software outages escalate to Cloud & DevOps
    if normalized_category == "software" and is_high_impact:
        matched_team = teams_by_name.get("cloud & devops")
        if matched_team:
            matched_rule = "category:software+high_impact_escalation"
            escalation_applied = True

    # 2. Match directly against DB `default_category` column
    if matched_team is None and normalized_category in teams_by_default_cat:
        matched_team = teams_by_default_cat[normalized_category]
        matched_rule = f"db_default_category:{normalized_category}"

    # 3. Match against normalized category-to-team rule map
    if matched_team is None and normalized_category in CATEGORY_TEAM_RULES:
        target_name = CATEGORY_TEAM_RULES[normalized_category].lower()
        matched_team = teams_by_name.get(target_name)
        if matched_team:
            matched_rule = f"category_rule:{normalized_category}"

    # 4. Fallback for 'Other' or any unclassified category
    if matched_team is None:
        is_fallback = True
        matched_team = teams_by_name.get(FALLBACK_TEAM_NAME.lower()) or (
            active_teams[0] if active_teams else None
        )
        matched_rule = f"fallback:unclassified({normalized_category or 'empty'})"

    if matched_team is None:
        return RoutingDecision(
            target_team_name=FALLBACK_TEAM_NAME,
            team_id=None,
            escalation_email=None,
            matched_rule="error:no_active_teams",
            is_fallback=True,
            escalation_applied=False,
        )

    return RoutingDecision(
        target_team_name=matched_team["name"],
        team_id=UUID(str(matched_team["id"])),
        escalation_email=matched_team.get("escalation_email"),
        matched_rule=matched_rule,
        is_fallback=is_fallback,
        escalation_applied=escalation_applied,
    )