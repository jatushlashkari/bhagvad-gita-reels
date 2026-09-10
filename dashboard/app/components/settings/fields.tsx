'use client';
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

export function NumberField({
  label, hint, value, min, max, onChange, error,
}: {
  label: string; hint?: string; value: number; min: number; max: number;
  onChange: (v: number) => void; error?: string;
}) {
  return (
    <label className="block">
      <span className={labelClass}>
        {label}
        {hint && <span className="ml-1 tracking-normal text-muted">{hint}</span>}
      </span>
      <input
        type="number"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`mt-1 ${selectClass} ${error ? 'border-danger' : ''}`}
      />
      <FieldError message={error} />
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
