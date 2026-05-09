import { useEffect, useCallback } from "react";
import Portal from "./Portal";
import { TRANSMISSION_HEADER } from "@/lib/ufos";

interface TransmissionModalProps {
  text: string | null;
  onClose: () => void;
  onAnother?: () => void;
}

export default function TransmissionModal({
  text,
  onClose,
  onAnother,
}: TransmissionModalProps) {
  // Keyboard handler — Escape closes
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!text) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [text, handleKeyDown]);

  if (!text) return null;

  return (
    <Portal>
    <div
      className="tx-overlay"
      data-testid="tx-overlay"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Intercepted Transmission"
        className="tx-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* UFO animated border ring is applied via ::before on .tx-modal */}

        {/* Header */}
        <div className="tx-header" data-testid="tx-header">
          {TRANSMISSION_HEADER}
        </div>

        {/* Body with decode shimmer */}
        <div className="tx-body" data-testid="tx-body">
          {text}
        </div>

        {/* Actions */}
        <div className="tx-actions">
          {onAnother && (
            <button
              className="tx-btn tx-btn-another"
              onClick={onAnother}
              type="button"
            >
              [ DECRYPT ANOTHER ]
            </button>
          )}
          <button
            className="tx-btn tx-btn-close"
            onClick={onClose}
            type="button"
            aria-label="Close transmission"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
}
