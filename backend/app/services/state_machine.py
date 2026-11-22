from typing import FrozenSet

VALID_STATUSES: FrozenSet[str] = frozenset(
    {"New", "Triaged", "In Progress", "Resolved", "Closed"}
)

ALLOWED_TRANSITIONS: dict[str, FrozenSet[str]] = {
    "New": frozenset({"Triaged", "Closed"}),
    "Triaged": frozenset({"In Progress", "Resolved", "Closed"}),
    "In Progress": frozenset({"Triaged", "Resolved", "Closed"}),
    "Resolved": frozenset({"Closed", "In Progress"}),
    "Closed": frozenset(),
}


class IllegalStateTransitionError(ValueError):
    """Raised when a ticket status transition violates the lifecycle state machine."""

    def __init__(self, current_status: str, target_status: str, allowed: FrozenSet[str]):
        self.current_status = current_status
        self.target_status = target_status
        self.allowed_transitions = sorted(allowed)

        if not self.allowed_transitions:
            message = (
                f"Illegal ticket state transition: '{current_status}' -> '{target_status}'. "
                f"'{current_status}' is a terminal state with no allowed outgoing transitions."
            )
        else:
            allowed_list = ", ".join(f"'{s}'" for s in self.allowed_transitions)
            message = (
                f"Illegal ticket state transition: '{current_status}' -> '{target_status}'. "
                f"Allowed transitions from '{current_status}': [{allowed_list}]."
            )
        super().__init__(message)


def validate_ticket_transition(
    current_status: str,
    target_status: str,
    *,
    team_id: str | None = None,
) -> None:
    """
    Validates a ticket status transition against ALLOWED_TRANSITIONS and relational
    invariants (e.g., Triaged / In Progress require an assigned team_id).
    """
    if current_status not in VALID_STATUSES:
        raise ValueError(f"Unknown current ticket status: '{current_status}'.")
    if target_status not in VALID_STATUSES:
        raise ValueError(
            f"Invalid target ticket status: '{target_status}'. "
            f"Must be one of {sorted(VALID_STATUSES)}."
        )

    if current_status == target_status:
        return

    allowed = ALLOWED_TRANSITIONS[current_status]
    if target_status not in allowed:
        raise IllegalStateTransitionError(current_status, target_status, allowed)

    if target_status in {"Triaged", "In Progress"} and not team_id:
        raise ValueError(
            f"Cannot transition ticket to '{target_status}' without an assigned support team (team_id is required)."
        )