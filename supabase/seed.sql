-- =============================================================================
-- SupportFlow Seed Script — Routing Teams, Default Config & Demo Tickets
-- =============================================================================

-- 1. Seed the 6 Canonical Support Teams (1-to-1 with ticket_category)
INSERT INTO public.support_teams (id, name, default_category, escalation_email, slack_channel, is_active)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'IT Field Support',    'Hardware',         'field-support@supportflow.local', '#it-field-support', true),
  ('10000000-0000-0000-0000-000000000002', 'Application Support', 'Software',         'app-support@supportflow.local',   '#app-support',      true),
  ('10000000-0000-0000-0000-000000000003', 'Network Operations',  'Network',          'netops-oncall@supportflow.local', '#netops-alerts',    true),
  ('10000000-0000-0000-0000-000000000004', 'Identity & Security', 'Access & IAM',     'secops@supportflow.local',        '#iam-security',     true),
  ('10000000-0000-0000-0000-000000000005', 'Cloud & DevOps',      'Database & Cloud', 'devops-oncall@supportflow.local', '#cloud-devops',     true),
  ('10000000-0000-0000-0000-000000000006', 'General Triage Desk', 'Other',            'triage-desk@supportflow.local',   '#general-triage',   true)
ON CONFLICT (name) DO UPDATE SET
  default_category = EXCLUDED.default_category,
  escalation_email = EXCLUDED.escalation_email,
  slack_channel    = EXCLUDED.slack_channel,
  is_active        = EXCLUDED.is_active;

-- 2. Seed Sanitized Webhook Configuration Placeholders
--    Replace URL and secret to match your backend/.env values
INSERT INTO public.webhook_config (key, value)
VALUES
  ('ticket_created_webhook_url',    'http://host.docker.internal:8000/api/v1/webhooks/ticket-created'),
  ('ticket_created_webhook_secret', 'replace_with_strong_random_webhook_secret')
ON CONFLICT (key) DO NOTHING;

-- 3. Seed Representative Demo Tickets (Temporarily disable insert trigger during seed)
ALTER TABLE public.tickets DISABLE TRIGGER trg_ticket_created_webhook;

INSERT INTO public.tickets (
  id,
  ticket_number,
  title,
  description,
  category,
  priority,
  status,
  requester_email,
  team_id,
  sla_due_at,
  resolution_notes,
  created_at,
  updated_at
)
VALUES
  (
    '20000000-0000-0000-0000-000000000101',
    101,
    'Secondary office Wi-Fi controller intermittent drops',
    'Floor 2 access points disconnect every 15 minutes during peak load.',
    'Network',
    'High',
    'Triaged',
    'morgan.lee@company.com',
    '10000000-0000-0000-0000-000000000003',
    NOW() + INTERVAL '4 hours',
    NULL,
    NOW() - INTERVAL '30 minutes',
    NOW() - INTERVAL '25 minutes'
  ),
  (
    '20000000-0000-0000-0000-000000000102',
    102,
    'SSO SAML signing certificate expiring soon',
    'Production Okta SAML metadata certificate requires rotation before expiration.',
    'Access & IAM',
    'High',
    'In Progress',
    'priya.nair@company.com',
    '10000000-0000-0000-0000-000000000004',
    NOW() + INTERVAL '15 minutes',
    NULL,
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '40 minutes'
  ),
  (
    '20000000-0000-0000-0000-000000000103',
    103,
    'Read-replica replication lag spike on analytics cluster',
    'Replication lag exceeded 180 seconds; scheduled SLA worker will escalate to Urgent.',
    'Database & Cloud',
    'Medium',
    'Triaged',
    'david.chen@company.com',
    '10000000-0000-0000-0000-000000000005',
    NOW() - INTERVAL '10 minutes',
    NULL,
    NOW() - INTERVAL '3 hours',
    NOW() - INTERVAL '3 hours'
  ),
  (
    '20000000-0000-0000-0000-000000000104',
    104,
    'Replacement USB-C dock for engineering workstation',
    'Faulty Thunderbolt dock replaced at desk 4B.',
    'Hardware',
    'Low',
    'Closed',
    'claire.patel@company.com',
    '10000000-0000-0000-0000-000000000001',
    NULL,
    'Issued replacement Dell WD19TBS dock and confirmed dual-monitor output.',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '1 day'
  )
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.tickets ENABLE TRIGGER trg_ticket_created_webhook;

-- Sync identity sequence past seeded ticket_number values
SELECT setval(
  pg_get_serial_sequence('public.tickets', 'ticket_number'),
  COALESCE((SELECT MAX(ticket_number) FROM public.tickets), 100)
);

-- 4. Seed Initial Audit Log Entries for Seeded Tickets
INSERT INTO public.ticket_events (ticket_id, actor, event_type, previous_state, new_state, metadata)
VALUES
  (
    '20000000-0000-0000-0000-000000000101',
    'system:rule_routing_engine',
    'AUTO_ROUTED',
    'Unassigned',
    'Network Operations',
    '{"matched_rule": "db_default_category:network", "seeded": true}'::jsonb
  ),
  (
    '20000000-0000-0000-0000-000000000104',
    'agent:seed_setup',
    'STATUS_TRANSITIONED',
    'Resolved',
    'Closed',
    '{"seeded": true}'::jsonb
  );