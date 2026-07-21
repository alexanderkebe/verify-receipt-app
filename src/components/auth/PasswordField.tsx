'use client';

import { useState } from 'react';
import styles from './PasswordField.module.css';

interface PasswordFieldProps {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password' | 'off';
  placeholder?: string;
  minLength?: number;
  description?: string;
  required?: boolean;
  autoFocus?: boolean;
}

export default function PasswordField({
  id,
  name,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  minLength,
  description,
  required = false,
  autoFocus = false,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <div className="input-group">
      <label className="input-label" htmlFor={id}>
        {label}{required && <span className="required">*</span>}
      </label>
      <div className={styles.fieldWrap}>
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          className={`input-field ${styles.input}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          minLength={minLength}
          aria-describedby={descriptionId}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          required={required}
        />
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()} as plain text`}
          aria-pressed={visible}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
      {description && <span id={descriptionId} className="input-help">{description}</span>}
    </div>
  );
}
