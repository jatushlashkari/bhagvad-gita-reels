'use client';
import { useEffect, useState } from 'react';
import { labelClass, selectClass } from '../ui.tsx';

export function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-xs text-danger">{message}</p> : null;
}

export function TextField({
  label, hint, value, onChange, error, placeholder, maxLength,
}: {
  label: string; hint?: string; value: string; onChange: (v: string) => void;
  error?: string; placeholder?: string; maxLength?: number;
}) {
  return (
    <label className="block">
      <span className={labelClass}>
        {label}
        {hint && <span className="ml-1 tracking-normal text-muted">{hint}</span>}
      </span>
      <input
        aria-label={label}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 ${selectClass} ${error ? 'border-danger' : ''}`}
      />
      <FieldError message={error} />
    </label>
  );
}

/** An empty box parses to NaN, never to 0: `Number('')` is 0, so parsing straight off the DOM
 *  turned a cleared field into a number nobody typed — which then failed the field's own range
 *  rule with no way back to an empty box. NaN never leaves the form: every caller runs the
 *  shared validator, which refuses a non-integer, so Save stays disabled while it is empty. */
function parseNumberField(raw: string): number {
  return raw.trim() === '' ? Number.NaN : Number(raw);
}

export function NumberField({
  label, hint, value, min, max, onChange, error,
}: {
  label: string; hint?: string; value: number; min: number; max: number;
  /** NaN while the box is empty — see parseNumberField. */
  onChange: (v: number) => void; error?: string;
}) {
  // The raw string is what the input shows; the number is derived from it. That is the whole
  // point: a controlled `value={someNumber}` cannot represent "the box is empty".
  const [text, setText] = useState(() => String(value));
  // Adopt a `value` that changed from outside — a save adopting what the server wrote, or a
  // sibling card's resync. Skipped while the box already parses to that same number, so typing
  // is never echoed back and reformatted mid-edit. `text` is read here but deliberately not a
  // dependency: this effect exists only to react to an external change.
  useEffect(() => {
    if (!Object.is(parseNumberField(text), value)) setText(Number.isFinite(value) ? String(value) : '');
  }, [value]);

  // An empty box is "you have not answered yet", not "99 is out of range" — say so plainly
  // rather than showing the range rule against a field the user just cleared.
  const message = text.trim() === '' ? 'required' : error;
  return (
    <label className="block">
      <span className={labelClass}>
        {label}
        {hint && <span className="ml-1 tracking-normal text-muted">{hint}</span>}
      </span>
      <input
        type="number"
        aria-label={label}
        value={text}
        min={min}
        max={max}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseNumberField(e.target.value));
        }}
        className={`mt-1 ${selectClass} ${message ? 'border-danger' : ''}`}
      />
      <FieldError message={message} />
    </label>
  );
}

export function TimeField({
  label, value, onChange, error,
}: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input
        type="time"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 ${selectClass} ${error ? 'border-danger' : ''}`}
      />
      <FieldError message={error} />
    </label>
  );
}

export function SelectField({
  label, hint, value, options, onChange, error,
}: {
  label: string; hint?: string; value: string; options: { value: string; label: string }[];
  onChange: (v: string) => void; error?: string;
}) {
  return (
    <label className="block">
      <span className={labelClass}>
        {label}
        {hint && <span className="ml-1 tracking-normal text-muted">{hint}</span>}
      </span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={`mt-1 ${selectClass} ${error ? 'border-danger' : ''}`}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <FieldError message={error} />
    </label>
  );
}

export function CheckboxRow({
  label, hint, checked, onChange,
}: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm text-fg">
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 accent-accent"
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}
