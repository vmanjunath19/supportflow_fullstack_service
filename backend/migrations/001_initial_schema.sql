-- defining ticket types
CREATE TYPE ticket_status AS ENUM (
    'New',
    'Triaged',
    'In Progress',
    'Blocked',
    'Resolved',
    'Closed'
);

CREATE TYPE ticket_priority AS ENUM (
    'Low',
    'Medium',
    'High',
    'Urgent'
);

CREATE TYPE ticket_category AS ENUM (
    'Hardware',
    'Software',
    'Network',
    'Access & IAM',
    'Database & Cloud',
    'Other'
);

--creating tables
-- 1. Support Teams (Tier 1, Tier 2, DevOps, Network, etc.)
CREATE TABLE support_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    default_category ticket_category,
    escalation_email VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. SLA Policies (Target response & resolution windows per priority)
CREATE TABLE sla_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    priority ticket_priority NOT NULL UNIQUE,
    response_time_mins INTEGER NOT NULL CHECK (response_time_mins > 0),
    resolution_time_mins INTEGER NOT NULL CHECK (resolution_time_mins > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Support Tickets (Core incident records)
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number SERIAL UNIQUE,
    title VARCHAR(200) NOT NULL CHECK (char_length(trim(title)) >= 5),
    description TEXT NOT NULL,
    category ticket_category NOT NULL DEFAULT 'Other',
    priority ticket_priority NOT NULL DEFAULT 'Medium',
    status ticket_status NOT NULL DEFAULT 'New',
    team_id UUID REFERENCES support_teams(id) ON DELETE SET NULL,
    sla_policy_id UUID REFERENCES sla_policies(id) ON DELETE RESTRICT,
    requester_email VARCHAR(255) NOT NULL,
    resolution_notes TEXT,
    sla_due_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Enforce resolution notes when moving to Resolved or Closed
    CONSTRAINT chk_resolution_notes CHECK (
        status NOT IN ('Resolved', 'Closed') OR (resolution_notes IS NOT NULL AND char_length(trim(resolution_notes)) > 0)
    )
);

-- 4. Ticket Events (Immutable audit log & webhook deduplication)
CREATE TABLE ticket_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    actor VARCHAR(150) NOT NULL,
    event_type VARCHAR(50) NOT NULL, -- e.g. 'CREATED', 'ROUTED', 'STATUS_CHANGE', 'SLA_ESCALATED'
    previous_state VARCHAR(100),
    new_state VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb,
    idempotency_key VARCHAR(255) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

--creating indexes
CREATE INDEX idx_tickets_status_priority ON tickets(status, priority);
CREATE INDEX idx_tickets_team_id ON tickets(team_id);
CREATE INDEX idx_tickets_sla_due_at ON tickets(sla_due_at) WHERE status NOT IN ('Resolved', 'Closed');
CREATE INDEX idx_tickets_created_at ON tickets(created_at DESC);
CREATE INDEX idx_ticket_events_ticket_id_created ON ticket_events(ticket_id, created_at ASC);
COMMIT;

--test to see if tables are created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;