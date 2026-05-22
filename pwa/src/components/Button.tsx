import type { ReactNode } from "react";
import styles from "./Button.module.css";

type Tone = "default" | "primary" | "ghost" | "danger";

interface ButtonProps {
  tone?: Tone;
  onClick?: () => void;
  href?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  children: ReactNode;
}

export function Button({
  tone = "default",
  onClick,
  href,
  type = "button",
  disabled,
  children,
}: ButtonProps) {
  const className = `${styles.btn} ${styles[tone]}`;
  if (href) {
    return (
      <a className={className} href={href}>
        {children}
      </a>
    );
  }
  return (
    <button className={className} type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
