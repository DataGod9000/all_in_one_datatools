import { useState, useRef, useEffect } from 'react';

export interface AppSelectOption {
  value: string;
  label: string;
}

interface AppSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: AppSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  className?: string;
}

export function AppSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  id,
  'aria-label': ariaLabel,
  className = '',
}: AppSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = options.find((o) => o.value === value);
  const label = selected?.label ?? value ?? '';
  const displayLabel = value ? label : (placeholder ?? '');

  return (
    <div ref={ref} className={`app-select-wrap ${className}`.trim()}>
      <button
        type="button"
        id={id}
        className="app-select-trigger"
        onClick={() => !disabled && setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel ?? 'Select'}
        disabled={disabled}
      >
        <span className="app-select-value">{displayLabel || '—'}</span>
        <span className="app-select-arrow">▼</span>
      </button>
      {open && !disabled && (
        <ul className="app-select-dropdown" role="listbox" tabIndex={-1}>
          {placeholder && (
            <li
              role="option"
              aria-selected={!value}
              className={`app-select-option ${!value ? 'selected' : ''}`}
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              {!value && <span className="app-select-check">✓</span>}
              {placeholder}
            </li>
          )}
          {options.map((opt) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={`app-select-option ${opt.value === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.value === value && <span className="app-select-check">✓</span>}
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
