import pytest

from app.services.state_machine import (
    IllegalStateTransitionError,
    validate_ticket_transition,
)


def test_valid_lifecycle_happy_path():
    team_id = "11111111-1111-1111-1111-111111111111"
    validate_ticket_transition("New", "Triaged", team_id=team_id)
    validate_ticket_transition("Triaged", "In Progress", team_id=team_id)
    validate_ticket_transition("In Progress", "Resolved", team_id=team_id)
    validate_ticket_transition("Resolved", "Closed", team_id=team_id)


def test_reopen_resolved_ticket_is_allowed():
    team_id = "11111111-1111-1111-1111-111111111111"
    validate_ticket_transition("Resolved", "In Progress", team_id=team_id)


@pytest.mark.parametrize(
    "current_status,target_status",
    [
        ("Closed", "New"),
        ("Closed", "Triaged"),
        ("Closed", "In Progress"),
        ("Closed", "Resolved"),
        ("New", "Resolved"),
        ("New", "In Progress"),
        ("Triaged", "New"),
        ("In Progress", "New"),
        ("Resolved", "New"),
        ("Resolved", "Triaged"),
    ],
)
def test_illegal_transitions_raise_descriptive_error(current_status, target_status):
    team_id = "11111111-1111-1111-1111-111111111111"
    with pytest.raises(IllegalStateTransitionError) as exc_info:
        validate_ticket_transition(current_status, target_status, team_id=team_id)

    err_msg = str(exc_info.value)
    assert f"'{current_status}' -> '{target_status}'" in err_msg


def test_triaged_or_in_progress_without_team_id_rejected():
    with pytest.raises(ValueError, match="without an assigned support team"):
        validate_ticket_transition("New", "Triaged", team_id=None)