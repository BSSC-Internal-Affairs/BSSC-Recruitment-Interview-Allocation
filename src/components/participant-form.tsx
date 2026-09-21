"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  ShieldCheck,
  LockKeyhole,
} from "lucide-react";
import { FormIntro } from "./form-intro";
import { ScheduleSelector } from "./schedule-selector";
import { Brand } from "./brand";
import { DynamicField } from "./dynamic-field";
import { api, RequestError } from "@/services/api";
import { useSchedules } from "@/hooks/use-schedules";
import { validateAnswers, nimSchema } from "@/server/validators";
import { formatDate, isFutureSlot } from "@/utils/format";
import type { Booking, FormConfig } from "@/types";
export function ParticipantForm() {
  const [config, setConfig] = useState<FormConfig | null>(null),
    [step, setStep] = useState(1),
    [answers, setAnswers] = useState<Record<string, string>>({}),
    [standaloneNim, setStandaloneNim] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [dateId, setDateId] = useState(""),
    [slotId, setSlotId] = useState(""),
    [busy, setBusy] = useState(false),
    [booking, setBooking] = useState<Booking | null>(null);
  const key = useRef(""),
    submitting = useRef(false),
    heading = useRef<HTMLHeadingElement>(null);
  const nim = config?.nimFieldId
    ? answers[config.nimFieldId] || ""
    : standaloneNim;
  const nimInputId = config?.nimFieldId || "participant-nim";
  const {
    dates,
    error: scheduleError,
    loading,
    refresh,
  } = useSchedules(config?.isActive === true && !booking);
  const load = () =>
    api
      .form()
      .then(setConfig)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  const selectedDate = dates.find((d) => d.id === dateId),
    selectedSlot = selectedDate?.slots.find((s) => s.id === slotId);
  const canBook =
    selectedSlot &&
    selectedSlot.registeredCount < selectedSlot.capacity &&
    selectedDate &&
    isFutureSlot(selectedDate.date, selectedSlot.startTime);
  useEffect(() => {
    heading.current?.focus();
  }, [step, booking, config?.isActive]);
  async function advance(event: React.FormEvent) {
    event.preventDefault();
    if (!config?.isActive || submitting.current) return;
    setError("");
    const issues = validateAnswers(config.fields, answers);
    const checkedNim = nimSchema.safeParse(nim);
    if (!checkedNim.success)
      issues[nimInputId] = "Enter a valid NIM using digits only.";
    setErrors(issues);
    if (Object.keys(issues).length) {
      setStep(1);
      document.getElementById(Object.keys(issues)[0])?.focus();
      return;
    }
    if (step === 1) {
      setStep(2);
      void refresh();
      return;
    }
    if (!canBook) {
      setError("Please choose an available interview time.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    if (!key.current) key.current = crypto.randomUUID();
    try {
      setBooking(
        await api.submit({
          answers,
          slotId,
          idempotencyKey: key.current,
          nim,
        }),
      );
      void refresh();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof RequestError) {
        if (e.code === "FORM_CLOSED") {
          setConfig((current) =>
            current
              ? { ...current, isActive: false, closedMessage: e.message }
              : current,
          );
          key.current = "";
          return;
        }
        if (e.fields) {
          const { nim: nimError, ...fieldErrors } = e.fields;
          setErrors({
            ...fieldErrors,
            ...(nimError ? { [nimInputId]: nimError } : {}),
          });
          setStep(1);
          // Recover when an administrator changes fields while this form is open.
          try {
            const current = await api.form();
            setConfig(current);
            setAnswers((previous) =>
              Object.fromEntries(
                Object.entries(previous).filter(([id]) =>
                  current.fields.some((field) => field.id === id),
                ),
              ),
            );
          } catch {
            /* Preserve the original validation message if refresh fails. */
          }
        }
        if (e.status < 500) {
          key.current = "";
          if (e.status === 409) {
            setSlotId("");
            void refresh();
          }
        }
      }
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }
  function changeAnswer(id: string, value: string) {
    setAnswers((a) => ({ ...a, [id]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[id];
      return next;
    });
    key.current = "";
  }
  return (
    <div className="public-shell">
      <header className="public-nav">
        <Brand />
        <span className="recruitment-tag">
          <span /> Recruitment 2026
        </span>
      </header>
      <main className="public-main">
        <FormIntro config={config} />
        <section className="form-card">
          {booking ? (
            <div className="confirmation">
              <span className="success-icon">
                <CheckCircle2 size={38} />
              </span>
              <span className="eyebrow">YOU’RE ALL SET</span>
              <h2 ref={heading} tabIndex={-1}>
                See you at your interview!
              </h2>
              <p>
                Your interview is reserved. Save these details so you’re ready
                for the day.
              </p>
              <div className="booking-details">
                <span className="badge">{booking.formId}</span>
                <h3>{formatDate(booking.date)}</h3>
                <p>
                  <Clock3 size={17} /> {booking.startTime} – {booking.endTime}{" "}
                  WIB
                </p>
              </div>
              <p className="muted">
                Please arrive 10 minutes early. We’re looking forward to getting
                to know you.
              </p>
              <button className="btn secondary" onClick={() => window.print()}>
                Save / print confirmation
              </button>
            </div>
          ) : config && !config.isActive ? (
            <div className="confirmation">
              <span className="success-icon">
                <LockKeyhole size={38} />
              </span>
              <h2 ref={heading} tabIndex={-1}>
                Interview Registration Closed
              </h2>
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {config.closedMessage}
              </p>
              <Link className="btn secondary" href="/schedule-check">
                Check your interview schedule <ArrowRight size={17} />
              </Link>
            </div>
          ) : (
            <>
              <div className="stepper">
                <div className={step === 1 ? "step active" : "step complete"}>
                  <span>{step > 1 ? <Check size={15} /> : 1}</span>
                  <div>
                    Personal information<small>A little about you</small>
                  </div>
                </div>
                <div className="step-connector" />
                <div className={step === 2 ? "step active" : "step"}>
                  <span>2</span>
                  <div>
                    Interview schedule<small>Find your moment</small>
                  </div>
                </div>
              </div>
              <div className="form-body">
                <div className="section-kicker">STEP {step} OF 2</div>
                <h2 ref={heading} tabIndex={-1}>
                  {step === 1
                    ? "Let’s get to know you."
                    : "Make time for what’s next."}
                </h2>
                <p className="section-description">
                  {step === 1
                    ? "Start with a few details. We’ll take it from there."
                    : "Choose a date and time that fits your schedule."}
                </p>
                {!config ? (
                  <div className="empty">
                    {error ? (
                      <>
                        <p role="alert">{error}</p>
                        <button
                          className="btn secondary"
                          onClick={() => {
                            setError("");
                            void load();
                          }}
                        >
                          Try again
                        </button>
                      </>
                    ) : (
                      "Loading your registration form…"
                    )}
                  </div>
                ) : !config.fields.length ? (
                  <div className="empty">
                    Registration is being prepared. Please check back soon.
                  </div>
                ) : (
                  <form onSubmit={advance} noValidate>
                    <fieldset disabled={busy} className="form-fieldset">
                      {step === 1 ? (
                        <>
                          <div className="fields-grid">
                            {!config.nimFieldId && (
                              <div className="field">
                                <label htmlFor={nimInputId}>
                                  NIM <span className="required">*</span>
                                </label>
                                <input
                                  id={nimInputId}
                                  name="nim"
                                  inputMode="numeric"
                                  maxLength={32}
                                  required
                                  value={standaloneNim}
                                  aria-invalid={!!errors[nimInputId]}
                                  aria-describedby={
                                    errors[nimInputId] ? "nim-error" : undefined
                                  }
                                  onChange={(e) => {
                                    setStandaloneNim(e.target.value);
                                    setErrors((previous) => {
                                      const next = { ...previous };
                                      delete next[nimInputId];
                                      return next;
                                    });
                                    key.current = "";
                                  }}
                                />
                                {errors[nimInputId] && (
                                  <p className="field-error" id="nim-error">
                                    {errors[nimInputId]}
                                  </p>
                                )}
                              </div>
                            )}
                            {config.fields.map((f) => (
                              <DynamicField
                                key={f.id}
                                field={f}
                                value={answers[f.id] || ""}
                                onChange={(v) => changeAnswer(f.id, v)}
                                error={errors[f.id]}
                              />
                            ))}
                          </div>
                          <p className="required-note">
                            <span className="required">*</span> Required fields
                          </p>
                        </>
                      ) : (
                        <>
                          <ScheduleSelector
                            dates={dates}
                            dateId={dateId}
                            slotId={slotId}
                            loading={loading}
                            instructions={config.instructions}
                            refresh={refresh}
                            onDateChange={(id) => {
                              setDateId(id);
                              setSlotId("");
                              key.current = "";
                            }}
                            onSlotChange={(id) => {
                              setSlotId(id);
                              key.current = "";
                            }}
                          />
                        </>
                      )}
                      {(error || (step === 2 && scheduleError)) && (
                        <div className="alert" role="alert">
                          {error || scheduleError}
                        </div>
                      )}
                      <div className="form-actions">
                        {step === 1 ? (
                          <span>
                            <ShieldCheck size={16} /> Your details stay with the
                            committee.
                          </span>
                        ) : (
                          <button
                            className="text-button"
                            type="button"
                            onClick={() => setStep(1)}
                          >
                            <ArrowLeft size={16} /> Back
                          </button>
                        )}
                        <button
                          className="btn primary"
                          type="submit"
                          disabled={busy || (step === 2 && !canBook)}
                        >
                          {busy
                            ? "Reserving your time…"
                            : step === 1
                              ? "Choose interview time"
                              : "Confirm interview"}
                          {!busy && <ArrowRight size={17} />}
                        </button>
                      </div>
                    </fieldset>
                  </form>
                )}
              </div>
            </>
          )}
        </section>
      </main>
      <footer className="public-footer">
        <span>
          © 2026 BSSC <span className="footer-dot">·</span> A little courage. A
          world of possibilities.
        </span>
        <Link href="/admin">
          Committee access <ArrowRight size={13} />
        </Link>
      </footer>
    </div>
  );
}
