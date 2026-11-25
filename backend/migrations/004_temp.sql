CREATE OR REPLACE FUNCTION public.create_ticket_with_audit(
    p_title TEXT,
    p_description TEXT,
    p_requester_email TEXT,
    p_category TEXT DEFAULT 'Other',
    p_priority TEXT DEFAULT 'Medium',
    p_team_id UUID DEFAULT NULL
)
RETURNS public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ticket public.tickets;
    v_sla_hours INT;
    v_sla_policy_id UUID;
    v_priority public.ticket_priority;
    v_category public.ticket_category;
BEGIN
    v_priority := COALESCE(p_priority, 'Medium')::public.ticket_priority;
    v_category := COALESCE(p_category, 'Other')::public.ticket_category;

    v_sla_hours := CASE v_priority
        WHEN 'Urgent' THEN 1
        WHEN 'High'   THEN 4
        WHEN 'Medium' THEN 24
        ELSE 72
    END;

    IF to_regclass('public.sla_policies') IS NOT NULL THEN
        SELECT id INTO v_sla_policy_id
        FROM public.sla_policies
        WHERE priority = v_priority
        LIMIT 1;
    END IF;

    INSERT INTO public.tickets (
        title,
        description,
        requester_email,
        category,
        priority,
        status,
        team_id,
        sla_policy_id,
        sla_due_at
    )
    VALUES (
        TRIM(p_title),
        TRIM(p_description),
        LOWER(TRIM(p_requester_email)),
        v_category,
        v_priority,
        'New'::public.ticket_status,
        p_team_id,
        v_sla_policy_id,
        NOW() + make_interval(hours => v_sla_hours)
    )
    RETURNING * INTO v_ticket;

    INSERT INTO public.ticket_events (
        ticket_id,
        actor,
        event_type,
        previous_state,
        new_state,
        metadata,
        idempotency_key
    )
    VALUES (
        v_ticket.id,
        LEFT(LOWER(TRIM(p_requester_email)), 150),
        'ticket_created',
        NULL,
        v_ticket.status::text,
        jsonb_build_object('source', 'api', 'priority', v_ticket.priority, 'category', v_ticket.category),
        'create:' || v_ticket.id::text
    );

    RETURN v_ticket;
END;
$$;