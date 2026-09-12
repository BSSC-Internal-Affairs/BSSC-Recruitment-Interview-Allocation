import type { FormField } from "@/types";
export function DynamicField({
  field,
  value,
  onChange,
  error,
}: {
  field: FormField;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const props = {
    id: field.id,
    name: field.id,
    value,
    onChange: (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) => onChange(e.target.value),
    required: field.required,
    "aria-invalid": !!error,
    "aria-describedby": error ? `${field.id}-error` : undefined,
  };
  return (
    <div className={field.type === "textarea" ? "field wide" : "field"}>
      <label htmlFor={field.id}>
        {field.label}{" "}
        {field.required ? (
          <span className="required">*</span>
        ) : (
          <span className="optional">optional</span>
        )}
      </label>
      {field.type === "textarea" ? (
        <textarea
          {...props}
          rows={3}
          maxLength={4000}
          placeholder="Tell us a little more…"
        />
      ) : field.type === "select" ? (
        <select {...props}>
          <option value="">Select an option</option>
          {field.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          {...props}
          type={field.type}
          step={field.type === "number" ? "any" : undefined}
          maxLength={4000}
          placeholder={`Enter ${field.label.toLowerCase()}`}
          autoComplete={
            field.type === "email"
              ? "email"
              : field.type === "tel"
                ? "tel"
                : "off"
          }
        />
      )}{" "}
      {error && (
        <p className="field-error" id={`${field.id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
