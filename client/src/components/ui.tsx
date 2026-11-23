import { useEffect, useState, type ReactNode } from 'react';
import { clamp } from '@shared/geometry';

interface NumberFieldProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  decimals?: number;
  onCommit: (value: number) => void;
}

export function NumberField({
  label,
  value,
  min,
  max,
  step = 0.1,
  suffix,
  decimals = 2,
  onCommit,
}: NumberFieldProps) {
  const format = (input: number): string => {
    const rounded = Number(input.toFixed(decimals));
    return String(rounded).replace('.', ',');
  };
  const [text, setText] = useState(() => format(value));

  useEffect(() => {
    setText(format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals]);

  const commit = (): void => {
    const parsed = Number(text.replace(',', '.').replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(parsed)) {
      setText(format(value));
      return;
    }
    const next = clamp(parsed, min ?? -Infinity, max ?? Infinity);
    onCommit(next);
    setText(format(next));
  };

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="input-group">
        <input
          className="input"
          inputMode="decimal"
          value={text}
          step={step}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
              (event.target as HTMLInputElement).blur();
            }
            if (event.key === 'Escape') setText(format(value));
          }}
        />
        {suffix ? <span className="input-suffix">{suffix}</span> : null}
      </span>
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="toggle-row">
      <div>
        <div style={{ fontSize: 13 }}>{label}</div>
        {hint ? <div className="tiny muted">{hint}</div> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`switch ${checked ? 'on' : ''}`}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-title">
        <span>{title}</span>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {children}
    </div>
  );
}
