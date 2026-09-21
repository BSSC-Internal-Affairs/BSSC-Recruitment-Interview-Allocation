"use client";
import { useState } from "react";
import {
  CalendarDays,
  Plus,
  Trash2,
  Check,
  Users,
  Clock3,
  ChevronDown,
  Eye,
  EyeOff,
} from "lucide-react";
import { useSchedules } from "@/hooks/use-schedules";
import { request } from "@/services/api";
import { formatDate } from "@/utils/format";
import type { InterviewDate, Slot } from "@/types";
type Mutate = (
  path: string,
  method: string,
  body?: unknown,
) => Promise<boolean>;
export function ScheduleManager() {
  const {
    dates,
    setDates,
    error: loadError,
    loading,
  } = useSchedules(true, "admin");
  const [newDate, setNewDate] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const mutate: Mutate = async (path, method, body) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setDates(await request<InterviewDate[]>(`admin/${path}`, method, body));
      setNotice("Schedule updated.");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const slots = dates.flatMap((d) => d.slots),
    capacity = slots.reduce((n, s) => n + s.capacity, 0),
    registered = slots.reduce((n, s) => n + s.registeredCount, 0);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE ROOM FOR POSSIBILITY</div>
          <h1>Interview schedule.</h1>
          <p>A clear plan for every conversation. All times are in WIB.</p>
        </div>
      </div>
      <div className="stats-grid">
        {[
          {
            label: "Total capacity",
            value: capacity,
            icon: CalendarDays,
            color: "green-bg",
          },
          {
            label: "Registered participants",
            value: registered,
            icon: Users,
            color: "purple-bg",
          },
          {
            label: "Remaining places",
            value: capacity - registered,
            icon: Clock3,
            color: "blue-bg",
          },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <span className={`stat-icon ${s.color}`}>
              <s.icon size={23} />
            </span>
            <div>
              <strong>{s.value}</strong>
              <span>{s.label}</span>
            </div>
          </div>
        ))}
      </div>
      <form
        className="panel add-date"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await mutate("dates", "POST", { date: newDate })) setNewDate("");
        }}
      >
        <div>
          <h2>Add an interview date</h2>
          <p className="muted">Create a date, then add its available times.</p>
        </div>
        <label className="sr-only" htmlFor="new-date">
          New interview date
        </label>
        <input
          id="new-date"
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          required
        />
        <button disabled={busy} className="btn primary">
          <Plus size={17} /> Add date
        </button>
      </form>
      {(error || loadError) && (
        <p className="alert" role="alert">
          {error || loadError}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          <Check size={16} />
          {notice}
        </p>
      )}
      <fieldset disabled={busy} className="form-fieldset">
        {dates.map((d) => (
          <DateEditor key={d.id} date={d} mutate={mutate} />
        ))}
      </fieldset>
      {loading ? (
        <div className="empty">Loading schedules…</div>
      ) : (
        !dates.length && (
          <section className="panel empty">
            <CalendarDays size={32} />
            <h3>A fresh calendar.</h3>
            <p>Add your first interview date to get started.</p>
          </section>
        )
      )}
    </>
  );
}
function DateEditor({ date, mutate }: { date: InterviewDate; mutate: Mutate }) {
  const [editing, setEditing] = useState(false),
    [value, setValue] = useState(date.date);
  const booked = date.slots.some((s) => s.registeredCount > 0);
  const capacity = date.slots.reduce((sum, slot) => sum + slot.capacity, 0),
    registered = date.slots.reduce(
      (sum, slot) => sum + slot.registeredCount,
      0,
    );
  return (
    <details className="panel date-panel">
      <summary className="date-header">
        <div className="date-summary">
          <h2>{formatDate(date.date)}</h2>
          <p>
            {date.slots.length} {date.slots.length === 1 ? "slot" : "slots"} ·{" "}
            {registered}/{capacity} registered · {capacity - registered}{" "}
            remaining
          </p>
        </div>
        <span
          className={`badge ${date.isVisible ? "schedule-visible" : "schedule-hidden"}`}
        >
          {date.isVisible ? <Eye size={15} /> : <EyeOff size={15} />}
          {date.isVisible ? "Visible" : "Hidden"}
        </span>
        <ChevronDown className="date-chevron" size={18} aria-hidden="true" />
      </summary>
      <div className="date-controls">
        <button
          type="button"
          className="btn secondary"
          role="switch"
          aria-checked={date.isVisible}
          aria-label={`Visible to participants: ${formatDate(date.date)}`}
          onClick={() =>
            void mutate(`dates/${date.id}`, "PATCH", {
              isVisible: !date.isVisible,
            })
          }
        >
          {date.isVisible ? <Eye size={16} /> : <EyeOff size={16} />}
          Visible to participants: {date.isVisible ? "On" : "Off"}
        </button>
        <div className="date-edit-actions">
          {!booked && (
            <>
              <button
                className="text-button"
                onClick={() => {
                  setValue(date.date);
                  setEditing(!editing);
                }}
              >
                Edit date
              </button>
              <button
                className="icon-button danger"
                aria-label={`Delete ${formatDate(date.date)}`}
                onClick={() => {
                  if (confirm("Delete this date and all its empty time slots?"))
                    void mutate(`dates/${date.id}`, "DELETE");
                }}
              >
                <Trash2 size={17} />
              </button>
            </>
          )}
          {booked && <span className="badge">Has registrations</span>}
        </div>
      </div>
      {editing && (
        <form
          className="inline-edit"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await mutate(`dates/${date.id}`, "PUT", { date: value }))
              setEditing(false);
          }}
        >
          <input
            aria-label="Edit interview date"
            type="date"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
          <button className="btn secondary">Save date</button>
        </form>
      )}
      <div className="slots-list">
        {date.slots.map((slot) => (
          <SlotEditor key={slot.id} slot={slot} mutate={mutate} />
        ))}
        <SlotEditor key={`new-${date.id}`} dateId={date.id} mutate={mutate} />
      </div>
    </details>
  );
}
function SlotEditor({
  slot,
  dateId,
  mutate,
}: {
  slot?: Slot;
  dateId?: string;
  mutate: Mutate;
}) {
  const [start, setStart] = useState(slot?.startTime || "09:00"),
    [end, setEnd] = useState(slot?.endTime || "09:30"),
    [capacity, setCapacity] = useState(String(slot?.capacity || 5));
  const booked = !!slot?.registeredCount;
  return (
    <form
      className={`slot-row ${!slot ? "new-slot" : ""}`}
      onSubmit={async (e) => {
        e.preventDefault();
        await mutate(
          slot ? `slots/${slot.id}` : "slots",
          slot ? "PUT" : "POST",
          {
            interviewDateId: slot?.interviewDateId || dateId,
            startTime: start,
            endTime: end,
            capacity: Number(capacity),
          },
        );
      }}
    >
      <div className="slot-time-inputs">
        <label>
          <span>{slot ? "Start time" : "New start time"}</span>
          <input
            type="time"
            aria-label={
              slot ? `Start time ${slot.startTime}` : "New slot start time"
            }
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
            disabled={booked}
          />
        </label>
        <span className="time-dash">–</span>
        <label>
          <span>End time</span>
          <input
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            required
            disabled={booked}
          />
        </label>
      </div>
      <label className="capacity-input">
        <span>Capacity</span>
        <input
          type="number"
          min={Math.max(1, slot?.registeredCount || 0)}
          max={10000}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          required
        />
      </label>
      <div className="slot-counts">
        {slot ? (
          <>
            <strong>{slot.registeredCount} registered</strong>
            <span>{slot.capacity - slot.registeredCount} remaining</span>
          </>
        ) : (
          <span>Add a new interview time</span>
        )}
      </div>
      <div className="slot-buttons">
        <button
          className={`btn ${slot ? "secondary" : "primary"}`}
          type="submit"
        >
          {slot ? (
            "Save"
          ) : (
            <>
              <Plus size={16} /> Add time
            </>
          )}
        </button>
        {slot && (
          <button
            className="icon-button danger"
            disabled={booked}
            title={
              booked ? "Booked slots cannot be deleted" : "Delete time slot"
            }
            type="button"
            aria-label={`Delete ${slot.startTime} time slot`}
            onClick={() => {
              if (confirm("Delete this time slot?"))
                void mutate(`slots/${slot.id}`, "DELETE");
            }}
          >
            <Trash2 size={17} />
          </button>
        )}
      </div>
    </form>
  );
}
