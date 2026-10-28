"use client";

import { getItem } from "@architech/core";
import { Button } from "@architech/ui";
import { basisText, gettingFor, scaleOf, warningsFor } from "@/lib/measure-view";
import type { CProject, CVersion } from "@/lib/types";

/** Planning is opt-in and uses the selected version, never another preview's marks. */
export function PlanningDetails({ project, selected, onMeasure, onPlace, disabled }: {
  project: CProject;
  selected: CVersion | null;
  onMeasure: () => void;
  onPlace: () => void;
  disabled: boolean;
}) {
  const drawings = selected?.request?.drawings ?? [];
  const { model, status } = scaleOf(project.calibration);
  const units = project.calibration?.units ?? "imperial";
  const usableModel = status === "suspect" ? null : model;
  const items = gettingFor(drawings, usableModel, units);
  const warnings = warningsFor(drawings, usableModel, project.calibration);
  const basis = basisText(project.calibration, units);
  return (
    <details className="rounded-2xl border border-line bg-cream/60 p-3">
      <summary className="cursor-pointer font-bold text-forest">Plan this project <span className="text-sm font-normal text-muted">(optional)</span></summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-muted">Keep exploring, or check the sizes and materials behind this preview. Photo estimates are for planning; confirm dimensions on site before buying or building.</p>
        {selected?.request?.message && <p className="text-sm"><b>This version:</b> {selected.request.message}</p>}
        {status === "suspect" && <p role="status" className="text-sm text-amber-900">A reference measurement does not fit this photo. Review it before using estimates.</p>}
        {basis && <p className="text-sm text-muted">{basis}</p>}
        {drawings.length === 0 ? (
          <p className="text-sm">This is a visual concept. Mark the items you want to measure to start a size and materials breakdown.</p>
        ) : drawings.map((d) => {
          const item = items.find((i) => i.id === d.id);
          return <section key={d.id} className="rounded-xl border border-line bg-white p-3">
            <h3 className="font-bold">{d.itemType === "other" && d.note ? d.note : getItem(d.itemType).label}</h3>
            {item?.rows.length ? <dl>{item.rows.map((row) => <div key={row.label} className="flex justify-between gap-3 py-1 text-sm"><dt>{row.label}</dt><dd className="text-right font-semibold">{row.value}</dd></div>)}</dl>
              : <p className="text-sm text-muted">No quantity estimate yet. Add measurements or mark a measurable footprint.</p>}
          </section>;
        })}
        {items.length > 0 && <p className="text-xs text-muted">Sizes describe placement marks and requested dimensions, not measurements of AI-generated pixels. Listed quantities use simplified assumptions and are not a complete shopping list.</p>}
        {warnings.map((warning) => <p key={warning.message} className="text-sm text-amber-900">{warning.message}</p>)}
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Confirm the footprint and the space around it.</li>
          <li>Choose materials and record the dimensions you measured.</li>
          <li>Resolve installation requirements before making a shopping list.</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onMeasure} disabled={disabled}>Check measurements</Button>
          <Button size="sm" variant="outline" onClick={onPlace} disabled={disabled}>Mark items to plan</Button>
        </div>
      </div>
    </details>
  );
}
