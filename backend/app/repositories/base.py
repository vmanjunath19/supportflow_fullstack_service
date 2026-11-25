from typing import Protocol
from uuid import UUID

from app.schemas.tickets import (
    Ticket,
    TicketAuditEvent,
    TicketCreate,
    TicketFilter,
    TicketUpdate,
)


class TicketRepository(Protocol):
    def create_with_audit(self, payload: TicketCreate) -> Ticket:
        """Atomically create a ticket and record its initial audit event."""
        ...

    def get_by_id(self, ticket_id: UUID) -> Ticket | None:
        """Fetch a single ticket by UUID, or None if not found."""
        ...

    def list_audit_events(self, ticket_id: UUID) -> list[TicketAuditEvent]:
        """Fetch chronological audit events for a ticket."""
        ...

    def list_tickets(self, filters: TicketFilter) -> tuple[list[Ticket], int]:
        """Return (paginated_items, total_matching_count)."""
        ...

    def update_with_audit(
        self,
        ticket_id: UUID,
        payload: TicketUpdate,
        *,
        clear_team: bool = False,
        idempotency_key: str | None = None,
    ) -> Ticket:
        """Atomically validate state transition, update ticket, and log audit event."""
        ...