-- Migration: 002_seed_data.sql
-- Description: Seed support_teams, sla_policies, 26 realistic IT tickets, and initial ticket_events

BEGIN;

-- 1. Seed Support Teams
INSERT INTO support_teams (id, name, default_category, escalation_email, is_active) VALUES
    ('11111111-1111-1111-1111-111111111101', 'Tier 1 Helpdesk',      'Other',            'tier1-escalations@supportflow.local',   TRUE),
    ('11111111-1111-1111-1111-111111111102', 'Desktop & Hardware',   'Hardware',         'hardware-escalations@supportflow.local', TRUE),
    ('11111111-1111-1111-1111-111111111103', 'Network Operations',   'Network',          'netops-escalations@supportflow.local',  TRUE),
    ('11111111-1111-1111-1111-111111111104', 'Identity & Access',    'Access & IAM',     'iam-escalations@supportflow.local',     TRUE),
    ('11111111-1111-1111-1111-111111111105', 'Cloud & DevOps',       'Database & Cloud', 'devops-escalations@supportflow.local',  TRUE)
ON CONFLICT (name) DO NOTHING;

-- 2. Seed SLA Policies
INSERT INTO sla_policies (id, priority, response_time_mins, resolution_time_mins) VALUES
    ('22222222-2222-2222-2222-222222222201', 'Urgent', 15,   120),   -- 15m response, 2h resolution
    ('22222222-2222-2222-2222-222222222202', 'High',   60,   480),   -- 1h response, 8h resolution
    ('22222222-2222-2222-2222-222222222203', 'Medium', 240,  1440),  -- 4h response, 24h resolution
    ('22222222-2222-2222-2222-222222222204', 'Low',    480,  4320)   -- 8h response, 72h resolution
ON CONFLICT (priority) DO NOTHING;

-- 3. Seed 26 Realistic IT Support Tickets (across all states, priorities & SLA states)
INSERT INTO tickets (
    id, title, description, category, priority, status, team_id, sla_policy_id,
    requester_email, resolution_notes, sla_due_at, resolved_at, created_at, updated_at
) VALUES
    -- NEW TICKETS (Unrouted / awaiting triage)
    (
        '33333333-3333-3333-3333-333333333301',
        'VPN drops every 10 minutes on macOS Sequoia',
        'GlobalProtect client disconnects repeatedly when switching between home Wi-Fi and mobile hotspot.',
        'Network', 'High', 'New', NULL, '22222222-2222-2222-2222-222222222202',
        'sarah.jenkins@company.com', NULL, NOW() + INTERVAL '7 hours', NULL, NOW() - INTERVAL '25 minutes', NOW() - INTERVAL '25 minutes'
    ),
    (
        '33333333-3333-3333-3333-333333333302',
        'Requesting Figma Pro license for Q4 product sprint',
        'Need editor seat assigned to my Okta profile ahead of Monday design review.',
        'Software', 'Low', 'New', NULL, '22222222-2222-2222-2222-222222222204',
        'david.chen@company.com', NULL, NOW() + INTERVAL '71 hours', NULL, NOW() - INTERVAL '40 minutes', NOW() - INTERVAL '40 minutes'
    ),
    (
        '33333333-3333-3333-3333-333333333303',
        'Production analytics read-replica throwing connection timeouts',
        'BI dashboards timing out with FATAL: remaining connection slots are reserved for superuser.',
        'Database & Cloud', 'Urgent', 'New', NULL, '22222222-2222-2222-2222-222222222201',
        'priya.patel@company.com', NULL, NOW() + INTERVAL '1 hour 50 minutes', NULL, NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '10 minutes'
    ),
    (
        '33333333-3333-3333-3333-333333333304',
        'USB-C docking station not detecting dual Dell 4K monitors',
        'Laptop charges through the dock, but both external displays stay black.',
        'Hardware', 'Medium', 'New', NULL, '22222222-2222-2222-2222-222222222203',
        'marcus.vance@company.com', NULL, NOW() + INTERVAL '22 hours', NULL, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours'
    ),

    -- TRIAGED TICKETS (Assigned to teams, waiting for engineer pickup)
    (
        '33333333-3333-3333-3333-333333333305',
        'Okta MFA push notifications delayed by 5+ minutes',
        'Multiple finance team members unable to approve login prompts before session expiry.',
        'Access & IAM', 'High', 'Triaged', '11111111-1111-1111-1111-111111111104', '22222222-2222-2222-2222-222222222202',
        'claire.bennett@company.com', NULL, NOW() + INTERVAL '5 hours', NULL, NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours 50 minutes'
    ),
    (
        '33333333-3333-3333-3333-333333333306',
        'Packet loss on 3rd floor East Wing Wi-Fi access points',
        'Zoom audio freezing and 18% ping loss on corporate SSID near conference room B.',
        'Network', 'Urgent', 'Triaged', '11111111-1111-1111-1111-111111111103', '22222222-2222-2222-2222-222222222201',
        'liam.oconnor@company.com', NULL, NOW() - INTERVAL '35 minutes', NULL, NOW() - INTERVAL '2 hours 35 minutes', NOW() - INTERVAL '2 hours 30 minutes' -- OVERDUE SLA
    ),
    (
        '33333333-3333-3333-3333-333333333307',
        'New starter laptop provisioning for Monday onboarding',
        'MacBook Pro 14-inch M3 setup with standard engineering software bundle.',
        'Hardware', 'Medium', 'Triaged', '11111111-1111-1111-1111-111111111102', '22222222-2222-2222-2222-222222222203',
        'hr-onboarding@company.com', NULL, NOW() + INTERVAL '18 hours', NULL, NOW() - INTERVAL '6 hours', NOW() - INTERVAL '5 hours 45 minutes'
    ),
    (
        '33333333-3333-3333-3333-333333333308',
        'GitHub Actions runner failing Docker image push to ECR',
        'CI pipeline throws denied: requested access to the resource is denied on main branch.',
        'Database & Cloud', 'High', 'Triaged', '11111111-1111-1111-1111-111111111105', '22222222-2222-2222-2222-222222222202',
        'alex.rivera@company.com', NULL, NOW() + INTERVAL '4 hours', NULL, NOW() - INTERVAL '4 hours', NOW() - INTERVAL '3 hours 50 minutes'
    ),
    (
        '33333333-3333-3333-3333-333333333309',
        'Slack desktop client crashing on screen share',
        'App freezes immediately when clicking Share Screen on Windows 11 24H2.',
        'Software', 'Medium', 'Triaged', '11111111-1111-1111-1111-111111111101', '22222222-2222-2222-2222-222222222203',
        'hannah.brooks@company.com', NULL, NOW() + INTERVAL '19 hours', NULL, NOW() - INTERVAL '5 hours', NOW() - INTERVAL '4 hours 30 minutes'
    ),

    -- IN PROGRESS TICKETS (Actively being worked)
    (
        '33333333-3333-3333-3333-333333333310',
        'AWS S3 bucket policy blocking staging invoice uploads',
        'Backend service receiving 403 AccessDenied after yesterday Terraform IAM cleanup.',
        'Database & Cloud', 'Urgent', 'In Progress', '11111111-1111-1111-1111-111111111105', '22222222-2222-2222-2222-222222222201',
        'omar.farooq@company.com', NULL, NOW() + INTERVAL '45 minutes', NULL, NOW() - INTERVAL '1 hour 15 minutes', NOW() - INTERVAL '30 minutes'
    ),
    (
        '33333333-3333-3333-3333-333333333311',
        'Service account password rotation broke nightly ETL sync',
        'Authentication failed for svc_warehouse_etl against PostgreSQL reporting cluster.',
        'Access & IAM', 'High', 'In Progress', '11111111-1111-1111-1111-111111111104', '22222222-2222-2222-2222-222222222202',
        'elena.rostova@company.com', NULL, NOW() - INTERVAL '1 hour', NULL, NOW() - INTERVAL '9 hours', NOW() - INTERVAL '1 hour' -- OVERDUE SLA
    ),
    (
        '33333333-3333-3333-3333-333333333312',
        'MacBook Pro battery swelling - trackpad difficult to click',
        'Bottom case slightly raised; need loaner laptop and battery replacement.',
        'Hardware', 'High', 'In Progress', '11111111-1111-1111-1111-111111111102', '22222222-2222-2222-2222-222222222202',
        'tom.holland@company.com', NULL, NOW() + INTERVAL '3 hours', NULL, NOW() - INTERVAL '5 hours', NOW() - INTERVAL '2 hours'
    ),
    (
        '33333333-3333-3333-3333-333333333313',
        'Site-to-site IPsec tunnel flapping between London and Frankfurt',
        'BGP peer resets every 45 minutes causing brief ERP latency spikes.',
        'Network', 'High', 'In Progress', '11111111-1111-1111-1111-111111111103', '22222222-2222-2222-2222-222222222202',
        'lukas.weber@company.com', NULL, NOW() + INTERVAL '2 hours', NULL, NOW() - INTERVAL '6 hours', NOW() - INTERVAL '1 hour 15 minutes'
    ),
    (
        '33333333-3333-3333-3333-333333333314',
        'Adobe Creative Cloud stuck on licensing verification loop',
        'Signed out and back in twice; app still prompts to start 7-day trial.',
        'Software', 'Low', 'In Progress', '11111111-1111-1111-1111-111111111101', '22222222-2222-2222-2222-222222222204',
        'sophie.turner@company.com', NULL, NOW() + INTERVAL '48 hours', NULL, NOW() - INTERVAL '24 hours', NOW() - INTERVAL '4 hours'
    ),

    -- BLOCKED TICKETS (Waiting on vendor / user / external dependency)
    (
        '33333333-3333-3333-3333-333333333315',
        'Replacement Dell UltraSharp monitor RMA pending courier pickup',
        'Dead vertical pixel line confirmed; waiting on Dell warranty dispatch confirmation.',
        'Hardware', 'Low', 'Blocked', '11111111-1111-1111-1111-111111111102', '22222222-2222-2222-2222-222222222204',
        'rachel.green@company.com', NULL, NOW() + INTERVAL '20 hours', NULL, NOW() - INTERVAL '52 hours', NOW() - INTERVAL '12 hours'
    ),
    (
        '33333333-3333-3333-3333-333333333316',
        'SSO SAML metadata certificate update with external payroll vendor',
        'Uploaded new public cert; awaiting vendor support engineer to activate on their side.',
        'Access & IAM', 'Medium', 'Blocked', '11111111-1111-1111-1111-111111111104', '22222222-2222-2222-2222-222222222203',
        'payroll-ops@company.com', NULL, NOW() - INTERVAL '3 hours', NULL, NOW() - INTERVAL '27 hours', NOW() - INTERVAL '6 hours' -- OVERDUE SLA
    ),
    (
        '33333333-3333-3333-3333-333333333317',
        'ISP fiber circuit upgrade at Edinburgh branch office',
        'Router staged; blocked awaiting Openreach engineer site visit.',
        'Network', 'Medium', 'Blocked', '11111111-1111-1111-1111-111111111103', '22222222-2222-2222-2222-222222222203',
        'facilities-uk@company.com', NULL, NOW() + INTERVAL '10 hours', NULL, NOW() - INTERVAL '14 hours', NOW() - INTERVAL '5 hours'
    ),

    -- RESOLVED TICKETS (Fixed with mandatory resolution_notes and resolved_at)
    (
        '33333333-3333-3333-3333-333333333318',
        'Unable to access Jira board after department transfer',
        'Moved from Sales to Product Operations; missing jira-product-users group.',
        'Access & IAM', 'Medium', 'Resolved', '11111111-1111-1111-1111-111111111104', '22222222-2222-2222-2222-222222222203',
        'nina.sharma@company.com',
        'Added user to Okta group jira-product-users and triggered SCIM sync. Verified board access.',
        NOW() + INTERVAL '12 hours', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '12 hours', NOW() - INTERVAL '1 hour'
    ),
    (
        '33333333-3333-3333-3333-333333333319',
        'PostgreSQL staging disk usage reached 92% alert threshold',
        'Automated CloudWatch alarm fired for rds-staging-core.',
        'Database & Cloud', 'High', 'Resolved', '11111111-1111-1111-1111-111111111105', '22222222-2222-2222-2222-222222222202',
        'monitoring@company.com',
        'Purged 48GB of stale logical replication WAL logs and expanded gp3 storage volume by 100GB.',
        NOW() + INTERVAL '2 hours', NOW() - INTERVAL '45 minutes', NOW() - INTERVAL '6 hours', NOW() - INTERVAL '45 minutes'
    ),
    (
        '33333333-3333-3333-3333-333333333320',
        'Conference room Owl camera microphone not recognized',
        'Meeting room 4A audio device missing from macOS sound input list.',
        'Hardware', 'Medium', 'Resolved', '11111111-1111-1111-1111-111111111102', '22222222-2222-2222-2222-222222222203',
        'james.wilson@company.com',
        'Replaced faulty USB-B to USB-C uplink cable and updated Meeting Owl firmware to v6.2.',
        NOW() + INTERVAL '16 hours', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '8 hours', NOW() - INTERVAL '2 hours'
    ),
    (
        '33333333-3333-3333-3333-333333333321',
        'Outlook calendar invites bouncing for external domain partners',
        'External recipients receiving 550 5.7.1 relay access denied.',
        'Other', 'High', 'Resolved', '11111111-1111-1111-1111-111111111101', '22222222-2222-2222-2222-222222222202',
        'victoria.hall@company.com',
        'Updated Exchange outbound connector SPF/DKIM routing rule and verified test delivery.',
        NOW() + INTERVAL '3 hours', NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '5 hours', NOW() - INTERVAL '30 minutes'
    ),

    -- CLOSED TICKETS (Terminal historical archive)
    (
        '33333333-3333-3333-3333-333333333322',
        'Password reset and YubiKey re-enrollment after lost security key',
        'Lost primary hardware key during commute; backup key at home.',
        'Access & IAM', 'Urgent', 'Closed', '11111111-1111-1111-1111-111111111104', '22222222-2222-2222-2222-222222222201',
        'benjamin.clark@company.com',
        'Verified identity via manager video call, revoked lost serial key, and enrolled replacement YubiKey 5C.',
        NOW() - INTERVAL '46 hours', NOW() - INTERVAL '47 hours', NOW() - INTERVAL '48 hours', NOW() - INTERVAL '45 hours'
    ),
    (
        '33333333-3333-3333-3333-333333333323',
        'Install Python 3.12 and Docker Desktop on workstation',
        'Needed for local microservice testing.',
        'Software', 'Low', 'Closed', '11111111-1111-1111-1111-111111111101', '22222222-2222-2222-2222-222222222204',
        'kevin.nguyen@company.com',
        'Deployed approved packages via Jamf Self Service and confirmed Docker daemon startup.',
        NOW() - INTERVAL '24 hours', NOW() - INTERVAL '70 hours', NOW() - INTERVAL '72 hours', NOW() - INTERVAL '68 hours'
    ),
    (
        '33333333-3333-3333-3333-333333333324',
        'DNS resolution failing for internal wiki.company.local',
        'Browser returns NXDOMAIN when connected over split-tunnel VPN.',
        'Network', 'High', 'Closed', '11111111-1111-1111-1111-111111111103', '22222222-2222-2222-2222-222222222202',
        'amara.okafor@company.com',
        'Added company.local search domain suffix to split-DNS push profile on VPN gateway.',
        NOW() - INTERVAL '30 hours', NOW() - INTERVAL '35 hours', NOW() - INTERVAL '38 hours', NOW() - INTERVAL '34 hours'
    ),
    (
        '33333333-3333-3333-3333-333333333325',
        'Kubernetes staging ingress returning 502 Bad Gateway',
        'NGINX ingress controller pods crash-looping after TLS secret rotation.',
        'Database & Cloud', 'Urgent', 'Closed', '11111111-1111-1111-1111-111111111105', '22222222-2222-2222-2222-222222222201',
        'daniel.kim@company.com',
        'Fixed malformed intermediate chain in wildcard TLS secret and rolled out ingress deployment.',
        NOW() - INTERVAL '50 hours', NOW() - INTERVAL '51 hours', NOW() - INTERVAL '52 hours', NOW() - INTERVAL '50 hours'
    ),
    (
        '33333333-3333-3333-3333-333333333326',
        'Request ergonomic vertical mouse for wrist strain',
        'Manager approved workplace ergonomics equipment request.',
        'Hardware', 'Low', 'Closed', '11111111-1111-1111-1111-111111111102', '22222222-2222-2222-2222-222222222204',
        'laura.adams@company.com',
        'Issued Logitech MX Vertical from IT stockroom and logged asset tag #HW-8841.',
        NOW() - INTERVAL '96 hours', NOW() - INTERVAL '140 hours', NOW() - INTERVAL '144 hours', NOW() - INTERVAL '138 hours'
    )
ON CONFLICT (id) DO NOTHING;

-- 4. Seed Initial Audit Log Events (ticket_events)
INSERT INTO ticket_events (ticket_id, actor, event_type, previous_state, new_state, metadata, idempotency_key, created_at) VALUES
    ('33333333-3333-3333-3333-333333333301', 'sarah.jenkins@company.com', 'CREATED', NULL, 'New', '{"source": "portal"}'::jsonb, 'seed-evt-01', NOW() - INTERVAL '25 minutes'),
    ('33333333-3333-3333-3333-333333333303', 'priya.patel@company.com',   'CREATED', NULL, 'New', '{"source": "portal"}'::jsonb, 'seed-evt-03', NOW() - INTERVAL '10 minutes'),
    ('33333333-3333-3333-3333-333333333306', 'liam.oconnor@company.com',  'CREATED', NULL, 'New', '{"source": "portal"}'::jsonb, 'seed-evt-06a', NOW() - INTERVAL '2 hours 35 minutes'),
    ('33333333-3333-3333-3333-333333333306', 'system:triage-router',      'ROUTED',  'New', 'Triaged', '{"assigned_team": "Network Operations", "rule": "category_match"}'::jsonb, 'seed-evt-06b', NOW() - INTERVAL '2 hours 30 minutes'),
    ('33333333-3333-3333-3333-333333333310', 'omar.farooq@company.com',   'CREATED', NULL, 'New', '{"source": "portal"}'::jsonb, 'seed-evt-10a', NOW() - INTERVAL '1 hour 15 minutes'),
    ('33333333-3333-3333-3333-333333333310', 'system:triage-router',      'ROUTED',  'New', 'Triaged', '{"assigned_team": "Cloud & DevOps"}'::jsonb, 'seed-evt-10b', NOW() - INTERVAL '1 hour 10 minutes'),
    ('33333333-3333-3333-3333-333333333310', 'devops.lead@company.com',   'STATUS_CHANGE', 'Triaged', 'In Progress', '{"note": "Inspecting Terraform IAM diff"}'::jsonb, 'seed-evt-10c', NOW() - INTERVAL '30 minutes'),
    ('33333333-3333-3333-3333-333333333318', 'nina.sharma@company.com',   'CREATED', NULL, 'New', '{"source": "portal"}'::jsonb, 'seed-evt-18a', NOW() - INTERVAL '12 hours'),
    ('33333333-3333-3333-3333-333333333318', 'iam.engineer@company.com',  'STATUS_CHANGE', 'In Progress', 'Resolved', '{"resolution": "SCIM group synced"}'::jsonb, 'seed-evt-18b', NOW() - INTERVAL '1 hour'),
    ('33333333-3333-3333-3333-333333333322', 'benjamin.clark@company.com','CREATED', NULL, 'New', '{"source": "portal"}'::jsonb, 'seed-evt-22a', NOW() - INTERVAL '48 hours'),
    ('33333333-3333-3333-3333-333333333322', 'iam.engineer@company.com',  'STATUS_CHANGE', 'Resolved', 'Closed', '{"auto_closed": false}'::jsonb, 'seed-evt-22b', NOW() - INTERVAL '45 hours')
ON CONFLICT (idempotency_key) DO NOTHING;

COMMIT;