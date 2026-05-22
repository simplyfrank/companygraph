import styles from "./GreyBlock.module.css";

interface GreyBlockProps {
  label: string;
  height?: string | number;
}

export function GreyBlock({ label, height }: GreyBlockProps) {
  const style: React.CSSProperties = {};
  if (typeof height === "number") style.minHeight = `${height}px`;
  else if (typeof height === "string") style.minHeight = height;
  return (
    <div className={styles.grey} style={style}>
      {label}
    </div>
  );
}
