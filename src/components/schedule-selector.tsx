import { CalendarDays, Check, Info } from "lucide-react";
import { formatDate, isFutureSlot } from "@/utils/format";
import type { InterviewDate } from "@/types";
interface Props {
  dates: InterviewDate[];
  dateId: string;
  slotId: string;
  loading: boolean;
  instructions: string;
  refresh: () => Promise<void>;
  onDateChange: (id: string) => void;
  onSlotChange: (id: string) => void;
}
export function ScheduleSelector({
  dates,
  dateId,
  slotId,
  loading,
  instructions,
  refresh,
  onDateChange,
  onSlotChange,
}: Props) {
  const selectedDate = dates.find((d) => d.id === dateId);
  const availableDates = dates.filter((d) =>
    d.slots.some((s) => isFutureSlot(d.date, s.startTime)),
  );
  return (
    <>
      {" "}
      <div className="field">
        <label>Interview date</label>
        <div className="date-grid">
          {availableDates.map((d) => (
            <button
              type="button"
              key={d.id}
              className={`date-option ${dateId === d.id ? "selected" : ""}`}
              onClick={() => {
                onDateChange(d.id);
              }}
              aria-pressed={dateId === d.id}
            >
              <CalendarDays size={19} />
              <span>{formatDate(d.date)}</span>
              {dateId === d.id && <Check size={16} />}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <p className="empty">Loading interview times…</p>
      ) : availableDates.length === 0 ? (
        <div className="empty">
          <CalendarDays size={28} />
          <h3>No interviews available yet</h3>
          <p>Please check back soon for new dates.</p>
          <button
            type="button"
            className="btn secondary"
            onClick={() => void refresh()}
          >
            Refresh availability
          </button>
        </div>
      ) : null}
      {selectedDate && (
        <div className="field time-field">
          <label>
            Interview time <span className="optional">WIB · UTC+7</span>
          </label>
          <div className="time-grid">
            {selectedDate.slots.map((s) => {
              const remaining = s.capacity - s.registeredCount,
                past = !isFutureSlot(selectedDate.date, s.startTime);
              return (
                <button
                  type="button"
                  key={s.id}
                  disabled={remaining === 0 || past}
                  className={`time-option ${slotId === s.id ? "selected" : ""}`}
                  aria-pressed={slotId === s.id}
                  onClick={() => {
                    onSlotChange(s.id);
                  }}
                >
                  <strong>
                    {s.startTime} – {s.endTime}
                  </strong>
                  <span>
                    {past
                      ? "Unavailable"
                      : remaining === 0
                        ? "Full"
                        : `${remaining} ${remaining === 1 ? "place" : "places"} left`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <p className="live-note">
        <span /> Availability refreshes automatically
      </p>
      {instructions && (
        <div className="info-box">
          <Info size={18} />
          <p>{instructions}</p>
        </div>
      )}
    </>
  );
}
