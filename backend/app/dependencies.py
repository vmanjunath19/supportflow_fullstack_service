from app.repositories import SupabaseTicketRepository, TicketRepository
from app.routers.webhooks import get_supabase_admin


def get_ticket_repository() -> TicketRepository:
    return SupabaseTicketRepository(get_supabase_admin())