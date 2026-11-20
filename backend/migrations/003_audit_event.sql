-- 1. Ensure actor & created_at columns exist with safe defaults
ALTER TABLE public.ticket_events
  ADD COLUMN IF NOT EXISTS actor VARCHAR(120) NOT NULL DEFAULT 'system:unknown',
  ADD COLUMN IF NOT EXISTS previous_state VARCHAR(255),
  ADD COLUMN IF NOT EXISTS new_state VARCHAR(255),
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. Index for fast chronological audit timeline queries per ticket
CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket_id_created_at
  ON public.ticket_events (ticket_id, created_at ASC);

-- 3. Trigger function to block UPDATE and DELETE (true append-only immutability)
CREATE OR REPLACE FUNCTION public.fn_enforce_immutable_ticket_events()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ticket_events is an immutable append-only audit log (% is not permitted)', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_ticket_events_immutable ON public.ticket_events;

CREATE TRIGGER trg_ticket_events_immutable
  BEFORE UPDATE OR DELETE ON public.ticket_events
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enforce_immutable_ticket_events();