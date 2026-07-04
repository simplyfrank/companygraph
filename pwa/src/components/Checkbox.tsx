import type { ChangeEvent } from "react";
import styles from "./Checkbox.module.css";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  label?: string;
}

export function Checkbox({
  checked,
  onChange,
  disabled = false,
  id,
  label,
}: CheckboxProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked);
  };

  const checkbox = (
    <div
      className={styles.checkbox}
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onChange(!checked)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!disabled) onChange(!checked);
        }
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        disabled={disabled}
        id={id}
        className={styles.input}
      />
      <div className={`${styles.box} ${checked ? styles.checked : ""}`} />
    </div>
  );

  if (label) {
    return (
      <label className={styles.label}>
        {checkbox}
        <span className={styles.labelText}>{label}</span>
      </label>
    );
  }

  return checkbox;
}
