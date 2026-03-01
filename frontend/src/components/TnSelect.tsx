import { useState, useRef, useEffect } from 'react';

interface Option {
  value: string;
  label: string;
}

interface TnSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  id?: string;
  className?: string;
}

export function TnSelect({ value, onChange, options, id, className = '' }: TnSelectProps) {
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
  const label = selected?.label ?? value;

  return (
    <div ref={ref} className={`tn-select-wrap ${className}`.trim()}>
      <button
        type="button"
        id={id}
        className="tn-select-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select"
      >
        <span className="tn-select-value">{label}</span>
        <span className="tn-select-arrow">▼</span>
      </button>
      {open && (
        <ul
          className="tn-select-dropdown"
          role="listbox"
          tabIndex={-1}
        >
          {options.map((opt) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={`tn-select-option ${opt.value === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.value === value && <span className="tn-select-check">✓</span>}
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
