from datetime import datetime, timezone
from app.services.classification import classify_incident

FIXED_NOW = datetime(2026, 11, 22, 12, 0, tzinfo=timezone.utc)


def test_scenario_01_production_outage_elevates_to_urgent_1h_sla():
    res = classify_incident(
        title="Complete outage on EU checkout cluster",
        description="Production down across primary availability zone.",
        category="Software",
        requested_priority="Low",
        now=FIXED_NOW,
    )
    assert res.effective_priority == "Urgent"
    assert res.assigned_team_name == "Cloud & DevOps"
    assert res.escalated is True
    assert (res.sla_due_at - FIXED_NOW).total_seconds() == 3600
    assert "KW-01-OUTAGE" in res.matched_rules


def test_scenario_02_payment_down_routes_to_cloud_devops_urgent():
    res = classify_incident(
        title="Payment down on UK storefront",
        description="Checkout failing with payment gateway timeout.",
        category="Other",
        requested_priority="Medium",
        now=FIXED_NOW,
    )
    assert res.effective_priority == "Urgent"
    assert res.assigned_team_name == "Cloud & DevOps"
    assert (res.sla_response_due_at - FIXED_NOW).total_seconds() == 900
    assert "KW-02-PAYMENT" in res.matched_rules


def test_scenario_03_security_incident_overrides_to_identity_security_urgent():
    res = classify_incident(
        title="Suspected unauthorized access on admin API",
        description="Potential data breach detected in audit logs.",
        category="Software",
        requested_priority="Medium",
        now=FIXED_NOW,
    )
    assert res.effective_category == "Access & IAM"
    assert res.effective_priority == "Urgent"
    assert res.assigned_team_name == "Identity & Security"
    assert "KW-03-SECURITY" in res.matched_rules


def test_scenario_04_network_packet_loss_routes_to_netops_high_4h_sla():
    res = classify_incident(
        title="Severe packet loss on Edinburgh branch link",
        description="BGP flap causing intermittent drops.",
        category="Other",
        requested_priority="Low",
        now=FIXED_NOW,
    )
    assert res.effective_category == "Network"
    assert res.effective_priority == "High"
    assert res.assigned_team_name == "Network Operations"
    assert (res.sla_due_at - FIXED_NOW).total_seconds() == 4 * 3600
    assert "KW-04-NETWORK" in res.matched_rules


def test_scenario_05_http_503_degradation_elevates_to_high():
    res = classify_incident(
        title="Reporting API returning 503 errors",
        description="Latency spike observed on report generation.",
        category="Database & Cloud",
        requested_priority="Low",
        now=FIXED_NOW,
    )
    assert res.effective_priority == "High"
    assert res.assigned_team_name == "Cloud & DevOps"
    assert "KW-05-DEGRADATION" in res.matched_rules


def test_scenario_06_iam_lockout_routes_to_identity_security_medium():
    res = classify_incident(
        title="Employee locked out after MFA reset",
        description="Needs SSO login token re-issued.",
        category="Other",
        requested_priority="Low",
        now=FIXED_NOW,
    )
    assert res.effective_category == "Access & IAM"
    assert res.effective_priority == "Medium"
    assert res.assigned_team_name == "Identity & Security"
    assert (res.sla_due_at - FIXED_NOW).total_seconds() == 24 * 3600


def test_scenario_07_sentiment_and_caps_urgency_heuristics_elevate_ticket():
    res = classify_incident(
        title="CRM PORTAL COMPLETELY UNUSABLE ASAP!!",
        description="This is a critical blocker for our sales team immediately!!",
        category="Software",
        requested_priority="Low",
        now=FIXED_NOW,
    )
    assert res.heuristic_urgency_score >= 5
    assert res.effective_priority in {"Medium", "High", "Urgent"}
    assert res.escalated is True
    assert any(r.startswith("heuristic:") for r in res.matched_rules)


def test_scenario_08_blast_radius_plus_urgency_heuristics_resolve_urgent():
    res = classify_incident(
        title="HR portal down for entire company ASAP",
        description="All users and executive staff blocked from payroll approval.",
        category="Software",
        requested_priority="Low",
        now=FIXED_NOW,
    )
    assert res.effective_priority == "Urgent"
    assert res.assigned_team_name == "Cloud & DevOps"
    assert (res.sla_due_at - FIXED_NOW).total_seconds() == 3600


def test_scenario_09_explicit_matrix_and_non_downgrade_floor():
    res = classify_incident(
        title="Routine workstation monitor calibration",
        description="Minor color tint adjustment.",
        category="Hardware",
        requested_priority="Urgent",
        impact="Low",
        urgency="Low",
        now=FIXED_NOW,
    )
    assert res.effective_priority == "Urgent"
    assert res.assigned_team_name == "IT Field Support"
    assert res.escalated is False


def test_scenario_10_unknown_category_defaults_to_general_triage_72h_sla():
    res = classify_incident(
        title="Order spare ergonomic footrest",
        description="Standard desk accessory request for new starter.",
        category="UnmappedCategory",
        requested_priority="Low",
        now=FIXED_NOW,
    )
    assert res.effective_category == "Other"
    assert res.effective_priority == "Low"
    assert res.assigned_team_name == "General Triage Desk"
    assert (res.sla_due_at - FIXED_NOW).total_seconds() == 72 * 3600