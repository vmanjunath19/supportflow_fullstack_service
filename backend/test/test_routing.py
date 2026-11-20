from uuid import uuid4
from app.services.routing import evaluate_routing_rule

SAMPLE_TEAMS = [
    {"id": str(uuid4()), "name": "IT Field Support", "default_category": "Hardware", "escalation_email": "field-support@supportflow.local", "is_active": True},
    {"id": str(uuid4()), "name": "Application Support", "default_category": "Software", "escalation_email": "app-support@supportflow.local", "is_active": True},
    {"id": str(uuid4()), "name": "Network Operations", "default_category": "Network", "escalation_email": "netops-oncall@supportflow.local", "is_active": True},
    {"id": str(uuid4()), "name": "Identity & Security", "default_category": "Access & IAM", "escalation_email": "secops-oncall@supportflow.local", "is_active": True},
    {"id": str(uuid4()), "name": "Cloud & DevOps", "default_category": "Database & Cloud", "escalation_email": "devops-oncall@supportflow.local", "is_active": True},
    {"id": str(uuid4()), "name": "General Triage Desk", "default_category": None, "escalation_email": "triage-desk@supportflow.local", "is_active": True},
]


def test_five_distinct_categories_route_correctly():
    cases = [
        ("Hardware", "Low", "IT Field Support"),
        ("Software", "Medium", "Application Support"),
        ("Network", "Medium", "Network Operations"),
        ("Access & IAM", "High", "Identity & Security"),
        ("Database & Cloud", "High", "Cloud & DevOps"),
    ]
    for category, priority, expected_team in cases:
        decision = evaluate_routing_rule(category, priority, SAMPLE_TEAMS)
        assert decision.target_team_name == expected_team
        assert decision.is_fallback is False


def test_software_high_impact_escalates_to_cloud_devops():
    decision = evaluate_routing_rule("Software", "Urgent", SAMPLE_TEAMS)
    assert decision.target_team_name == "Cloud & DevOps"
    assert decision.escalation_applied is True
    assert decision.is_fallback is False


def test_other_category_routes_to_fallback_team():
    decision = evaluate_routing_rule("Other", "Low", SAMPLE_TEAMS)
    assert decision.target_team_name == "General Triage Desk"
    assert decision.is_fallback is True