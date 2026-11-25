import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, CheckCircle2, Loader2, Send, Sparkles } from 'lucide-react';
import {
  IMPACT_LEVELS,
  TICKET_CATEGORIES,
  URGENCY_LEVELS,
  calculateTicketPriority,
  createTicketSchema,
  type CreateTicketFormValues,
  type CreateTicketValidatedData,
} from '../../lib/ticketSchema';
import { PriorityBadge } from '../../components/TicketBadges';
import type { Ticket } from '../../types/database';

export function SubmitTicketPage() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdTicket, setCreatedTicket] = useState<Ticket | null>(null);

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

  async function onSubmit(values: CreateTicketValidatedData) {
    setSubmitError(null);

    try {
      const priority = calculateTicketPriority(values.impact, values.urgency);

      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: values.title,
          description: values.description,
          category: values.category,
          priority,
          impact: values.impact,
          urgency: values.urgency,
          requester_email: values.requester_email,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof data.detail === 'string'
            ? data.detail
            : 'Validation failed. Please check all required fields.'
        );
      }

      setCreatedTicket(data as Ticket);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Unable to submit support request.'
      );
    }
  }

  if (createdTicket) {
    const formattedId = `INC-${String(createdTicket.ticket_number).padStart(4, '0')}`;
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-emerald-200 bg-white p-8 shadow-sm text-center space-y-4">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <h1 className="text-2xl font-bold text-slate-900">{formattedId} Submitted</h1>
        <p className="text-sm text-slate-600">
          Your request <span className="font-medium text-slate-900">{createdTicket.title}</span> has
          been logged with <PriorityBadge priority={createdTicket.priority} /> priority.
        </p>
        <div className="pt-2 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() =>
              navigate(`/tickets?email=${encodeURIComponent(createdTicket.requester_email)}`)
            }
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 cursor-pointer"
          >
            Track My Tickets
          </button>
          <button
            type="button"
            onClick={() => {
              setCreatedTicket(null);
              reset();
            }}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Submit Another Request
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Submit a Support Request</h1>
        <p className="mt-1 text-sm text-slate-600">
          Provide issue details, business impact, and urgency to automatically calculate your SLA target.
        </p>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      >
        {submitError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700"
          >
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        <div>
          <label htmlFor="portal-email" className="block text-sm font-medium text-slate-700">
            Your Email <span className="text-rose-500">*</span>
          </label>
          <input
            id="portal-email"
            type="email"
            placeholder="you@company.com"
            {...register('requester_email')}
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          {errors.requester_email && (
            <p className="mt-1 text-xs text-rose-600">{errors.requester_email.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="portal-title" className="block text-sm font-medium text-slate-700">
            Subject <span className="text-rose-500">*</span>
          </label>
          <input
            id="portal-title"
            type="text"
            placeholder="e.g., Cannot access billing invoices"
            {...register('title')}
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          {errors.title && (
            <p className="mt-1 text-xs text-rose-600">{errors.title.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="portal-category" className="block text-sm font-medium text-slate-700">
            Category <span className="text-rose-500">*</span>
          </label>
          <select
            id="portal-category"
            {...register('category')}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            {TICKET_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="portal-impact" className="block text-sm font-medium text-slate-700">
              Business Impact <span className="text-rose-500">*</span>
            </label>
            <select
              id="portal-impact"
              {...register('impact')}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              {IMPACT_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="portal-urgency" className="block text-sm font-medium text-slate-700">
              Urgency <span className="text-rose-500">*</span>
            </label>
            <select
              id="portal-urgency"
              {...register('urgency')}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              {URGENCY_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            <span>Calculated SLA Priority:</span>
          </div>
          <PriorityBadge priority={derivedPriority} />
        </div>

        <div>
          <label htmlFor="portal-description" className="block text-sm font-medium text-slate-700">
            Description &amp; Error Details <span className="text-rose-500">*</span>
          </label>
          <textarea
            id="portal-description"
            rows={5}
            placeholder="Include steps to reproduce, error codes, or impacted workspace..."
            {...register('description')}
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          {errors.description && (
            <p className="mt-1 text-xs text-rose-600">{errors.description.message}</p>
          )}
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60 cursor-pointer"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {isSubmitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </form>
    </div>
  );
}
