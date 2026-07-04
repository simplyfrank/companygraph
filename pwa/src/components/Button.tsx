import type { ReactNode } from "react";
import styles from "./Button.module.css";

type Tone = "default" | "primary" | "ghost" | "danger";

interface ButtonProps {
  tone?: Tone;
  onClick?: () => void;
  href?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  // system-augmentation-model T-13 — additive toggle-state affordance:
  // renders `aria-pressed` when provided (undefined omits the attribute,
  // so every existing call site renders unchanged). No styling change —
  // the 28px house size stands (DD-09).
  pressed?: boolean;
  children: ReactNode;
}

export function Button({
  tone = "default",
  onClick,
  href,
  type = "button",
  disabled,
  pressed,
  children,
}: ButtonProps) {
  const className = `${styles.btn} ${styles[tone]}`;
  if (href) {
    return (
      <a className={className} href={href} aria-pressed={pressed}>
        {children}
      </a>
    );
  }
  return (
    <button
      className={className}
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
    >
      {children}
    </button>
  );
}
