"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ClipboardList,
  Search,
} from "lucide-react";
import { api } from "@/services/api";
import type { ResponseFilters, ResponseList } from "@/types";
import { formatDate, formatTimestamp, formatWeekday } from "@/utils/format";
const empty: ResponseList = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 50,
  dates: [],
  times: [],
};
export function Responses() {
  const [result, setResult] = useState<ResponseList>(empty),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [filters, setFilters] = useState<ResponseFilters>({
      sort: "submitted_desc",
      page: 1,
    }),
    [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .responses({ ...filters, q: query })
        .then((data) => {
          if (!cancelled) {
            setResult(data);
            setError("");
          }
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filters, query, reload]);
  function filter(patch: Partial<ResponseFilters>) {
    setFilters((previous) => ({ ...previous, ...patch, page: 1 }));
  }
  const filtered = !!(query || filters.date || filters.weekday || filters.time);
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">THE NEXT GENERATION</div>
          <h1>Meet your applicants.</h1>
          <p>Find each conversation by interview day, date, and time.</p>
        </div>
        <button
          className="btn secondary"
          onClick={() => setReload((value) => value + 1)}
          disabled={loading}
        >
          Refresh responses
        </button>
      </div>
      <div className="stat-card">
        <span className="stat-icon">
          <ClipboardList size={24} />
        </span>
        <div>
          <strong>{result.total}</strong>
          <span>{filtered ? "Matching responses" : "Total responses"}</span>
        </div>
        <span className="badge">All records</span>
      </div>
      <section className="panel" aria-busy={loading}>
        <div className="panel-toolbar">
          <h2>
            Responses <span className="count">{result.total}</span>
          </h2>
          <div className="search">
            <Search size={17} />
            <input
              aria-label="Search responses"
              placeholder="Search name or form ID…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                filter({});
              }}
              maxLength={200}
            />
          </div>
        </div>
        <div className="response-filters">
          <label>
            <span>Interview date</span>
            <select
              value={filters.date || ""}
              onChange={(e) => filter({ date: e.target.value || undefined })}
            >
              <option value="">All dates</option>
              {result.dates.map((date) => (
                <option key={date} value={date}>
                  {formatDate(date)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Day of week</span>
            <select
              value={filters.weekday ?? ""}
              onChange={(e) => filter({ weekday: e.target.value || undefined })}
            >
              <option value="">All days</option>
              {[
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
              ].map((day, index) => (
                <option key={day} value={String(index)}>
                  {day}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Start time · WIB</span>
            <select
              value={filters.time || ""}
              onChange={(e) => filter({ time: e.target.value || undefined })}
            >
              <option value="">All times</option>
              {result.times.map((time) => (
                <option key={time}>{time}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Sort by</span>
            <select
              value={filters.sort}
              onChange={(e) =>
                filter({ sort: e.target.value as ResponseFilters["sort"] })
              }
            >
              <option value="submitted_desc">Newest response</option>
              <option value="submitted_asc">Oldest response</option>
              <option value="interview_asc">Interview: earliest first</option>
              <option value="interview_desc">Interview: latest first</option>
              <option value="name_asc">Name: A–Z</option>
            </select>
          </label>
          <button
            className="text-button"
            onClick={() => {
              setQuery("");
              setFilters({ sort: "submitted_desc", page: 1 });
            }}
          >
            Reset filters
          </button>
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
                <th>Interview day / date</th>
                <th>Time · WIB</th>
                <th>Submitted at · WIB</th>
                <th>
                  <span className="sr-only">View response</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((r) => (
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
                  <td>
                    <strong className="response-weekday">
                      {formatWeekday(r.date)}
                    </strong>
                    <span>{formatDate(r.date)}</span>
                  </td>
                  <td>
                    <span className="interview-time-badge">
                      {r.startTime} – {r.endTime}
                    </span>
                  </td>
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
          <div className="response-loading" role="status">
            Loading responses…
          </div>
        ) : (
          !result.items.length && (
            <div className="empty">
              <ClipboardList size={31} />
              <h3>
                {filtered
                  ? "No matching responses"
                  : "Good things are on their way."}
              </h3>
              <p>
                {filtered
                  ? "Try another date, day, time, or search."
                  : "Submitted registrations will appear here."}
              </p>
            </div>
          )
        )}
        <div className="response-pagination">
          <span>
            {result.total
              ? `${(result.page - 1) * result.pageSize + 1}–${Math.min(result.page * result.pageSize, result.total)} of ${result.total}`
              : "0 responses"}
          </span>
          <div>
            <button
              className="btn secondary"
              disabled={loading || result.page <= 1}
              onClick={() =>
                setFilters((previous) => ({
                  ...previous,
                  page: result.page - 1,
                }))
              }
            >
              <ArrowLeft size={14} />
              Previous
            </button>
            <span>
              Page {result.page} of {pageCount}
            </span>
            <button
              className="btn secondary"
              disabled={loading || result.page >= pageCount}
              onClick={() =>
                setFilters((previous) => ({
                  ...previous,
                  page: result.page + 1,
                }))
              }
            >
              Next
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
