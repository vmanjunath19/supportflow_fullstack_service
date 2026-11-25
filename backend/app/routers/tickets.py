from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status

from app.dependencies import get_ticket_repository
from app.repositories import (
    IllegalTransitionError,
    RepositoryError,
    RepositoryValidationError,
    TicketNotFoundError,
    TicketRepository,
)
from app.schemas.tickets import (
    PaginatedTicketsResponse,
    PaginationMeta,
    Ticket,
    TicketCreate,
    TicketDetailResponse,
    TicketFilter,
    TicketSlaDetails,
    TicketStatus,
    TicketUpdate,
)

router = APIRouter(tags=["Tickets"])
RepoDep = Annotated[TicketRepository, Depends(get_ticket_repository)]


def _compute_sla_details(ticket: Ticket) -> TicketSlaDetails:
    if ticket.sla_due_at is None:
        return TicketSlaDetails(sla_due_at=None, is_breached=False, remaining_seconds=None)

    due_at = (
        ticket.sla_due_at
        if ticket.sla_due_at.tzinfo is not None
        else ticket.sla_due_at.replace(tzinfo=timezone.utc)
    )
    now = datetime.now(timezone.utc)
    remaining = int((due_at - now).total_seconds())

    terminal_statuses = {TicketStatus.RESOLVED, TicketStatus.CLOSED}
    is_breached = remaining < 0 and ticket.status not in terminal_statuses

    return TicketSlaDetails(
        sla_due_at=due_at,
        is_breached=is_breached,
        remaining_seconds=None if ticket.status in terminal_statuses else remaining,
    )


@router.get(
    "/{ticket_id}",
    response_model=TicketDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get complete ticket details, SLA status, and audit events",
)
async def get_ticket_detail(ticket_id: UUID, repo: RepoDep) -> TicketDetailResponse:
    try:
        ticket = repo.get_by_id(ticket_id)
        if ticket is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Ticket {ticket_id} not found.",
            )
        audit_events = repo.list_audit_events(ticket_id)
    except HTTPException:
        raise
    except RepositoryError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch ticket {ticket_id}: {exc}",
        ) from exc

    return TicketDetailResponse(
        ticket=ticket,
        sla=_compute_sla_details(ticket),
        audit_events=audit_events,
    )


@router.get(
    "",
    response_model=PaginatedTicketsResponse,
    status_code=status.HTTP_200_OK,
    summary="List tickets with pagination and filters",
)
async def list_tickets(
    filters: Annotated[TicketFilter, Depends()],
    repo: RepoDep,
) -> PaginatedTicketsResponse:
    try:
        items, total_count = repo.list_tickets(filters)
    except RepositoryError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to query tickets: {exc}",
        ) from exc

    return PaginatedTicketsResponse(
        items=items,
        pagination=PaginationMeta(
            total=total_count,
            limit=filters.limit,
            offset=filters.offset,
            count=len(items),
            has_more=(filters.offset + len(items)) < total_count,
        ),
    )


@router.post(
    "",
    response_model=Ticket,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new support ticket transactionally",
)
async def create_ticket(
    payload: TicketCreate,
    response: Response,
    repo: RepoDep,
) -> Ticket:
    try:
        created_ticket = repo.create_with_audit(payload)
    except RepositoryValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Database validation error: {exc}",
        ) from exc
    except RepositoryError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Transactional ticket creation failed: {exc}",
        ) from exc

    response.headers["Location"] = f"/api/tickets/{created_ticket.id}"
    return created_ticket


@router.patch(
    "/{ticket_id}",
    response_model=Ticket,
    status_code=status.HTTP_200_OK,
    summary="Update ticket status, team assignment, and resolution notes",
)
async def update_ticket(
    ticket_id: UUID,
    payload: TicketUpdate,
    repo: RepoDep,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> Ticket:
    clear_team = "team_id" in payload.model_fields_set and payload.team_id is None

    try:
        return repo.update_with_audit(
            ticket_id,
            payload,
            clear_team=clear_team,
            idempotency_key=idempotency_key,
        )
    except TicketNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except (IllegalTransitionError, RepositoryValidationError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except RepositoryError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to update ticket: {exc}",
        ) from exc