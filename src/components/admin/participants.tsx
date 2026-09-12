"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  Link2,
  Plus,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { api } from "@/services/api";
import type { Participant, ParticipantInvitation } from "@/types";
import { formatTimestamp } from "@/utils/format";

export function Participants() {
  const [rows, setRows] = useState<Participant[]>([]),
    [fullName, setFullName] = useState(""),
    [email, setEmail] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [invitation, setInvitation] = useState<{
      name: string;
      url: string;
    } | null>(null),
    [copied, setCopied] = useState(false);
  const load = async () => {
    try {
      setRows(await api.participants());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  function showInvitation(result: ParticipantInvitation) {
    setInvitation({
      name: result.participant.fullName,
      url: `${window.location.origin}/#invite=${result.token}`,
    });
    setCopied(false);
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      showInvitation(await api.createParticipant({ fullName, email }));
      setFullName("");
      setEmail("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function replace(p: Participant) {
    if (
      busy ||
      !confirm(
        `Create a replacement invitation for ${p.fullName}? The previous link will stop working.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      showInvitation(await api.replaceInvitation(p.id));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(p: Participant) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.setParticipantDisabled(p.id, !p.disabled);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visible = rows.filter(
    (p) =>
      `${p.fullName} ${p.email}`.toLowerCase().includes(query.toLowerCase()) &&
      (status === "all" ||
        (status === "disabled" && p.disabled) ||
        (status === "responded" && !!p.submissionId) ||
        (status === "pending" && !p.disabled && !p.submissionId)),
  );
  const responded = rows.filter((p) => p.submissionId).length;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">INVITE YOUR NEXT CHAPTER</div>
          <h1>Your participants.</h1>
          <p>
            Register each participant and share their private invitation link.
          </p>
        </div>
        <button
          className="btn secondary"
          disabled={busy}
          onClick={() => {
            setError("");
            void load();
          }}
        >
          Refresh participants
        </button>
      </div>
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-icon green-bg">
            <Users size={23} />
          </span>
          <div>
            <strong>{rows.length}</strong>
            <span>Registered participants</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon purple-bg">
            <Link2 size={23} />
          </span>
          <div>
            <strong>
              {rows.filter((p) => !p.disabled && !p.submissionId).length}
            </strong>
            <span>Awaiting response</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon blue-bg">
            <ShieldCheck size={23} />
          </span>
          <div>
            <strong>{responded}</strong>
            <span>Responded</span>
          </div>
        </div>
      </div>
      <section className="panel padded">
        <h2>Register a participant</h2>
        <p className="muted">
          Each registered email can submit once. Share invitation links
          privately.
        </p>
        <form className="participant-create" onSubmit={create}>
          <div className="field">
            <label htmlFor="participant-name">Full name</label>
            <input
              id="participant-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={200}
              required
              disabled={busy}
            />
          </div>
          <div className="field">
            <label htmlFor="participant-email">Email address</label>
            <input
              id="participant-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              required
              disabled={busy}
            />
          </div>
          <button className="btn primary" disabled={busy}>
            <Plus size={16} />
            {busy ? "Saving…" : "Register participant"}
          </button>
        </form>
      </section>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {invitation && (
        <section className="panel padded invitation-share" aria-live="polite">
          <h2>Invitation for {invitation.name}</h2>
          <p>
            Copy and send this link yourself. For privacy, it is shown only
            here; you can create a replacement later.
          </p>
          <div className="copy-link">
            <input
              aria-label="Private invitation link"
              readOnly
              value={invitation.url}
              onFocus={(e) => e.target.select()}
            />
            <button
              className="btn secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(invitation.url);
                  setCopied(true);
                } catch {
                  setError(
                    "Copy was unavailable. Select the invitation link and copy it manually.",
                  );
                }
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </section>
      )}
      <section className="panel">
        <div className="panel-toolbar">
          <h2>
            Participant list <span className="count">{visible.length}</span>
          </h2>
          <div className="participant-search">
            <div className="search">
              <Search size={17} />
              <input
                aria-label="Search participants"
                placeholder="Search name or email…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select
              aria-label="Filter participant status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="pending">Awaiting response</option>
              <option value="responded">Responded</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </div>
        <div className="table-scroll">
          <table className="participants-table">
            <thead>
              <tr>
                <th>Participant</th>
                <th>Status</th>
                <th>Registered at · WIB</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong className="name-cell">{p.fullName}</strong>
                    <small className="participant-email">{p.email}</small>
                  </td>
                  <td>
                    <span
                      className={`badge ${p.submissionId ? "responded-badge" : p.disabled ? "disabled-badge" : "pending-badge"}`}
                    >
                      {p.submissionId
                        ? "Responded"
                        : p.disabled
                          ? "Disabled"
                          : "Awaiting response"}
                    </span>
                    {p.disabled && p.submissionId && (
                      <small className="participant-email">
                        Access disabled
                      </small>
                    )}
                  </td>
                  <td>{formatTimestamp(p.createdAt)}</td>
                  <td>
                    <div className="participant-actions">
                      {p.submissionId ? (
                        <Link
                          className="btn secondary"
                          href={`/admin/responses/${p.submissionId}`}
                        >
                          {p.formId}{" "}
                          <span className="sr-only">View response</span>
                        </Link>
                      ) : (
                        !p.disabled && (
                          <button
                            className="btn secondary"
                            disabled={busy}
                            onClick={() => void replace(p)}
                          >
                            <Link2 size={14} /> Replace link
                          </button>
                        )
                      )}
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => void toggle(p)}
                      >
                        {p.disabled ? "Enable" : "Disable"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading ? (
          <div className="empty">Loading participants…</div>
        ) : (
          !visible.length && (
            <div className="empty">
              <Users size={30} />
              <h3>
                {rows.length
                  ? "No matching participants"
                  : "Start with a personal invitation."}
              </h3>
              <p>
                {rows.length
                  ? "Try another search or status."
                  : "Register your first participant above."}
              </p>
            </div>
          )
        )}
      </section>
    </>
  );
}
