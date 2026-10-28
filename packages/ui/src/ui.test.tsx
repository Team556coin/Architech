import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BeforeAfterSlider, Chip, Segmented, StageList, Switch } from "./index";

afterEach(cleanup);

describe("BeforeAfterSlider", () => {
  it("starts in the middle and moves with the arrow keys", () => {
    const onChange = vi.fn();
    render(<BeforeAfterSlider before="/b.jpg" after="/a.jpg" aspect={1.5} onChange={onChange} />);
    const handle = screen.getByRole("slider", { name: /compare/i });
    expect(handle.getAttribute("aria-valuenow")).toBe("50");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(handle.getAttribute("aria-valuenow")).toBe("55");
    fireEvent.keyDown(handle, { key: "Home" });
    expect(handle.getAttribute("aria-valuenow")).toBe("0");
    expect(onChange).toHaveBeenLastCalledWith(0);
    expect(screen.getByText("Before")).toBeTruthy();
    expect(screen.getByText("After")).toBeTruthy();
  });

  it("follows the pointer", () => {
    render(<BeforeAfterSlider before="/b.jpg" after="/a.jpg" aspect={1.5} />);
    const area = screen.getByTestId("compare-area");
    area.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(area, { clientX: 150, pointerId: 1 });
    expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBe("75");
  });
});

describe("Segmented", () => {
  it("selects one option at a time", () => {
    function Demo() {
      const [v, setV] = useState("after");
      return (
        <Segmented
          label="View"
          value={v}
          onChange={setV}
          options={[
            { value: "before", label: "Before" },
            { value: "after", label: "After" },
          ]}
        />
      );
    }
    render(<Demo />);
    const before = screen.getByRole("radio", { name: "Before" });
    expect(before.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(before);
    expect(before.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "After" }).getAttribute("aria-checked")).toBe("false");
  });
});

describe("Switch and Chip", () => {
  it("toggles", () => {
    const onChange = vi.fn();
    render(<Switch label="Measurements" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch", { name: "Measurements" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("shows a check when selected", () => {
    render(
      <Chip selected checkmark onClick={() => {}}>
        Window
      </Chip>,
    );
    expect(screen.getByRole("button", { name: "Window" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("StageList", () => {
  it("marks finished, current and upcoming stages", () => {
    render(
      <StageList
        stages={[
          { id: "a", label: "Understanding your room" },
          { id: "b", label: "Planning the design" },
          { id: "c", label: "Painting it in" },
        ]}
        current="b"
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]!.getAttribute("data-state")).toBe("done");
    expect(items[1]!.getAttribute("data-state")).toBe("active");
    expect(items[2]!.getAttribute("data-state")).toBe("todo");
  });
});
