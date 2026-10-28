// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OutOfCreditsSheet } from "./OutOfCreditsSheet";

afterEach(cleanup);

describe("OutOfCreditsSheet", () => {
  it("explains that the free edits are used up and that your designs are safe", () => {
    render(<OutOfCreditsSheet onClose={vi.fn()} onDownload={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: /used all your free edits/i });
    expect(dialog.textContent).toMatch(/designs are saved/i);
    expect(dialog.textContent).toMatch(/coming soon/i);
  });

  it("lets you download the current design or close it", () => {
    const onClose = vi.fn();
    const onDownload = vi.fn();
    render(<OutOfCreditsSheet onClose={onClose} onDownload={onDownload} />);
    fireEvent.click(screen.getByRole("button", { name: /download this design/i }));
    expect(onDownload).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /got it/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes with the Escape key", () => {
    const onClose = vi.fn();
    render(<OutOfCreditsSheet onClose={onClose} onDownload={vi.fn()} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
