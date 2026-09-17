"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock3, Search } from "lucide-react";
import { Brand } from "./brand";
import { api, RequestError } from "@/services/api";
import { nimSchema } from "@/server/validators";
import { formatDate } from "@/utils/format";
import type { ScheduleLookupResult } from "@/types";

export function ScheduleCheck() {
  const [nim, setNim] = useState("");
  const [busy, setBusy] = useState(false);
  const [validation, setValidation] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ScheduleLookupResult | null>(null);
  const searching = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (searching.current) return;
    setResult(null);
    setError("");
    const checked = nimSchema.safeParse(nim);
    if (!checked.success) {
      setValidation("Enter a valid NIM using 1–32 digits.");
      input.current?.focus();
      return;
    }
    setValidation("");
    searching.current = true;
    setBusy(true);
    try {
      setResult(await api.lookupSchedule(checked.data));
    } catch (e) {
      setError(
        e instanceof RequestError
          ? e.message
          : "We couldn’t check your schedule. Please try again.",
      );
    } finally {
      searching.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="public-shell">
      <header className="public-nav">
        <Brand />
        <Link className="text-button" href="/">
          <ArrowLeft size={16} /> Interview form
        </Link>
      </header>
      <main className="schedule-check-main">
        <div className="eyebrow">
          <span className="small-line" /> YOUR INTERVIEW
        </div>
        <h1>Check your interview schedule</h1>
        <p className="section-description">
          Enter your NIM to see whether you have already selected an interview
          schedule.
        </p>
        <section className="form-card" aria-label="Schedule lookup">
          <div className="form-body">
            <form onSubmit={search} noValidate aria-busy={busy}>
              <div className="field">
                <label htmlFor="lookup-nim">NIM</label>
                <input
                  id="lookup-nim"
                  name="nim"
                  ref={input}
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={32}
                  required
                  disabled={busy}
                  value={nim}
                  aria-invalid={!!validation}
                  aria-describedby={validation ? "lookup-nim-error" : undefined}
                  onChange={(event) => {
                    setNim(event.target.value);
                    setValidation("");
                    setError("");
                    setResult(null);
                  }}
                />
                {validation && (
                  <p id="lookup-nim-error" className="field-error" role="alert">
                    {validation}
                  </p>
                )}
              </div>
              <button
                type="submit"
                className="btn primary schedule-check-button"
                disabled={busy}
              >
                <Search size={17} /> {busy ? "Searching…" : "Search"}
              </button>
            </form>
            <div aria-live="polite" aria-atomic="true">
              {busy && (
                <p className="muted schedule-check-status">
                  Checking your schedule…
                </p>
              )}
              {result && (
                <div className="schedule-check-result">
                  {result.found ? (
                    <>
                      <span className="badge">
                        <CalendarDays size={16} /> Interview schedule found
                      </span>
                      <h2>{formatDate(result.schedule.date)}</h2>
                      <p className="schedule-check-time">
                        <Clock3 size={17} /> {result.schedule.startTime} –{" "}
                        {result.schedule.endTime} WIB
                      </p>
                    </>
                  ) : (
                    <>
                      <h2>No interview schedule found for this NIM.</h2>
                      <p className="muted">
                        You have not selected an interview schedule yet.
                      </p>
                      <Link className="text-button" href="/">
                        Go to the interview form
                      </Link>
                    </>
                  )}
                </div>
              )}
            </div>
            {error && (
              <div className="alert" role="alert">
                {error}
              </div>
            )}
          </div>
        </section>
        <p className="schedule-check-note muted">
          All interview times are in Western Indonesia Time (WIB).
        </p>
      </main>
    </div>
  );
}
