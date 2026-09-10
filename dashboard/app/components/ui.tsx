'use client';

// The dashboard's existing design tokens (see GeneratePanel/Library), pulled into one place
// because all four Studio panels need the same ones and a fourfold copy of the same class string
// is exactly how two panels end up subtly different after the first tweak.

export const panelClass = 'rounded-xl border border-line bg-surface p-4';
export const headingClass = 'text-[11px] font-medium uppercase tracking-[0.18em] text-muted';
export const selectClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40';
export const buttonClass =
  'rounded-lg bg-accent px-4 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50';
export const ghostButtonClass =
  'rounded-lg border border-accent/50 px-3 py-1.5 text-sm text-accent-text transition-colors hover:bg-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-40';
export const iconButtonClass =
  'rounded border border-line px-1.5 py-0.5 text-[11px] leading-none text-muted transition-colors hover:border-accent/50 hover:text-accent-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-30';
export const rangeClass = 'mt-1 w-full accent-accent';
export const labelClass = 'text-[10px] uppercase tracking-[0.18em] text-muted';

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelClass}>
        {label}
        {hint && <span className="ml-1 tracking-normal text-accent-text/50">{hint}</span>}
      </span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  digits = 2,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  digits?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className={labelClass}>{label}</span>
        <span className="text-[11px] tabular-nums text-accent-text">{value.toFixed(digits)}</span>
      </span>
      <input
        type="range"
        aria-label={label}
        className={rangeClass}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-fg">
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-accent"
      />
      {label}
    </label>
  );
}
