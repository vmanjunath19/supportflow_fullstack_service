# SupportFlow — PostgreSQL Relational Schema Specification

## 1. Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    support_teams ||--o{ tickets : "assigned_to"
    sla_policies ||--o{ tickets : "governs"
    tickets ||--o{ ticket_events : "logs_history"

    support_teams {
        uuid id PK
        varchar name UK
        varchar default_category
        varchar escalation_email
        boolean is_active
        timestamptz created_at
    }

    sla_policies {
        uuid id PK
        ticket_priority priority UK
        int response_time_mins
        int resolution_time_mins
        timestamptz created_at
    }

    tickets {
        uuid id PK
        varchar ticket_number UK
        varchar title
        text description
        ticket_category category
        ticket_priority priority
        ticket_status status
        uuid team_id FK
        uuid sla_policy_id FK
        varchar requester_email
        text resolution_notes
        timestamptz sla_due_at
        timestamptz resolved_at
        timestamptz created_at
        timestamptz updated_at
    }

    ticket_events {
        uuid id PK
        uuid ticket_id FK
        varchar actor
        varchar event_type
        varchar previous_state
        varchar new_state
        jsonb metadata
        varchar idempotency_key UK
        timestamptz created_at
    }