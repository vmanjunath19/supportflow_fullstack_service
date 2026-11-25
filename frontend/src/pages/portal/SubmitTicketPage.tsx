import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  Database,
  Globe,
  HelpCircle,
  KeyRound,
  Layers,
  Loader2,
  Send,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import {
  IMPACT_LEVELS,
  URGENCY_LEVELS,
  calculateTicketPriority,
  createTicketSchema,
  type CreateTicketFormValues,
  type CreateTicketValidatedData,
} from '../../lib/ticketSchema';
import { PriorityBadge } from '../../components/TicketBadges';
import { useCreateTicketMutation } from '../../hooks/useTickets';
import type { Ticket, TicketCategory, TicketPriority } from '../../types/database';

interface CategoryOption {
  value: TicketCategory;
  label: string;
  description: string;
  icon: LucideIcon;
}

const CATEGORY_CARDS: CategoryOption[] = [
  {
    value: 'Software',
    label: 'Software & Apps',
    description: 'Application crashes, UI bugs, or SaaS license issues',
    icon: Layers,
  },
  {
    value: 'Access & IAM',
    label: 'Access & IAM',
    description: 'SSO login failures, MFA resets, or role permissions',
    icon: KeyRound,
  },
  {
    value: 'Network',
    label: 'Network & VPN',
    description: 'Corporate VPN drops, Wi-Fi connectivity, or DNS routing',
    icon: Globe,
  },
  {
    value: 'Database & Cloud',
    label: 'Database & Cloud',
    description: 'Production DB latency, cloud deployments, or API errors',
    icon: Database,
  },
  {
    value: 'Hardware',
    label: 'Hardware & Devices',
    description: 'Laptop malfunctions, peripherals, or workstation setup',
    icon: Cpu,
  },
  {
    value: 'Other',
    label: 'General Support',
    description: 'Other IT inquiries or cross-functional service requests',
    icon: HelpCircle,
  },
];

const SLA_TARGET_COPY: Record<TicketPriority, string> = {
  Urgent: '1 hour target response',
  High: '4 hours target response',
  Medium: '24 hours target response',
  Low: '72 hours target response',
};

const WIZARD_STEPS = [
  { number: 1, title: 'Category & Contact' },
  { number: 2, title: 'Issue Details' },
  { number: 3, title: 'Impact & Review' },
] as const;

export function SubmitTicketPage() {
  const navigate = useNavigate();
  const createTicketMutation = useCreateTicketMutation();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdTicket, setCreatedTicket] = useState<Ticket | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
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

  const watchedCategory = watch('category') ?? 'Software';
  const watchedEmail = watch('requester_email') ?? '';
  const watchedTitle = watch('title') ?? '';
  const watchedDescription = watch('description') ?? '';
  const watchedImpact = watch('impact') ?? 'Medium';
  const watchedUrgency = watch('urgency') ?? 'Medium';

  const derivedPriority = calculateTicketPriority(watchedImpact, watchedUrgency);
  const isUrgentFlagged = watchedImpact === 'High' && watchedUrgency === 'High';

  async function handleNextStep() {
    setSubmitError(null);
    if (step === 1) {
      const valid = await trigger(['category', 'requester_email']);
      if (valid) setStep(2);
    } else if (step === 2) {
      const valid = await trigger(['title', 'description']);
      if (valid) setStep(3);
    }
  }

  function toggleUrgentOutageFlag() {
    if (isUrgentFlagged) {
      setValue('impact', 'Medium', { shouldValidate: true });
      setValue('urgency', 'Medium', { shouldValidate: true });
    } else {
      setValue('impact', 'High', { shouldValidate: true });
      setValue('urgency', 'High', { shouldValidate: true });
    }
  }

  async function onSubmit(values: CreateTicketValidatedData) {
    setSubmitError(null);

    try {
      const priority = calculateTicketPriority(values.impact, values.urgency);

      const ticket = await createTicketMutation.mutateAsync({
        title: values.title,
        description: values.description,
        category: values.category,
        priority,
        impact: values.impact,
        urgency: values.urgency,
        requester_email: values.requester_email,
      });

      setCreatedTicket(ticket);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Unable to submit support request.'
      );
    }
  }

  if (createdTicket) {
    const formattedId = `INC-${String(createdTicket.ticket_number).padStart(4, '0')}`;

    function handleCopyTicketId() {
      navigator.clipboard?.writeText(formattedId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }

    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Support Request Created</h1>
          <p className="text-sm text-slate-600">
            Your incident has been logged and queued for triage. Save your Ticket ID below for reference.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Generated Ticket ID
            </p>
            <p className="font-mono text-xl font-bold text-indigo-600 mt-0.5">{formattedId}</p>
            <p className="font-mono text-[11px] text-slate-400 mt-0.5 truncate max-w-xs">
              Ref: {createdTicket.id}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopyTicketId}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            {copiedId ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy ID
              </>
            )}
          </button>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs border-t border-slate-100 pt-4">
          <div>
            <dt className="text-slate-500">Subject</dt>
            <dd className="font-semibold text-slate-900 mt-0.5">{createdTicket.title}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Assigned SLA Priority</dt>
            <dd className="mt-1">
              <PriorityBadge priority={createdTicket.priority} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Category</dt>
            <dd className="font-medium text-slate-800 mt-0.5">{createdTicket.category}</dd>
          </div>
          <div>
            <dt className="text-slate-500">SLA Resolution Target</dt>
            <dd className="font-medium text-slate-800 mt-0.5 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-indigo-500" />
              {createdTicket.sla_due_at
                ? new Date(createdTicket.sla_due_at).toLocaleString()
                : SLA_TARGET_COPY[createdTicket.priority]}
            </dd>
          </div>
        </dl>

        <div className="pt-2 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`/tickets/${createdTicket.id}`)}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-2xs hover:bg-indigo-700 transition-colors cursor-pointer"
          >
            View Ticket Timeline
          </button>
          <button
            type="button"
            onClick={() =>
              navigate(`/tickets?email=${encodeURIComponent(createdTicket.requester_email)}`)
            }
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Track My Tickets
          </button>
          <button
            type="button"
            onClick={() => {
              setCreatedTicket(null);
              setStep(1);
              reset();
            }}
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Submit Another Request
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Submit a Support Request</h1>
        <p className="mt-1 text-sm text-slate-600">
          Complete the guided steps below to categorize your issue and calculate your SLA priority.
        </p>
      </div>

      {/* Stepper Header */}
      <nav aria-label="Submission progress" className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {WIZARD_STEPS.map(({ number, title }) => {
            const isCompleted = step > number;
            const isCurrent = step === number;
            return (
              <li
                key={number}
                aria-current={isCurrent ? 'step' : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  isCurrent
                    ? 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/20'
                    : isCompleted
                      ? 'text-emerald-700'
                      : 'text-slate-400'
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isCurrent
                      ? 'bg-indigo-600 text-white'
                      : isCompleted
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {isCompleted ? <Check className="h-3.5 w-3.5" /> : number}
                </span>
                <span>{title}</span>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Wizard Form */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 space-y-6"
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

        {/* STEP 1: Category Selection & Contact */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-3">
                1. What area do you need help with? <span className="text-rose-500">*</span>
              </label>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {CATEGORY_CARDS.map(({ value, label, description, icon: Icon }) => {
                  const isSelected = watchedCategory === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setValue('category', value, { shouldValidate: true })}
                      className={`text-left rounded-xl border p-4 transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/60 ring-1 ring-indigo-600'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                      }`}
                    >
                      <div
                        className={`mb-2.5 inline-flex h-8 w-8 items-center justify-center rounded-lg ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <p className="text-sm font-semibold text-slate-900">{label}</p>
                      <p className="mt-1 text-xs text-slate-500 leading-relaxed">{description}</p>
                    </button>
                  );
                })}
              </div>
              {errors.category && (
                <p className="mt-1.5 text-xs text-rose-600">{errors.category.message}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="wizard-email"
                className="block text-sm font-semibold text-slate-900"
              >
                Your Work Email <span className="text-rose-500">*</span>
              </label>
              <p className="text-xs text-slate-500 mt-0.5">
                Used to link your ticket and send status notifications.
              </p>
              <input
                id="wizard-email"
                type="email"
                placeholder="you@company.com"
                {...register('requester_email')}
                className="mt-2 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              {errors.requester_email && (
                <p className="mt-1 text-xs text-rose-600">{errors.requester_email.message}</p>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: Rich Description */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <label
                htmlFor="wizard-title"
                className="block text-sm font-semibold text-slate-900"
              >
                Incident Summary <span className="text-rose-500">*</span>
              </label>
              <input
                id="wizard-title"
                type="text"
                placeholder="e.g., Unable to authenticate via corporate VPN on macOS"
                {...register('title')}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              {errors.title && (
                <p className="mt-1 text-xs text-rose-600">{errors.title.message}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="wizard-description"
                  className="block text-sm font-semibold text-slate-900"
                >
                  Detailed Description <span className="text-rose-500">*</span>
                </label>
                <span className="text-xs text-slate-400">
                  {watchedDescription.length} / 5000
                </span>
              </div>

              <div className="mt-1.5 rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs text-slate-600">
                <span className="font-semibold text-slate-800">Helpful details to include:</span>{' '}
                Steps to reproduce, exact error messages, affected environment, and when the issue started.
              </div>

              <textarea
                id="wizard-description"
                rows={6}
                placeholder="Describe what happened, what you expected to happen, and any troubleshooting already attempted..."
                {...register('description')}
                className="mt-2 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm leading-relaxed focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              {errors.description && (
                <p className="mt-1 text-xs text-rose-600">{errors.description.message}</p>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: Impact, Urgent Flag & Review */}
        {step === 3 && (
          <div className="space-y-6">
            <div
              className={`rounded-xl border p-4 transition-colors ${
                isUrgentFlagged
                  ? 'border-rose-300 bg-rose-50/70'
                  : 'border-slate-200 bg-slate-50/70'
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      isUrgentFlagged
                        ? 'bg-rose-600 text-white'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      Critical / Production Outage Flag
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Enable if a core service is completely down or blocking multiple users (sets High Impact + High Urgency).
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={isUrgentFlagged}
                  onClick={toggleUrgentOutageFlag}
                  className={`inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                    isUrgentFlagged
                      ? 'bg-rose-600 text-white hover:bg-rose-700'
                      : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {isUrgentFlagged ? 'Urgent Flag Active' : 'Flag as Urgent'}
                </button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="wizard-impact"
                  className="block text-sm font-semibold text-slate-900"
                >
                  Business Impact
                </label>
                <select
                  id="wizard-impact"
                  {...register('impact')}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  {IMPACT_LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl} Impact
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="wizard-urgency"
                  className="block text-sm font-semibold text-slate-900"
                >
                  Urgency
                </label>
                <select
                  id="wizard-urgency"
                  {...register('urgency')}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  {URGENCY_LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl} Urgency
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-medium text-indigo-950">
                <Sparkles className="h-4 w-4 text-indigo-600" />
                <span>Calculated SLA Priority:</span>
                <span className="text-indigo-700">({SLA_TARGET_COPY[derivedPriority]})</span>
              </div>
              <PriorityBadge priority={derivedPriority} />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs">
              <h3 className="font-semibold uppercase tracking-wider text-slate-500">
                Request Summary
              </h3>
              <p className="text-slate-700">
                <span className="font-semibold text-slate-900">Requester:</span> {watchedEmail}
              </p>
              <p className="text-slate-700">
                <span className="font-semibold text-slate-900">Category:</span> {watchedCategory}
              </p>
              <p className="text-slate-700">
                <span className="font-semibold text-slate-900">Subject:</span> {watchedTitle}
              </p>
              <p className="text-slate-600 line-clamp-3 pt-1 border-t border-slate-200/80">
                {watchedDescription}
              </p>
            </div>
          </div>
        )}

        {/* Wizard Navigation Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-5">
          {step > 1 ? (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setStep((prev) => (prev === 3 ? 2 : 1))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          ) : (
            <span />
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={handleNextStep}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-2xs hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-2xs hover:bg-indigo-700 transition-colors cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {isSubmitting ? 'Submitting Ticket...' : 'Submit Support Request'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
