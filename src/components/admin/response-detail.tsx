"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock3 } from "lucide-react";
import { api } from "@/services/api";
import type { SubmissionDetail } from "@/types";
import { formatDate, formatTimestamp } from "@/utils/format";
export function ResponseDetail({ id }: { id: string }) {
  const [response, setResponse] = useState<SubmissionDetail | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api
      .response(id)
      .then(setResponse)
      .catch((e) => setError(e.message));
  }, [id]);
  return (
    <>
      <Link className="back-link" href="/admin">
        <ArrowLeft size={16} /> All responses
      </Link>
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : !response ? (
        <div className="empty">Loading response…</div>
      ) : (
        <>
          <div className="page-heading">
            <div>
              <span className="badge">{response.formId}</span>
              <h1>{response.fullName}</h1>
              <p>Submitted {formatTimestamp(response.submittedAt)} WIB</p>
            </div>
          </div>
          <div className="detail-grid">
            <section className="panel padded">
              <h2>Personal information</h2>
              <dl className="answers">
                {response.answers.map((a) => (
                  <div key={a.fieldId}>
                    <dt>{a.label}</dt>
                    <dd>{a.value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="panel padded interview-detail">
              <span className="stat-icon">
                <CalendarDays size={24} />
              </span>
              <h2>Interview appointment</h2>
              <h3>{formatDate(response.date)}</h3>
              <p>
                <Clock3 size={17} /> {response.startTime} – {response.endTime}{" "}
                WIB
              </p>
              <span className="badge">Confirmed</span>
            </section>
          </div>
        </>
      )}
    </>
  );
}
