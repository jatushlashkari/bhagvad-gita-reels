'use client';
import type { ReelStyle } from '../../../../shared/reel-style.ts';
import { BEAT_FONTS, FONT_LABELS, KICKER_FONTS } from '../../../../shared/font-map.ts';
import { Field, Slider, Toggle, buttonClass, headingClass, panelClass, selectClass } from './ui.tsx';

const colorClass = 'h-9 w-full cursor-pointer rounded-lg border border-white/10 bg-[#0d0817] p-1';

export function StyleControls({
  style,
  onChange,
  onSave,
  saving,
  saved,
  error,
}: {
  style: ReelStyle;
  onChange: (patch: Partial<ReelStyle>) => void;
  onSave: () => void;
  saving: boolean;
  /** The style the server actually wrote (post-clamp), echoed back so a value the validator
   *  adjusted is visible rather than silently different from what the form shows. */
  saved: ReelStyle | null;
  error: string | null;
}) {
  return (
    <section className={panelClass}>
      <h2 className={headingClass}>Look</h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="beat font">
          <select
            aria-label="beat font"
            className={selectClass}
            value={style.beatFont}
            onChange={(e) => onChange({ beatFont: e.target.value as ReelStyle['beatFont'] })}
          >
            {BEAT_FONTS.map((f) => (
              <option key={f} value={f}>{FONT_LABELS[f]}</option>
            ))}
          </select>
        </Field>

        <Field label="kicker font">
          <select
            aria-label="kicker font"
            className={selectClass}
            value={style.kickerFont}
            onChange={(e) => onChange({ kickerFont: e.target.value as ReelStyle['kickerFont'] })}
          >
            {KICKER_FONTS.map((f) => (
              <option key={f} value={f}>{FONT_LABELS[f]}</option>
            ))}
          </select>
        </Field>

        <Field label="ken burns">
          <select
            aria-label="ken burns"
            className={selectClass}
            value={style.kenBurns}
            onChange={(e) => onChange({ kenBurns: e.target.value as ReelStyle['kenBurns'] })}
          >
            <option value="off">Off</option>
            <option value="gentle">Gentle</option>
            <option value="strong">Strong</option>
          </select>
        </Field>

        <Field label="transition">
          <select
            aria-label="transition"
            className={selectClass}
            value={style.transition}
            onChange={(e) => onChange({ transition: e.target.value as ReelStyle['transition'] })}
          >
            <option value="crossfade">Crossfade (overlap)</option>
            <option value="sequential">Sequential (fade out, gap, fade in)</option>
          </select>
        </Field>

        <Field label="text colour">
          <input
            type="color"
            aria-label="text colour"
            className={colorClass}
            value={style.textColor}
            onChange={(e) => onChange({ textColor: e.target.value })}
          />
        </Field>

        <Field label="accent colour">
          <input
            type="color"
            aria-label="accent colour"
            className={colorClass}
            value={style.accentColor}
            onChange={(e) => onChange({ accentColor: e.target.value })}
          />
        </Field>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Slider
          label="beat size"
          digits={0}
          min={40}
          max={96}
          step={1}
          value={style.beatSizePx}
          onChange={(beatSizePx) => onChange({ beatSizePx })}
        />
        <Slider
          label="scrim strength"
          min={0}
          max={1}
          step={0.05}
          value={style.scrimStrength}
          onChange={(scrimStrength) => onChange({ scrimStrength })}
        />
        <Slider
          label="duration scale"
          min={0.7}
          max={1.5}
          step={0.05}
          value={style.durationScale}
          onChange={(durationScale) => onChange({ durationScale })}
        />
        <Slider
          label="fade"
          min={0.2}
          max={0.8}
          step={0.05}
          value={style.crossfadeSec}
          onChange={(crossfadeSec) => onChange({ crossfadeSec })}
        />
        {style.transition === 'sequential' && (
          <Slider
            label="gap"
            min={0}
            max={1.5}
            step={0.05}
            value={style.gapSec}
            onChange={(gapSec) => onChange({ gapSec })}
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-5">
        <Toggle label="show kicker" checked={style.showKicker} onChange={(showKicker) => onChange({ showKicker })} />
        <Toggle label="show handle" checked={style.showHandle} onChange={(showHandle) => onChange({ showHandle })} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className={buttonClass} disabled={saving} onClick={onSave}>
          {saving ? 'Saving…' : 'Save as channel style'}
        </button>
        <span className="text-xs text-[#a89f8d]">writes styles/cinema.json — every later render starts here</span>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      {saved && !error && (
        <pre
          data-testid="saved-style"
          className="mt-3 max-h-56 overflow-auto rounded-lg bg-[#0d0817] p-3 font-mono text-[11px] leading-relaxed text-[#a89f8d] ring-1 ring-white/5"
        >
          {JSON.stringify(saved, null, 2)}
        </pre>
      )}
    </section>
  );
}
