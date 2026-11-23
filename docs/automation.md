# SupportFlow Event-Driven Automation Architecture

SupportFlow decouples user-facing ticket submission from asynchronous backend processing. The React client interacts exclusively with Supabase Postgres for CRUD operations, while PostgreSQL database triggers (`pg_net`), FastAPI background workers, and `APScheduler` cron jobs orchestrate deterministic ticket routing, multi-channel notifications, SLA breach escalation, failure retries, and immutable audit logging.

---

## 1. High-Level System Architecture

```mermaid
flowchart LR
    subgraph Client["Frontend (React + TypeScript)"]
        UI[Ticket Workspace UI]
        Drawer[Ticket Detail Drawer<br/>?ticket=UUID Deep-Link]
    end

    subgraph Supabase["Supabase (PostgreSQL + pg_net)"]
        Tickets[(public.tickets)]
        Teams[(public.support_teams)]
        Events[(public.ticket_events<br/>Append-Only Audit Log)]
        DLQ[(public.webhook_dead_letters<br/>Retry Queue)]
        Trigger[[AFTER INSERT Trigger<br/>pg_net HTTP POST]]
    end

    subgraph FastAPI["Backend Automation Service (FastAPI)"]
        Webhook[POST /api/v1/webhooks/ticket-created]
        RouterEngine[Rule-Based Routing Engine]
        NotifWorker[Background Notification Worker]
        SLAWorker[APScheduler SLA Cron<br/>Every 60s]
        RetryWorker[APScheduler Retry/DLQ Cron<br/>Every 30s]
    end

    subgraph External["External Channels"]
        Slack[Slack Incoming Webhook]
        SMTP[Email / SMTP Alerting]
    end

    UI -->|1. Insert Ticket| Tickets
    Tickets -->|2. Fires Trigger| Trigger
    Trigger -->|3. Signed JSON Payload| Webhook
    Webhook --> RouterEngine
    RouterEngine -->|4. Load Active Teams| Teams
    RouterEngine -->|5. Assign team_id & Triaged| Tickets
    RouterEngine -->|6. Append AUTO_ROUTED &<br/>STATUS_TRANSITIONED| Events
    Webhook -->|7. Enqueue Background Task| NotifWorker

    NotifWorker -->|8a. Block Kit Alert| Slack
    NotifWorker -->|8b. HTML/Text Alert| SMTP
    NotifWorker -->|8c. Log NOTIFICATION_DISPATCHED| Events
    NotifWorker -.->|On Network/5xx Error| DLQ

    SLAWorker -->|Scan Open Tickets| Tickets
    SLAWorker -->|Escalate Overdue -> Urgent| Tickets
    SLAWorker -->|Log SLA_BREACHED / WARNING| Events

    RetryWorker -->|Poll Due Backoff Jobs| DLQ
    RetryWorker -->|Re-attempt Delivery| External
    RetryWorker -->|Log RETRY_SUCCEEDED /<br/>DEAD_LETTER_EXHAUSTED| Events

    Drawer -->|Read Timeline| Events
```

---

## 2. Ticket Creation, Routing & Notification Sequence

When a user submits a new ticket, PostgreSQL fires an `AFTER INSERT` trigger via `pg_net` to FastAPI. FastAPI verifies the HMAC webhook signature, enforces idempotency, evaluates category and impact rules, updates the ticket (`UPDATE` only—preventing trigger recursion), appends immutable audit records, and dispatches Slack and Email alerts in a non-blocking background task.

```mermaid
sequenceDiagram
    autonumber
    actor User as Requester / Agent
    participant UI as React Frontend
    participant DB as Supabase Postgres
    participant PGNet as pg_net Trigger
    participant API as FastAPI Webhook Router
    participant Engine as Routing Engine
    participant BG as Background Notification Worker
    participant Ext as Slack & Email

    User->>UI: Submit new ticket (Category, Priority, Summary)
    UI->>DB: INSERT INTO public.tickets (status='New', team_id=NULL)
    DB->>DB: Append WEBHOOK_DISPATCHED to ticket_events
    DB-->>PGNet: Fire AFTER INSERT trigger
    PGNet->>API: POST /api/v1/webhooks/ticket-created<br/>(X-Webhook-Secret, X-Webhook-Event-Id)

    API->>API: Verify HMAC signature & check event_id idempotency
    API->>DB: SELECT * FROM support_teams WHERE is_active = true
    DB-->>API: Active support teams & default_category mappings

    API->>Engine: evaluate_routing_rule(category, priority, teams)
    Engine-->>API: RoutingDecision (target_team, escalation_email, rule)

    API->>DB: UPDATE tickets SET team_id = target_team, status = 'Triaged'
    API->>DB: INSERT INTO ticket_events (AUTO_ROUTED)
    API->>DB: INSERT INTO ticket_events (STATUS_TRANSITIONED: New -> Triaged)
    API-->>PGNet: HTTP 200 OK (routed)

    API-)BG: Schedule dispatch_routing_notifications()
    par Multi-Channel Dispatch
        BG->>Ext: POST Slack Block Kit payload (with ?ticket=UUID link)
        BG->>Ext: Send SMTP HTML/Plain-Text alert
    end

    alt Delivery Succeeded
        BG->>DB: INSERT INTO ticket_events (NOTIFICATION_DISPATCHED)
    else Network Outage / HTTP 5xx
        BG->>DB: INSERT INTO webhook_dead_letters (status='pending_retry', next_retry_at=+30s)
        BG->>DB: INSERT INTO ticket_events (DISPATCH_QUEUED_FOR_RETRY)
    end
```

### Deterministic Routing Matrix

| `ticket_category` Enum | Priority Condition | Assigned Support Team | Escalation Applied |
| :--- | :--- | :--- | :--- |
| `Hardware` | Any | **IT Field Support** | No |
| `Software` | `Low` / `Medium` | **Application Support** | No |
| `Software` | `High` / `Urgent` | **Cloud & DevOps** | Yes (High-impact override) |
| `Network` | Any | **Network Operations** | No |
| `Access & IAM` | Any | **Identity & Security** | No |
| `Database & Cloud` | Any | **Cloud & DevOps** | No |
| `Other` / Unclassified | Any | **General Triage Desk** | Fallback |

---

## 3. Ticket Lifecycle & SLA State Machine

Tickets progress through deterministic lifecycle states driven by automated routing, agent resolution, and scheduled SLA enforcement. Terminal states (`Resolved`, `Closed`) are excluded from SLA escalation sweeps.

```mermaid
stateDiagram-v2
    [*] --> New : Ticket Created (UI / API)

    state "New (Unassigned)" as New
    state "Triaged (Team Assigned)" as Triaged
    state "In Progress" as InProgress
    state "SLA Near-Breach Warning" as NearBreach
    state "SLA Breached (Priority = Urgent)" as Breached
    state "Resolved" as Resolved
    state "Closed" as Closed

    New --> Triaged : AUTO_ROUTED & STATUS_TRANSITIONED\n(system:rule_routing_engine)
    Triaged --> InProgress : Agent claims ticket
    InProgress --> Triaged : Reassigned to another queue

    Triaged --> NearBreach : 0 < (sla_due_at - now) <= 30m\n[Logs SLA_WARNING_NEAR_BREACH]
    InProgress --> NearBreach : 0 < (sla_due_at - now) <= 30m\n[Logs SLA_WARNING_NEAR_BREACH]

    Triaged --> Breached : sla_due_at <= now\n[Escalates priority -> Urgent]
    InProgress --> Breached : sla_due_at <= now\n[Escalates priority -> Urgent]
    NearBreach --> Breached : sla_due_at <= now\n[Escalates priority -> Urgent]

    Triaged --> Resolved : Issue fixed
    InProgress --> Resolved : Issue fixed
    NearBreach --> Resolved : Issue fixed before breach
    Breached --> Resolved : Escalated issue fixed

    Resolved --> Closed : Confirmation / Auto-close
    Resolved --> InProgress : Ticket reopened
    Closed --> [*]
```

---

## 4. Scheduled SLA Breach Escalation & Retry Queue Sequence

Two `APScheduler` background jobs run inside the FastAPI application lifespan:
1. **SLA Breach Worker (`60s` interval):** Detects tickets approaching their `sla_due_at` deadline (`<= 30m`) or past due (`<= now`), escalates overdue tickets to `Urgent`, deduplicates alerts against `ticket_events`, and notifies on-call teams.
2. **Dead-Letter Retry Worker (`30s` interval):** Polls `webhook_dead_letters` for failed Slack/Email dispatches whose exponential backoff timer (`30s → 60s → 120s → 240s → 480s`) has elapsed.

```mermaid
sequenceDiagram
    autonumber
    participant Cron as APScheduler Lifespan Worker
    participant SLA as SLA Escalation Service
    participant Retry as Retry & DLQ Service
    participant DB as Supabase Postgres
    participant Notif as Notification Worker
    participant Ext as Slack / SMTP

    loop Every 60 Seconds (SLA Sweep)
        Cron->>SLA: run_sla_escalation_sweep()
        SLA->>DB: SELECT open tickets WHERE sla_due_at IS NOT NULL
        SLA->>DB: SELECT existing SLA_BREACHED / SLA_WARNING events

        alt Ticket Overdue (sla_due_at <= now) & Not Yet Escalated
            SLA->>DB: UPDATE tickets SET priority = 'Urgent'
            SLA->>DB: INSERT INTO ticket_events (SLA_BREACHED_ESCALATED)
            SLA->>Notif: Dispatch Urgent breach alert
        else Ticket Nearing Breach (<= 30 mins remaining) & Not Yet Warned
            SLA->>DB: INSERT INTO ticket_events (SLA_WARNING_NEAR_BREACH)
            SLA->>Notif: Dispatch near-breach warning alert
        end
    end

    loop Every 30 Seconds (Retry & Dead-Letter Sweep)
        Cron->>Retry: process_retry_queue()
        Retry->>DB: SELECT * FROM webhook_dead_letters<br/>WHERE status = 'pending_retry' AND next_retry_at <= now

        alt Retry Call Succeeds
            Retry->>Ext: Re-send Slack / Email payload
            Ext-->>Retry: 200 OK
            Retry->>DB: UPDATE webhook_dead_letters SET status = 'resolved'
            Retry->>DB: INSERT INTO ticket_events (RETRY_SUCCEEDED)
        else Retry Fails & attempt_count < max_attempts (5)
            Retry->>DB: UPDATE webhook_dead_letters<br/>SET attempt_count + 1, next_retry_at = now + (30s * 2^(attempt-1))
        else Retry Fails & attempt_count >= max_attempts (5)
            Retry->>DB: UPDATE webhook_dead_letters SET status = 'dead_lettered'
            Retry->>DB: INSERT INTO ticket_events (DEAD_LETTER_EXHAUSTED)
        end
    end
```

---

## 5. Immutable Audit Log Guarantee

Every automated state transition is persisted to `public.ticket_events` via `backend/app/services/audit.py`. A PostgreSQL `BEFORE UPDATE OR DELETE` trigger (`trg_ticket_events_immutable`) enforces strict append-only compliance at the database layer.

| Event Type | Automated Actor | Triggering Condition |
| :--- | :--- | :--- |
| `WEBHOOK_DISPATCHED` | `postgres:pg_net_trigger` | New ticket inserted into `public.tickets` |
| `AUTO_ROUTED` | `system:rule_routing_engine` | Ticket matched to a support team or fallback desk |
| `STATUS_TRANSITIONED` | `system:rule_routing_engine` | Automated status move (`New` → `Triaged`) |
| `NOTIFICATION_DISPATCHED` | `system:notification_worker` | Team alert sent (or dry-run logged) via Slack/Email |
| `SLA_WARNING_NEAR_BREACH` | `system:sla_escalation_worker` | Open ticket enters the 30-minute pre-breach window |
| `SLA_BREACHED_ESCALATED` | `system:sla_escalation_worker` | Overdue ticket automatically escalated to `Urgent` |
| `DISPATCH_QUEUED_FOR_RETRY` | `system:retry_dlq_worker` | Failed external call persisted to `webhook_dead_letters` |
| `RETRY_SUCCEEDED` | `system:retry_dlq_worker` | Previously failed dispatch recovered on backoff retry |
| `DEAD_LETTER_EXHAUSTED` | `system:retry_dlq_worker` | Dispatch reached `max_attempts` (5) and moved to `dead_lettered` |