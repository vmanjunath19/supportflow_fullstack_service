# SupportFlow Environment & Database Setup Guide

## 1. Repository Layout

```text
supportflow_fullstack_service/
├── backend/
│   ├── app/                  # FastAPI application, routers, and background workers
│   ├── test/                 # Pytest unit & integration test suites
│   └── .env.example          # Sanitized backend environment template
├── frontend/
│   └── .env.example          # Sanitized React/Vite environment template
├── supabase/
│   ├── schema.sql            # Full PostgreSQL DDL (tables, constraints, triggers)
│   └── seed.sql              # Deterministic teams, config, and demo tickets
└── docs/
    ├── automation.md         # Architecture & Mermaid sequence/state diagrams
    └── environment_setup.md  # Local and cloud setup instructions