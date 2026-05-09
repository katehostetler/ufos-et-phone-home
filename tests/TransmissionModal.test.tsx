import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TransmissionModal from "@/components/TransmissionModal";
import { TRANSMISSION_HEADER } from "@/lib/ufos";

describe("TransmissionModal", () => {
  it("renders nothing when text is null", () => {
    const { container } = render(
      <TransmissionModal text={null} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the dialog when text is provided", () => {
    render(
      <TransmissionModal
        text="TEST SIGNAL DETECTED"
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders the transmission header", () => {
    render(
      <TransmissionModal
        text="SOME TRANSMISSION"
        onClose={vi.fn()}
      />
    );
    expect(screen.getByTestId("tx-header")).toHaveTextContent(TRANSMISSION_HEADER);
  });

  it("renders the transmission body text", () => {
    const bodyText = "THEY ARE WATCHING THE FREQUENCIES.";
    render(
      <TransmissionModal text={bodyText} onClose={vi.fn()} />
    );
    expect(screen.getByTestId("tx-body")).toHaveTextContent(bodyText);
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <TransmissionModal text="SIGNAL ACTIVE" onClose={onClose} />
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when the backdrop overlay is clicked", () => {
    const onClose = vi.fn();
    render(
      <TransmissionModal text="SIGNAL ACTIVE" onClose={onClose} />
    );
    fireEvent.click(screen.getByTestId("tx-overlay"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does NOT call onClose when the modal dialog itself is clicked", () => {
    const onClose = vi.fn();
    render(
      <TransmissionModal text="SIGNAL ACTIVE" onClose={onClose} />
    );
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders [ DECRYPT ANOTHER ] button when onAnother is provided", () => {
    const onAnother = vi.fn();
    render(
      <TransmissionModal
        text="SIGNAL"
        onClose={vi.fn()}
        onAnother={onAnother}
      />
    );
    const btn = screen.getByText("[ DECRYPT ANOTHER ]");
    expect(btn).toBeInTheDocument();
  });

  it("calls onAnother when [ DECRYPT ANOTHER ] is clicked", () => {
    const onAnother = vi.fn();
    render(
      <TransmissionModal
        text="SIGNAL"
        onClose={vi.fn()}
        onAnother={onAnother}
      />
    );
    fireEvent.click(screen.getByText("[ DECRYPT ANOTHER ]"));
    expect(onAnother).toHaveBeenCalledOnce();
  });

  it("does NOT render [ DECRYPT ANOTHER ] when onAnother is not provided", () => {
    render(
      <TransmissionModal text="SIGNAL" onClose={vi.fn()} />
    );
    expect(screen.queryByText("[ DECRYPT ANOTHER ]")).not.toBeInTheDocument();
  });

  it("removes keydown listener when text becomes null (unmounted)", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <TransmissionModal text="SIGNAL" onClose={onClose} />
    );
    rerender(<TransmissionModal text={null} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
