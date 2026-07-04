import { useEffect, useRef } from "react";
import { FocusTrap } from "focus-trap-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  disableFocusTrap?: boolean; // For testing
}

export function Modal({ isOpen, onClose, title, children, disableFocusTrap = false }: ModalProps) {
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Store the previously focused element to restore focus later
      previousActiveElement.current = document.activeElement as HTMLElement;
      // Prevent body scroll when modal is open
      document.body.style.overflow = "hidden";
    } else {
      // Restore body scroll
      document.body.style.overflow = "";
      // Restore focus to the previously focused element
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="modal-content"
      style={{
        backgroundColor: "var(--surface)",
        borderRadius: "8px",
        maxWidth: "500px",
        width: "90%",
        maxHeight: "90vh",
        overflow: "auto",
        boxShadow: "0 1px 3px color-mix(in oklch, var(--fg) 5%, transparent)",
      }}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabIndex={-1}
    >
      <div
        style={{
          padding: "16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2 id="modal-title" style={{ margin: 0, fontSize: "var(--type-h2-size)" }}>
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            fontSize: "20px",
            cursor: "pointer",
            padding: "4px",
          }}
          aria-label="Close modal"
          tabIndex={0}
        >
          ×
        </button>
      </div>
      <div style={{ padding: "16px" }}>{children}</div>
    </div>
  );

  return (
    <div
      className="modal-backdrop"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      {disableFocusTrap ? modalContent : <FocusTrap>{modalContent}</FocusTrap>}
    </div>
  );
}