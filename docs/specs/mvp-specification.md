# SupportFlow — MVP Scope, User Journeys & Ticket Life-Cycle Specification

## 1. User Personas & Journeys

### 1.1 Employee (End-User)
* **Goal:** Quickly report an IT issue, track its resolution status, and receive updates without needing to chase support staff.
* **Journey:**
  1. Logs into the self-service portal.
  2. Submits a new incident ticket with a title, detailed description, category, and perceived impact/urgency.
  3. Views a personal list of submitted tickets and their current life-cycle states.
  4. Adds follow-up comments or confirms resolution once fixed.

### 1.2 Support Engineer (Tier 1 / Tier 2 / DevOps / Network)
* **Goal:** View assigned queues, investigate incidents, transition ticket states cleanly, and document resolution notes.
* **Journey:**
  1. Opens the Engineer Workspace queue and filters tickets by status, priority, or assigned team.
  2. Inspects ticket metadata, automated triage tags, and historical audit events.
  3. Transitions the ticket from `Triaged` → `In Progress`, adds investigation notes, or re-routes the ticket to another specialist team.
  4. Marks the ticket `Resolved` with mandatory resolution notes once the issue is fixed.

### 1.3 Triage Manager / Admin
* **Goal:** Monitor SLA compliance, oversee automated routing accuracy, and handle escalated or blocked incidents.
* **Journey:**
  1. Reviews incoming unrouted tickets and high/urgent SLA queues.
  2. Overrides automated team assignments or priority levels when edge cases occur.
  3. Responds to automated SLA breach escalations and reallocates workload across support teams.

---

## 2. Ticket Life-Cycle States & Transition Rules

Every ticket follows a strict state machine enforced at both the API and PostgreSQL levels:

| State | Description | Allowed Next States |
| :--- | :--- | :--- |
| **`New`** | Ticket has just been created by an employee or seeded into the system. | `Triaged`, `Closed` (duplicate/invalid) |
| **`Triaged`** | Automated engine or manager has assigned priority, SLA target, and support team. | `In Progress`, `Blocked`, `Closed` |
| **`In Progress`** | An engineer is actively investigating or working on a fix. | `Blocked`, `Resolved` |
| **`Blocked`** | Work is paused pending user reply, vendor fix, or dependency. | `In Progress`, `Closed` |
| **`Resolved`** | Fix has been applied and documented; awaiting confirmation/auto-close window. | `Closed`, `In Progress` (reopened) |
| **`Closed`** | Terminal state. Ticket is archived and locked from further edits. | *None (Terminal State)* |

* **Illegal Transitions:** Direct jumps such as `New` → `Resolved` or reopening a `Closed` ticket (`Closed` → `New`) must be rejected with a descriptive validation error.

---

## 3. MVP Scope (Weeks 1–4 Target)

### In-Scope for MVP
* Relational PostgreSQL schema (`tickets`, `support_teams`, `ticket_events`, `sla_policies`) with seed data.
* Internal Engineer Workspace UI (React + TypeScript) with searchable/filterable ticket queue, creation modal, and detail drawer.
* Role-based UI view switching (`End-User`, `Support Engineer`, `Admin/Manager`).
* Automated event-driven ticket routing, SLA breach escalation worker, and immutable audit logging (`ticket_events`).
* Strict state-machine validation on status transitions.

### Out-of-Scope for MVP (Deferred to Weeks 5–12)
* Python FastAPI NLP/heuristic triage microservice (Week 5).
* Dedicated external Employee Self-Service Portal with Supabase Auth & Row-Level Security (Weeks 8–9).
* Docker Compose multi-container production bundle, GitHub Actions CI/CD, and Metabase BI dashboards (Weeks 10–11).

---

## 4. Testable User Stories & Acceptance Criteria

### US-01: Employee Ticket Submission
* **As an** Employee, **I want to** submit an IT support ticket with a title, description, category, impact, and urgency, **so that** my issue is logged and routed to the right team.
* **Acceptance Criteria:**
  * **Given** I am on the ticket creation form, **when** I submit valid inputs for all required fields, **then** a new ticket is created in `New` state with a unique ID and timestamp.
  * **Given** I leave the title blank or enter fewer than 5 characters, **when** I click submit, **then** the form blocks submission and displays an inline validation error.

### US-02: Engineer Queue Filtering & Search
* **As a** Support Engineer, **I want to** filter the ticket queue by status, priority, and keyword search, **so that** I can prioritize urgent incidents quickly.
* **Acceptance Criteria:**
  * **Given** the ticket queue contains 25+ seeded tickets, **when** I filter by `Priority = Urgent` and `Status = Triaged`, **then** only matching tickets are displayed within 500ms.
  * **Given** no tickets match my search query, **when** results update, **then** a clear empty-state message with a "Reset Filters" button is shown.

### US-03: Automated Rule-Based Ticket Routing
* **As a** Triage Manager, **I want** newly inserted tickets to be automatically classified and routed to the matching support team, **so that** engineers do not manually sort routine tickets.
* **Acceptance Criteria:**
  * **Given** a new ticket is inserted with category `Network` and `High` impact, **when** the database webhook fires, **then** the ticket's `team_id` is automatically updated to the `Network` team and its state transitions to `Triaged`.
  * **Given** a ticket has an unrecognized category, **when** routing executes, **then** it assigns to the `Tier 1` fallback team without failing.

### US-04: State-Machine Enforcement & Resolution Notes
* **As a** Support Engineer, **I want to** transition a ticket through valid workflow states and record resolution notes, **so that** ticket progress is accurate and auditable.
* **Acceptance Criteria:**
  * **Given** a ticket is in `In Progress`, **when** I enter resolution notes and click "Mark Resolved", **then** the status updates to `Resolved` and saves the notes.
  * **Given** a ticket is in `Closed` state, **when** any user or API attempts to change its status back to `New`, **then** the system rejects the transition with a validation error.

### US-05: Immutable Audit Trail Logging
* **As a** Triage Manager, **I want** every status change, team reassignment, and automated escalation recorded in an audit log, **so that** I can trace the full history of any incident.
* **Acceptance Criteria:**
  * **Given** a ticket's team is changed from `Tier 1` to `DevOps`, **when** the update commits, **then** a new row is inserted into `ticket_events` capturing `ticket_id`, `actor`, `previous_state`, `new_state`, and `created_at`.
  * **Given** an audit event is written, **when** querying `ticket_events`, **then** historical records are ordered chronologically and cannot be overwritten.

### US-06: Automated SLA Breach Escalation
* **As a** Triage Manager, **I want** overdue tickets to automatically escalate to `Urgent` priority and trigger an alert, **so that** critical incidents do not breach SLA unnoticed.
* **Acceptance Criteria:**
  * **Given** an open ticket has exceeded its `sla_policies` target resolution threshold, **when** the scheduled escalation worker runs, **then** its priority updates to `Urgent` and an escalation audit event is logged.
  * **Given** the worker runs twice within the same minute, **when** checking the already-escalated ticket, **then** idempotency checks prevent duplicate escalation alerts.

### US-07: Role-Based UI Access Control
* **As an** Admin/Manager, **I want** UI actions to adapt based on the active user role (`End-User`, `Support Engineer`, `Admin`), **so that** end-users cannot accidentally reassign teams or close other users' tickets.
* **Acceptance Criteria:**
  * **Given** the active role is set to `End-User`, **when** viewing a ticket drawer, **then** internal team re-routing dropdowns and SLA override controls are hidden.
  * **Given** the active role is switched to `Admin/Manager`, **when** viewing the same ticket, **then** all routing, escalation, and status transition controls are visible and enabled.