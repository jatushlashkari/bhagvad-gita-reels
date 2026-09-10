'use client';
import { PROMPT_PREFIX_MAX, type ReelStyle } from '../../../../shared/reel-style.ts';
import { BEAT_FONTS, FONT_LABELS, KICKER_FONTS } from '../../../../shared/font-map.ts';
import { Field, Slider, Toggle, labelClass, selectClass } from '../ui.tsx';

const colorClass = 'h-9 w-full cursor-pointer rounded-lg border border-line bg-surface p-1';

export const ROTATION_NOTE = 'preview plays silent; the daily render picks a track per verse';

const MUSIC_MODES: { value: ReelStyle['musicMode']; label: string }[] = [
  { value: 'silent', label: 'Silent' },
  { value: 'track', label: 'This track' },
  { value: 'rotation', label: 'Rotation' },
];

/** Every field of the saved channel style — the one place they exist, so Settings' channel
 *  style card and Studio's per-render override panel can never drift apart. No card chrome,
 *  no Save, no preview: the two callers decide what the fields sit inside and what "save" means. */
export function StyleFields({
  style,
  tracks,
  onChange,
}: {
  style: ReelStyle;
  tracks: { file: string }[];
  onChange: (patch: Partial<ReelStyle>) => void;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
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

        {/* Art direction only — it is prepended to every image prompt, curated or generated,
            so the whole channel stays in one visual language (see shared/prompts.ts). */}
        <div className="sm:col-span-2">
          <Field label="prompt prefix" hint="≤200">
            <input
              aria-label="prompt prefix"
              className={selectClass}
              maxLength={PROMPT_PREFIX_MAX}
              value={style.promptPrefix}
              onChange={(e) => onChange({ promptPrefix: e.target.value })}
            />
          </Field>
        </div>
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

      <div className="mt-5">
        <p className={labelClass}>music</p>
        <div className="mt-2 flex flex-wrap gap-4">
          {MUSIC_MODES.map((m) => (
            <label key={m.value} className="flex items-center gap-2 text-sm text-fg">
              <input
                type="radio"
                name="music-mode"
                aria-label={`music ${m.value}`}
                className="size-4 accent-accent"
                checked={style.musicMode === m.value}
                onChange={() => onChange({ musicMode: m.value })}
              />
              {m.label}
            </label>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="track">
            <select
              aria-label="track"
              className={selectClass}
              disabled={style.musicMode !== 'track'}
              value={style.musicFile ?? ''}
              onChange={(e) => onChange({ musicFile: e.target.value || null })}
            >
              <option value="">— none —</option>
              {tracks.map((t) => (
                <option key={t.file} value={t.file}>
                  {t.file}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {style.musicMode === 'rotation' && <p className="mt-3 text-xs text-accent-text/70">{ROTATION_NOTE}</p>}
        {style.musicMode === 'track' && tracks.length === 0 && (
          <p className="mt-3 text-xs text-muted">no tracks in the pool yet — add an mp3 in Studio's Media panel</p>
        )}
      </div>
    </>
  );
}
