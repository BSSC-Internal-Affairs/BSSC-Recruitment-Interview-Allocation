"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ClipboardList, Search } from "lucide-react";
import { api } from "@/services/api";
import type { SubmissionSummary } from "@/types";
import { formatTimestamp } from "@/utils/format";
export function Responses() {
  const [rows, setRows] = useState<SubmissionSummary[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [query, setQuery] = useState("");
  const load = async () => {
    try {
      setRows(await api.responses());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const filtered = rows.filter((r) =>
    `${r.fullName} ${r.formId}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE NEXT GENERATION</div>
          <h1>Meet your applicants.</h1>
          <p>Every response is the start of a new possibility.</p>
        </div>
        <button className="btn secondary" onClick={() => void load()}>
          Refresh responses
        </button>
      </div>
      <div className="stat-card">
        <span className="stat-icon">
          <ClipboardList size={24} />
        </span>
        <div>
          <strong>{rows.length}</strong>
          <span>Responses shown</span>
        </div>
        <span className="badge">Latest 1,000</span>
      </div>
      <section className="panel">
        <div className="panel-toolbar">
          <h2>
            All responses <span className="count">{rows.length}</span>
          </h2>
          <div className="search">
            <Search size={17} />
            <input
              aria-label="Search responses"
              placeholder="Search name or form ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Form ID</th>
                <th>Full name</th>
                <th>Submitted at · WIB</th>
                <th>
                  <span className="sr-only">View response</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() =>
                    window.location.assign(`/admin/responses/${r.id}`)
                  }
                >
                  <td>
                    <Link href={`/admin/responses/${r.id}`} className="form-id">
                      {r.formId}
                    </Link>
                  </td>
                  <td className="name-cell">{r.fullName}</td>
                  <td>{formatTimestamp(r.submittedAt)}</td>
                  <td>
                    <ArrowUpRight size={17} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading ? (
          <div className="empty">Loading responses…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <ClipboardList size={31} />
            <h3>
              {query
                ? "No matching responses"
                : "Good things are on their way."}
            </h3>
            <p>
              {query
                ? "Try a different name or form ID."
                : "Submitted registrations will appear here."}
            </p>
          </div>
        ) : null}
      </section>
    </>
  );
}
