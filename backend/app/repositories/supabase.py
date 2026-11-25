from uuid import UUID

from postgrest.exceptions import APIError
from supabase import Client

from app.repositories.exceptions import (
    IllegalTransitionError,
    RepositoryError,
    RepositoryValidationError,
    TicketNotFoundError,
)
from app.schemas.tickets import (
    Ticket,
    TicketAuditEvent,
    TicketCreate,
    TicketFilter,
    TicketUpdate,
)


class SupabaseTicketRepository:
    def __init__(self, client: Client) -> None:
        self._client = client

    def create_with_audit(self, payload: TicketCreate) -> Ticket:
        rpc_params = {
            "p_title": payload.title,
            "p_description": payload.description,
            "p_requester_email": str(payload.requester_email),
            "p_category": payload.category.value,
            "p_priority": payload.priority.value,
            "p_team_id": str(payload.team_id) if payload.team_id else None,
        }
        try:
            result = self._client.rpc("create_ticket_with_audit", rpc_params).execute()
        except APIError as exc:
            if exc.code in {"22P02", "23503", "23514"}:
                raise RepositoryValidationError(exc.message or str(exc)) from exc
            raise RepositoryError(exc.message or str(exc)) from exc
        except Exception as exc:
            raise RepositoryError(str(exc)) from exc

        row = result.data[0] if isinstance(result.data, list) else result.data
        if not row:
            raise RepositoryError("RPC succeeded but returned no ticket record.")
        return Ticket.model_validate(row)

    def get_by_id(self, ticket_id: UUID) -> Ticket | None:
        try:
            res = (
                self._client.table("tickets")
                .select("*")
                .eq("id", str(ticket_id))
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise RepositoryError(str(exc)) from exc

        rows = res.data or []
        return Ticket.model_validate(rows[0]) if rows else None

    def list_audit_events(self, ticket_id: UUID) -> list[TicketAuditEvent]:
        try:
            res = (
                self._client.table("ticket_events")
                .select("*")
                .eq("ticket_id", str(ticket_id))
                .order("created_at", desc=False)
                .execute()
            )
        except Exception as exc:
            raise RepositoryError(str(exc)) from exc

        return [TicketAuditEvent.model_validate(row) for row in (res.data or [])]

    def list_tickets(self, filters: TicketFilter) -> tuple[list[Ticket], int]:
        query = self._client.table("tickets").select("*", count="exact")

        if filters.status is not None:
            query = query.eq("status", filters.status.value)
        if filters.priority is not None:
            query = query.eq("priority", filters.priority.value)
        if filters.category is not None:
            query = query.eq("category", filters.category.value)
        if filters.team_id is not None:
            query = query.eq("team_id", str(filters.team_id))
        if filters.requester_email is not None:
            query = query.eq("requester_email", str(filters.requester_email))
        if filters.created_from is not None:
            query = query.gte("created_at", filters.created_from.isoformat())
        if filters.created_to is not None:
            query = query.lte("created_at", filters.created_to.isoformat())
        if filters.search:
            escaped = filters.search.replace("%", r"\%").replace("_", r"\_")
            query = query.or_(f"title.ilike.%{escaped}%,description.ilike.%{escaped}%")

        range_start = filters.offset
        range_end = filters.offset + filters.limit - 1

        try:
            response = (
                query.order("created_at", desc=(filters.sort_order == "desc"))
                .range(range_start, range_end)
                .execute()
            )
        except Exception as exc:
            raise RepositoryError(str(exc)) from exc

        rows = response.data or []
        total_count = response.count if response.count is not None else len(rows)
        return [Ticket.model_validate(row) for row in rows], total_count

    def update_with_audit(
        self,
        ticket_id: UUID,
        payload: TicketUpdate,
        *,
        clear_team: bool = False,
        idempotency_key: str | None = None,
    ) -> Ticket:
        rpc_params = {
            "p_ticket_id": str(ticket_id),
            "p_status": payload.status.value if payload.status is not None else None,
            "p_team_id": str(payload.team_id) if payload.team_id is not None else None,
            "p_clear_team": clear_team,
            "p_resolution_notes": payload.resolution_notes,
            "p_actor": payload.actor or "agent@supportflow.local",
            "p_idempotency_key": idempotency_key,
        }

        try:
            result = self._client.rpc("update_ticket_with_audit", rpc_params).execute()
        except APIError as exc:
            err_msg = exc.message or str(exc)
            if "TICKET_NOT_FOUND" in err_msg or exc.code == "P0002":
                raise TicketNotFoundError(f"Ticket {ticket_id} not found.") from exc
            if "ILLEGAL_TRANSITION" in err_msg or exc.code in {"P0001", "22P02"}:
                raise IllegalTransitionError(err_msg.replace("ILLEGAL_TRANSITION: ", "")) from exc
            if exc.code == "23503":
                raise RepositoryValidationError("Referenced team_id does not exist.") from exc
            raise RepositoryError(err_msg) from exc
        except Exception as exc:
            raise RepositoryError(str(exc)) from exc

        row = result.data[0] if isinstance(result.data, list) else result.data
        if not row:
            raise TicketNotFoundError(f"Ticket {ticket_id} not found.")
        return Ticket.model_validate(row)