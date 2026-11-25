from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from app.repositories.exceptions import IllegalTransitionError, TicketNotFoundError
from app.schemas.tickets import (
    Ticket,
    TicketAuditEvent,
    TicketCreate,
    TicketFilter,
    TicketPriority,
    TicketStatus,
    TicketUpdate,
)

ALLOWED_TRANSITIONS: dict[TicketStatus, set[TicketStatus]] = {
    TicketStatus.NEW: {TicketStatus.TRIAGED, TicketStatus.IN_PROGRESS, TicketStatus.CLOSED},
    TicketStatus.TRIAGED: {TicketStatus.IN_PROGRESS, TicketStatus.BLOCKED, TicketStatus.CLOSED},
    TicketStatus.IN_PROGRESS: {TicketStatus.BLOCKED, TicketStatus.RESOLVED, TicketStatus.TRIAGED},
    TicketStatus.BLOCKED: {TicketStatus.IN_PROGRESS, TicketStatus.CLOSED},
    TicketStatus.RESOLVED: {TicketStatus.CLOSED, TicketStatus.IN_PROGRESS},
    TicketStatus.CLOSED: set(),
}

SLA_HOURS: dict[TicketPriority, int] = {
    TicketPriority.URGENT: 1,
    TicketPriority.HIGH: 4,
    TicketPriority.MEDIUM: 24,
    TicketPriority.LOW: 72,
}


class InMemoryTicketRepository:
    def __init__(self) -> None:
        self._tickets: dict[UUID, Ticket] = {}
        self._events: dict[UUID, list[TicketAuditEvent]] = {}
        self._counter = 1000

    def create_with_audit(self, payload: TicketCreate) -> Ticket:
        now = datetime.now(timezone.utc)
        self._counter += 1
        ticket_id = uuid4()

        ticket = Ticket(
            id=ticket_id,
            ticket_number=self._counter,
            title=payload.title.strip(),
            description=payload.description.strip(),
            category=payload.category,
            priority=payload.priority,
            status=TicketStatus.NEW,
            requester_email=payload.requester_email,
            team_id=payload.team_id,
            sla_due_at=now + timedelta(hours=SLA_HOURS[payload.priority]),
            created_at=now,
            updated_at=now,
        )
        self._tickets[ticket_id] = ticket
        self._events[ticket_id] = [
            TicketAuditEvent(
                id=uuid4(),
                ticket_id=ticket_id,
                event_type="ticket_created",
                actor=str(payload.requester_email).lower(),
                previous_state=None,
                new_state=ticket.status.value,
                metadata={"source": "memory", "priority": ticket.priority.value},
                idempotency_key=f"create:{ticket_id}",
                created_at=now,
            )
        ]
        return ticket

    def get_by_id(self, ticket_id: UUID) -> Ticket | None:
        return self._tickets.get(ticket_id)

    def list_audit_events(self, ticket_id: UUID) -> list[TicketAuditEvent]:
        return list(self._events.get(ticket_id, []))

    def list_tickets(self, filters: TicketFilter) -> tuple[list[Ticket], int]:
        items = list(self._tickets.values())

        if filters.status is not None:
            items = [t for t in items if t.status == filters.status]
        if filters.priority is not None:
            items = [t for t in items if t.priority == filters.priority]
        if filters.category is not None:
            items = [t for t in items if t.category == filters.category]
        if filters.team_id is not None:
            items = [t for t in items if t.team_id == filters.team_id]
        if filters.requester_email is not None:
            items = [t for t in items if str(t.requester_email) == str(filters.requester_email)]
        if filters.created_from is not None:
            items = [t for t in items if t.created_at >= filters.created_from]
        if filters.created_to is not None:
            items = [t for t in items if t.created_at <= filters.created_to]
        if filters.search:
            term = filters.search.lower()
            items = [t for t in items if term in t.title.lower() or term in t.description.lower()]

        items.sort(key=lambda t: t.created_at, reverse=(filters.sort_order == "desc"))
        total = len(items)
        return items[filters.offset : filters.offset + filters.limit], total

    def update_with_audit(
        self,
        ticket_id: UUID,
        payload: TicketUpdate,
        *,
        clear_team: bool = False,
        idempotency_key: str | None = None,
    ) -> Ticket:
        existing = self._tickets.get(ticket_id)
        if existing is None:
            raise TicketNotFoundError(f"Ticket {ticket_id} not found.")

        if existing.status == TicketStatus.CLOSED:
            raise IllegalTransitionError("Cannot modify a Closed ticket")

        target_status = payload.status or existing.status
        if target_status != existing.status:
            if target_status not in ALLOWED_TRANSITIONS[existing.status]:
                raise IllegalTransitionError(
                    f'Cannot transition ticket from "{existing.status.value}" to "{target_status.value}"'
                )

        new_team_id = None if clear_team else (payload.team_id or existing.team_id)
        new_notes = payload.resolution_notes if payload.resolution_notes is not None else existing.resolution_notes

        if target_status == TicketStatus.RESOLVED and not (new_notes and new_notes.strip()):
            raise IllegalTransitionError("resolution_notes are required when resolving a ticket")

        now = datetime.now(timezone.utc)
        resolved_at = existing.resolved_at
        if target_status == TicketStatus.RESOLVED and existing.status != TicketStatus.RESOLVED:
            resolved_at = now
        elif target_status == TicketStatus.IN_PROGRESS and existing.status == TicketStatus.RESOLVED:
            resolved_at = None

        updated = existing.model_copy(
            update={
                "status": target_status,
                "team_id": new_team_id,
                "resolution_notes": new_notes,
                "resolved_at": resolved_at,
                "updated_at": now,
            }
        )
        self._tickets[ticket_id] = updated

        event_type = (
            "status_changed"
            if target_status != existing.status
            else ("team_assigned" if clear_team or payload.team_id != existing.team_id else "ticket_updated")
        )
        self._events[ticket_id].append(
            TicketAuditEvent(
                id=uuid4(),
                ticket_id=ticket_id,
                event_type=event_type,
                actor=payload.actor or "agent@supportflow.local",
                previous_state=existing.status.value,
                new_state=target_status.value,
                metadata={"source": "memory"},
                idempotency_key=idempotency_key or f"{event_type}:{ticket_id}:{now.timestamp()}",
                created_at=now,
            )
        )
        return updated