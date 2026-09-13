"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { api } from "@/services/api";
import type { Participant } from "@/types";
import { formatTimestamp } from "@/utils/format";

export function Participants() {
  const [rows, setRows] = useState<Participant[]>([]),
    [fullName, setFullName] = useState(""),
    [nim, setNim] = useState(""),
    [editing, setEditing] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const nameInput = useRef<HTMLInputElement>(null);
  async function load() {
    try {
      setRows(await api.participants());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function reset() {
    setEditing(null);
    setFullName("");
    setNim("");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const participant = editing
        ? await api.updateParticipant(editing, { fullName, nim })
        : await api.createParticipant({ fullName, nim });
      setRows((previous) =>
        editing
          ? previous.map((p) => (p.id === participant.id ? participant : p))
          : [participant, ...previous],
      );
      setNotice(editing ? "Participant updated." : "Participant registered.");
      reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function edit(p: Participant) {
    setEditing(p.id);
    setFullName(p.fullName);
    setNim(p.nim || "");
    setError("");
    setNotice("");
    nameInput.current?.focus();
  }
  async function remove(p: Participant) {
    if (
      busy ||
      p.submissionId ||
      !confirm(
        `Delete ${p.fullName} from the participant list? Their NIM will no longer be allowed to submit.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.deleteParticipant(p.id);
      setRows((previous) => previous.filter((row) => row.id !== p.id));
      if (editing === p.id) reset();
      setNotice("Participant deleted.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visible = rows.filter(
    (p) =>
      `${p.nim || ""} ${p.fullName}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()) &&
      (status === "all" ||
        (status === "responded" && !!p.submissionId) ||
        (status === "pending" && !!p.nim && !p.submissionId) ||
        (status === "missing" && !p.nim)),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR RECRUITMENT ROSTER</div>
          <h1>Participant management.</h1>
          <p>Register the names and NIMs allowed to submit the public form.</p>
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
            <span>Total participants</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon purple-bg">
            <Pencil size={23} />
          </span>
          <div>
            <strong>
              {rows.filter((p) => p.nim && !p.submissionId).length}
            </strong>
            <span>Awaiting response</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon blue-bg">
            <Check size={23} />
          </span>
          <div>
            <strong>{rows.filter((p) => p.submissionId).length}</strong>
            <span>Responded</span>
          </div>
        </div>
      </div>
      {rows.some((p) => !p.nim) && (
        <p className="notice">
          Some existing participants need a NIM. Edit their records before they
          can submit.
        </p>
      )}
      <section className="panel padded">
        <h2>{editing ? "Edit participant" : "Register a participant"}</h2>
        <p className="muted">Each registered NIM can submit one response.</p>
        <form className="participant-create" onSubmit={save}>
          <div className="field">
            <label htmlFor="participant-name">Full name</label>
            <input
              ref={nameInput}
              id="participant-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={200}
              required
              disabled={busy}
            />
          </div>
          <div className="field">
            <label htmlFor="participant-nim">NIM</label>
            <input
              id="participant-nim"
              value={nim}
              inputMode="numeric"
              pattern="[0-9]{1,32}"
              onChange={(e) => setNim(e.target.value)}
              maxLength={32}
              required
              disabled={busy}
            />
          </div>
          <div className="participant-actions">
            <button className="btn primary" disabled={busy}>
              <Plus size={16} />
              {busy
                ? "Saving…"
                : editing
                  ? "Save participant"
                  : "Register participant"}
            </button>
            {editing && (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={reset}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
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
                placeholder="Search NIM or name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select
              aria-label="Filter participant status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">All participants</option>
              <option value="pending">Awaiting response</option>
              <option value="responded">Responded</option>
              <option value="missing">NIM needed</option>
            </select>
          </div>
        </div>
        <div className="table-scroll">
          <table className="participants-table">
            <thead>
              <tr>
                <th>NIM</th>
                <th>Full name</th>
                <th>Response</th>
                <th>Registered at · WIB</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.nim || (
                      <span className="badge pending-badge">NIM needed</span>
                    )}
                  </td>
                  <td className="name-cell">{p.fullName}</td>
                  <td>
                    {p.submissionId ? (
                      <Link
                        className="badge responded-badge"
                        href={`/admin/responses/${p.submissionId}`}
                      >
                        Responded · {p.formId}
                      </Link>
                    ) : (
                      <span className="badge pending-badge">No response</span>
                    )}
                  </td>
                  <td>{formatTimestamp(p.createdAt)}</td>
                  <td>
                    <div className="participant-actions">
                      <button
                        className="btn secondary"
                        disabled={busy}
                        onClick={() => edit(p)}
                      >
                        <Pencil size={14} /> Edit
                      </button>
                      <button
                        className="text-button"
                        disabled={busy || !!p.submissionId}
                        title={
                          p.submissionId
                            ? "Participants with responses cannot be deleted"
                            : undefined
                        }
                        onClick={() => void remove(p)}
                      >
                        <Trash2 size={14} /> Delete
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
                  : "Register your first participant."}
              </h3>
              <p>
                {rows.length
                  ? "Try another NIM, name, or filter."
                  : "Add their full name and NIM above."}
              </p>
            </div>
          )
        )}
      </section>
    </>
  );
}
