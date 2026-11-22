from datetime import datetime, timezone
from app.services.classification import classify_incident


def test_outage_keyword_elevates_low_priority_to_urgent_with_1h_sla():
    now = datetime(2026, 11, 22, 12, 0, tzinfo=timezone.utc)
    res = classify_incident(
        title="Complete outage on EU checkout cluster",
        description="Customers seeing 503 errors.",
        category="Software",
        requested_priority="Low",
        now=now,
    )
    assert res.effective_priority == "Urgent"
    assert res.assigned_team_name == "Cloud & DevOps"
    assert res.escalated is True
    assert (res.sla_due_at - now).total_seconds() == 3600
    assert "KW-01-OUTAGE" in res.matched_rules


def test_payment_down_routes_to_cloud_devops_urgent():
    res = classify_incident(
        title="Payment down in UK storefront",
        description="Stripe webhook queue stalled.",
        category="Other",
        requested_priority="Medium",
    )
    assert res.effective_priority == "Urgent"
    assert res.assigned_team_name == "Cloud & DevOps"
    assert "KW-02-PAYMENT" in res.matched_rules


def test_impact_urgency_matrix_medium_high_resolves_to_high():
    res = classify_incident(
        title="Regional reporting export delayed",
        description="Batch job running 45 minutes behind schedule.",
        category="Database & Cloud",
        requested_priority="Low",
        impact="Medium",
        urgency="High",
    )
    assert res.effective_priority == "High"
    assert res.assigned_team_name == "Cloud & DevOps"


def test_keyword_never_downgrades_explicit_urgent_ticket():
    res = classify_incident(
        title="Locked out of executive board portal",
        description="CEO cannot sign in before earnings call.",
        category="Access & IAM",
        requested_priority="Urgent",
    )
    assert res.effective_priority == "Urgent"
    assert res.assigned_team_name == "Identity & Security"