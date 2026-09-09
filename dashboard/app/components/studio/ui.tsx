'use client';

// The dashboard's existing design tokens (see GeneratePanel/Library), pulled into one place
// because all four Studio panels need the same ones and a fourfold copy of the same class string
// is exactly how two panels end up subtly different after the first tweak.

export const panelClass = 'rounded-xl bg-[#161028] p-4 ring-1 ring-white/5';
export const headingClass = 'text-[11px] font-medium uppercase tracking-[0.18em] text-[#a89f8d]';
export const selectClass =
  'w-full rounded-lg border border-white/10 bg-[#0d0817] px-3 py-2 text-sm text-[#f5efe0] focus:border-[#e8c874]/60 focus:outline-none focus:ring-2 focus:ring-[#e8c874]/40';
export const buttonClass =
  'rounded-lg bg-[#e8c874] px-4 py-2 text-sm font-medium text-[#0d0817] transition-colors hover:bg-[#f2d894] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e8c874]/60 disabled:opacity-50';
export const ghostButtonClass =
  'rounded-lg border border-[#e8c874]/40 px-3 py-1.5 text-sm text-[#e8c874] transition-colors hover:bg-[#e8c874]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e8c874]/60 disabled:opacity-40';
export const iconButtonClass =
  'rounded border border-white/10 px-1.5 py-0.5 text-[11px] leading-none text-[#a89f8d] transition-colors hover:border-[#e8c874]/40 hover:text-[#e8c874] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e8c874]/60 disabled:opacity-30';
export const rangeClass = 'mt-1 w-full accent-[#e8c874]';
export const labelClass = 'text-[10px] uppercase tracking-[0.18em] text-[#a89f8d]';

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelClass}>
        {label}
        {hint && <span className="ml-1 tracking-normal text-[#e8c874]/50">{hint}</span>}
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
        <span className="text-[11px] tabular-nums text-[#e8c874]">{value.toFixed(digits)}</span>
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
    <label className="flex items-center gap-2 text-sm text-[#f5efe0]">
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[#e8c874]"
      />
      {label}
    </label>
  );
}
