"use client";
import { useEffect, useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  Plus,
  Save,
  Trash2,
  Check,
  AlignLeft,
} from "lucide-react";
import { api } from "@/services/api";
import {
  fieldTypes,
  type FormConfig,
  type FormField,
  type FieldType,
} from "@/types";
export function FormEditor() {
  const [config, setConfig] = useState<FormConfig | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [dirty, setDirty] = useState(false);
  const load = () =>
    api
      .form()
      .then(setConfig)
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  function update(patch: Partial<FormConfig>) {
    setConfig((c) => (c ? { ...c, ...patch } : c));
    setSaved(false);
    setDirty(true);
  }
  function updateField(id: string, patch: Partial<FormField>) {
    if (config)
      update({
        fields: config.fields.map((f) =>
          f.id === id ? { ...f, ...patch } : f,
        ),
      });
  }
  function reorder(index: number, offset: number) {
    if (!config) return;
    const fields = [...config.fields];
    [fields[index], fields[index + offset]] = [
      fields[index + offset],
      fields[index],
    ];
    update({ fields: fields.map((f, order) => ({ ...f, order })) });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!config || busy) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      setConfig(await api.saveForm(config));
      setSaved(true);
      setDirty(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!config)
    return (
      <div className="empty">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button className="btn secondary" onClick={() => void load()}>
              Try again
            </button>
          </>
        ) : (
          "Loading form configuration…"
        )}
      </div>
    );
  return (
    <form onSubmit={save}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">SET THE TONE</div>
          <h1>A form that feels like you.</h1>
          <p>Shape what participants see and the details you need.</p>
        </div>
        <button className="btn primary" disabled={busy}>
          <Save size={17} />
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="notice" role="status">
          <Check size={17} /> Your public form is up to date.
        </p>
      )}
      <fieldset disabled={busy} className="form-fieldset">
        <section className="panel padded">
          <div className="panel-section-heading">
            <span className="stat-icon blue-bg">
              <AlignLeft size={22} />
            </span>
            <div>
              <h2>A warm welcome</h2>
              <p className="muted">
                The header at the top of your public form.
              </p>
            </div>
          </div>
          <div className="field">
            <label htmlFor="title">Form title</label>
            <input
              id="title"
              value={config.title}
              onChange={(e) => update({ title: e.target.value })}
              maxLength={200}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              rows={2}
              value={config.description}
              onChange={(e) => update({ description: e.target.value })}
              maxLength={2000}
            />
          </div>
          <div className="field">
            <label htmlFor="instructions">Additional instructions</label>
            <textarea
              id="instructions"
              rows={3}
              value={config.instructions}
              onChange={(e) => update({ instructions: e.target.value })}
              maxLength={4000}
            />
            <small>Shown when participants choose their interview time.</small>
          </div>
        </section>
        <section className="panel padded">
          <div className="panel-toolbar field-toolbar">
            <div>
              <h2>
                Personal information fields{" "}
                <span className="count">{config.fields.length}</span>
              </h2>
              <p className="muted">
                Add, arrange, and refine. Changes go live when you save.
              </p>
            </div>
            <button
              className="btn secondary"
              type="button"
              disabled={config.fields.length >= 50}
              onClick={() =>
                update({
                  fields: [
                    ...config.fields,
                    {
                      id: crypto.randomUUID(),
                      label: "New field",
                      type: "text",
                      required: false,
                      order: config.fields.length,
                      options: [],
                    },
                  ],
                })
              }
            >
              <Plus size={16} /> Add field
            </button>
          </div>
          <div className="field name-mapping">
            <label htmlFor="name-field">
              Full-name field for the responses table
            </label>
            <select
              id="name-field"
              value={config.nameFieldId || ""}
              onChange={(e) => update({ nameFieldId: e.target.value || null })}
            >
              <option value="">Select a required text field</option>
              {config.fields
                .filter((f) => f.type === "text" && f.required)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
            </select>
            <small>
              This connects your dynamic form to the applicant’s display name.
            </small>
          </div>
          {config.fields.map((f, index) => (
            <div className="field-editor" key={f.id}>
              <div className="field-number">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="field-editor-body">
                <div className="field-editor-grid">
                  <label>
                    <span>Field label</span>
                    <input
                      aria-label={`Field ${index + 1} label`}
                      value={f.label}
                      maxLength={120}
                      required
                      onChange={(e) =>
                        updateField(f.id, { label: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>Field type</span>
                    <select
                      value={f.type}
                      aria-label={`Field ${index + 1} type`}
                      onChange={(e) =>
                        updateField(f.id, { type: e.target.value as FieldType })
                      }
                    >
                      {fieldTypes.map((t) => (
                        <option key={t} value={t}>
                          {
                            {
                              text: "Text",
                              email: "Email",
                              tel: "Phone number",
                              number: "Number",
                              textarea: "Long text",
                              select: "Dropdown",
                            }[t]
                          }
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {f.type === "select" && (
                  <label className="options-editor">
                    <span>Options (one per line)</span>
                    <textarea
                      rows={3}
                      value={f.options.join("\n")}
                      onChange={(e) =>
                        updateField(f.id, {
                          options: e.target.value.split("\n"),
                        })
                      }
                    />
                  </label>
                )}
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={f.required}
                    onChange={(e) =>
                      updateField(f.id, { required: e.target.checked })
                    }
                  />{" "}
                  Required field
                </label>
              </div>
              <div className="field-tools">
                <button
                  type="button"
                  className="icon-button"
                  disabled={index === 0}
                  aria-label={`Move ${f.label} up`}
                  onClick={() => reorder(index, -1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={index === config.fields.length - 1}
                  aria-label={`Move ${f.label} down`}
                  onClick={() => reorder(index, 1)}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label={`Delete ${f.label}`}
                  onClick={() => {
                    if (
                      confirm(
                        `Remove “${f.label}”? Existing responses will keep their answers.`,
                      )
                    )
                      update({
                        fields: config.fields.filter(
                          (field) => field.id !== f.id,
                        ),
                        nameFieldId:
                          config.nameFieldId === f.id
                            ? null
                            : config.nameFieldId,
                      });
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
          {!config.fields.length && (
            <div className="empty">
              Add a field to start building your form.
            </div>
          )}
        </section>
      </fieldset>
    </form>
  );
}
