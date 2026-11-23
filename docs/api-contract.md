# SupportFlow Incident Automation API Contract

* **Base URL (Local):** `http://127.0.0.1:8000`
* **OpenAPI 3.1 Specification:** [`docs/openapi.json`](./openapi.json)
* **Interactive Swagger UI:** `GET /docs`
* **ReDoc Reference:** `GET /redoc`

---

## Global Headers & Observability

| Header | Direction | Required | Description |
| :--- | :--- | :--- | :--- |
| `Content-Type` | Request | Yes (`POST`) | Must be `application/json`. |
| `X-Correlation-ID` | Request / Response | Optional | Client-supplied trace ID (UUID or string). If omitted, the server generates a UUIDv4 and returns it in `X-Correlation-ID`. |
| `X-Webhook-Secret` | Request | Yes (Webhooks) | Shared HMAC/secret token matching `WEBHOOK_SECRET` for Supabase webhook endpoints. |
| `X-Webhook-Event-ID` | Request | Optional | Idempotency key for webhook deduplication (falls back to `payload.event_id`). |

---

## Domain Enums & SLA Matrix

### Valid Categories (`TicketCategory`)
`Hardware` | `Software` | `Network` | `Access & IAM` | `Database & Cloud` | `Other`

### Valid Priorities (`TicketPriority`) & SLA Targets
| Priority | Response SLA | Resolution SLA |
| :--- | :--- | :--- |
| `Urgent` | `15 minutes` | `1 hour` |
| `High` | `30 minutes` | `4 hours` |
| `Medium` | `2 hours` | `24 hours` |
| `Low` | `8 hours` | `72 hours` |

### Ticket Lifecycle States (`TicketStatus`)
`New` → `Triaged` → `In Progress` → `Resolved` → `Closed`  
*(Note: `Resolved` → `In Progress` reopen transitions are permitted; `Closed` is terminal.)*

---

## Endpoints

### 1. Health & Scheduler Status
`GET /health`

Verifies API availability and confirms the APScheduler background workers (SLA breach sweep and webhook dead-letter retry queue) are running.

#### `curl` Example
```bash
curl -i -X GET "[http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)" \
  -H "X-Correlation-ID: health-check-001"