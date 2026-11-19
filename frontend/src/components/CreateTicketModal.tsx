import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, AlertCircle, Send, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  IMPACT_LEVELS,
  TICKET_CATEGORIES,
  URGENCY_LEVELS,
  calculateTicketPriority,
  createTicketSchema,
  type CreateTicketFormValues,
  type CreateTicketValidatedData,
} from '../lib/ticketSchema';
import { PriorityBadge } from './TicketBadges';

interface CreateTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTicketCreated: () => void;
}

export function CreateTicketModal({
  isOpen,
  onClose,
  onTicketCreated,
}: CreateTicketModalProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateTicketFormValues, unknown, CreateTicketValidatedData>({
    resolver: zodResolver(createTicketSchema),
    mode: 'onBlur',
    defaultValues: {
      title: '',
      description: '',
      category: 'Software',
      impact: 'Medium',
      urgency: 'Medium',
      requester_email: '',
    },
  });

  const selectedImpact = watch('impact') ?? 'Medium';
  const selectedUrgency = watch('urgency') ?? 'Medium';
  const derivedPriority = calculateTicketPriority(selectedImpact, selectedUrgency);

  // Close modal on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  async function onSubmit(values: CreateTicketValidatedData) {
    setSubmitError(null);

    try {
      const priority = calculateTicketPriority(values.impact, values.urgency);

      // 1. Fetch matching SLA Policy for calculated priority
      const { data: slaPolicy } = await supabase
        .from('sla_policies')
        .select('id, resolution_time_mins')
        .eq('priority', priority)
        .maybeSingle();

      const now = new Date();
      const slaDueAt = slaPolicy?.resolution_time_mins
        ? new Date(now.getTime() + slaPolicy.resolution_time_mins * 60_000).toISOString()
        : null;

      // 2. Insert new ticket into PostgreSQL
      const { data: createdTicket, error: insertError } = await supabase
        .from('tickets')
        .insert({
          title: values.title,
          description: values.description,
          category: values.category,
          priority,
          status: 'New',
          team_id: null,
          sla_policy_id: slaPolicy?.id ?? null,
          requester_email: values.requester_email,
          sla_due_at: slaDueAt,
        })
        .select('id')
        .single();

      if (insertError) {
        throw new Error(insertError.message);
      }

      // 3. Record initial immutable audit trail event
      if (createdTicket?.id) {
        await supabase.from('ticket_events').insert({
          ticket_id: createdTicket.id,
          actor: values.requester_email,
          event_type: 'CREATED',
          previous_state: null,
          new_state: 'New',
          metadata: {
            source: 'web_portal',
            impact: values.impact,
            urgency: values.urgency,
            calculated_priority: priority,
          },
          idempotency_key: `portal-create-${createdTicket.id}`,
        });
      }

      reset();
      onTicketCreated();
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'An unexpected error occurred while creating the ticket.'
      );
    }
  }

  function handleClose() {
    if (isSubmitting) return;
    setSubmitError(null);
    reset();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-ticket-modal-title"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-xl overflow-hidden my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div>
            <h2
              id="create-ticket-modal-title"
              className="text-base font-semibold text-slate-900"
            >
              Submit New Support Incident
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Provide issue details, business impact, and urgency to route your request.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="p-6 space-y-4">
          {submitError && (
            <div
              role="alert"
              className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-800 text-xs"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Unable to submit ticket</p>
                <p className="mt-0.5">{submitError}</p>
              </div>
            </div>
          )}

          {/* Requester Email */}
          <div>
            <label
              htmlFor="requester_email"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Requester Email <span className="text-rose-500">*</span>
            </label>
            <input
              id="requester_email"
              type="email"
              placeholder="you@company.com"
              aria-invalid={!!errors.requester_email}
              aria-describedby={errors.requester_email ? 'requester_email-error' : undefined}
              {...register('requester_email')}
              className={`w-full px-3 py-2 text-sm rounded-lg border bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors ${
                errors.requester_email
                  ? 'border-rose-400 focus:ring-rose-500/20 focus:border-rose-500'
                  : 'border-slate-300 focus:ring-indigo-500/20 focus:border-indigo-500'
              }`}
            />
            {errors.requester_email && (
              <p id="requester_email-error" className="mt-1 text-xs text-rose-600">
                {errors.requester_email.message}
              </p>
            )}
          </div>

          {/* Ticket Title */}
          <div>
            <label
              htmlFor="ticket-title"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Incident Title <span className="text-rose-500">*</span>
            </label>
            <input
              id="ticket-title"
              type="text"
              placeholder="e.g., Unable to connect to corporate VPN from macOS"
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? 'ticket-title-error' : undefined}
              {...register('title')}
              className={`w-full px-3 py-2 text-sm rounded-lg border bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors ${
                errors.title
                  ? 'border-rose-400 focus:ring-rose-500/20 focus:border-rose-500'
                  : 'border-slate-300 focus:ring-indigo-500/20 focus:border-indigo-500'
              }`}
            />
            {errors.title && (
              <p id="ticket-title-error" className="mt-1 text-xs text-rose-600">
                {errors.title.message}
              </p>
            )}
          </div>

          {/* Category */}
          <div>
            <label
              htmlFor="ticket-category"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Category <span className="text-rose-500">*</span>
            </label>
            <select
              id="ticket-category"
              aria-invalid={!!errors.category}
              aria-describedby={errors.category ? 'ticket-category-error' : undefined}
              {...register('category')}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
            >
              {TICKET_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            {errors.category && (
              <p id="ticket-category-error" className="mt-1 text-xs text-rose-600">
                {errors.category.message}
              </p>
            )}
          </div>

          {/* Impact & Urgency Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="ticket-impact"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Business Impact <span className="text-rose-500">*</span>
              </label>
              <select
                id="ticket-impact"
                aria-invalid={!!errors.impact}
                {...register('impact')}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
              >
                {IMPACT_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
              {errors.impact && (
                <p className="mt-1 text-xs text-rose-600">{errors.impact.message}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="ticket-urgency"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Urgency <span className="text-rose-500">*</span>
              </label>
              <select
                id="ticket-urgency"
                aria-invalid={!!errors.urgency}
                {...register('urgency')}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
              >
                {URGENCY_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
              {errors.urgency && (
                <p className="mt-1 text-xs text-rose-600">{errors.urgency.message}</p>
              )}
            </div>
          </div>

          {/* Live Calculated Priority Banner */}
          <div className="px-3.5 py-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <span>Calculated SLA Priority:</span>
            </div>
            <PriorityBadge priority={derivedPriority} />
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="ticket-description"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Description &amp; Error Details <span className="text-rose-500">*</span>
            </label>
            <textarea
              id="ticket-description"
              rows={4}
              placeholder="Include error messages, affected system/device, and when the issue started..."
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? 'ticket-description-error' : undefined}
              {...register('description')}
              className={`w-full px-3 py-2 text-sm rounded-lg border bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors ${
                errors.description
                  ? 'border-rose-400 focus:ring-rose-500/20 focus:border-rose-500'
                  : 'border-slate-300 focus:ring-indigo-500/20 focus:border-indigo-500'
              }`}
            />
            {errors.description && (
              <p id="ticket-description-error" className="mt-1 text-xs text-rose-600">
                {errors.description.message}
              </p>
            )}
          </div>

          {/* Modal Footer Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-60"
            >
              <Send className="w-4 h-4" />
              {isSubmitting ? 'Submitting...' : 'Submit Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}