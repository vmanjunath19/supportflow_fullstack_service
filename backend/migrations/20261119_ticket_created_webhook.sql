-- 1. Enable pg_net for asynchronous, non-blocking HTTP webhook calls from PostgreSQL
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Configuration table for webhook target URL & shared signing secret
CREATE TABLE IF NOT EXISTS public.webhook_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed local/staging FastAPI receiver endpoint (update URL for production deployment)
INSERT INTO public.webhook_config (key, value)
VALUES
  ('ticket_created_webhook_url', 'http://host.docker.internal:8000/api/v1/webhooks/ticket-created'),
  ('ticket_created_webhook_secret', 'sf_whsec_change_me_in_production')
ON CONFLICT (key) DO NOTHING;

-- Lock down webhook_config so anon/authenticated browser clients cannot read secrets
ALTER TABLE public.webhook_config ENABLE ROW LEVEL SECURITY;

-- 3. Prevent duplicate webhook dispatches for the same ticket
CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_events_single_webhook_dispatch
  ON public.ticket_events (ticket_id, event_type)
  WHERE event_type = 'WEBHOOK_DISPATCHED';

-- 4. AFTER INSERT trigger function
CREATE OR REPLACE FUNCTION public.fn_dispatch_ticket_created_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_webhook_url TEXT;
  v_webhook_secret TEXT;
  v_event_id UUID;
  v_payload JSONB;
BEGIN
  -- Guard: only run on INSERT
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- Idempotency lock: insert a single dispatch marker; exit immediately if already dispatched
  INSERT INTO public.ticket_events (
    ticket_id,
    actor,
    event_type,
    previous_state,
    new_state,
    metadata
  )
  VALUES (
    NEW.id,
    'system:pg_net_webhook',
    'WEBHOOK_DISPATCHED',
    NULL,
    'DISPATCHED',
    jsonb_build_object('trigger', TG_NAME, 'table', TG_TABLE_NAME)
  )
  ON CONFLICT (ticket_id, event_type) WHERE event_type = 'WEBHOOK_DISPATCHED'
  DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Fetch target URL & secret
  SELECT value INTO v_webhook_url
  FROM public.webhook_config
  WHERE key = 'ticket_created_webhook_url';

  SELECT value INTO v_webhook_secret
  FROM public.webhook_config
  WHERE key = 'ticket_created_webhook_secret';

  IF v_webhook_url IS NULL OR v_webhook_url = '' THEN
    RETURN NEW;
  END IF;

  -- Build deterministic webhook payload
  v_payload := jsonb_build_object(
    'event_id', v_event_id,
    'event_type', 'ticket.created',
    'occurred_at', NOW(),
    'record', jsonb_build_object(
      'id', NEW.id,
      'ticket_number', NEW.ticket_number,
      'title', NEW.title,
      'description', NEW.description,
      'category', NEW.category,
      'priority', NEW.priority,
      'status', NEW.status,
      'requester_email', NEW.requester_email,
      'team_id', NEW.team_id,
      'sla_due_at', NEW.sla_due_at,
      'created_at', NEW.created_at
    )
  );

  -- Dispatch async HTTP POST via pg_net (never blocks or rolls back ticket creation)
  PERFORM net.http_post(
    url := v_webhook_url,
    body := v_payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Webhook-Event', 'ticket.created',
      'X-Webhook-Event-Id', v_event_id::TEXT,
      'X-Webhook-Secret', COALESCE(v_webhook_secret, '')
    ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;

-- 5. Attach AFTER INSERT trigger to public.tickets
DROP TRIGGER IF EXISTS trg_tickets_after_insert_webhook ON public.tickets;

CREATE TRIGGER trg_tickets_after_insert_webhook
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_dispatch_ticket_created_webhook();