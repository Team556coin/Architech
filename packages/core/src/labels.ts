import { getItem } from "./catalog";
import type { EditRequest } from "./schemas";

const MAX = 28;

function clip(s: string): string {
  if (s.length <= MAX) return s;
  const cut = s.slice(0, MAX - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 10 ? cut.slice(0, space) : cut).trim()}…`;
}

/** Short name for a version in the versions strip, e.g. "Fence + flower bed" or "Paint the walls sage". */
export function versionLabel(request: Pick<EditRequest, "message" | "drawings">): string {
  if (request.drawings.length) {
    const names: string[] = [];
    for (const d of request.drawings) {
      const name = d.itemType === "other" ? d.note.trim() || "New item" : getItem(d.itemType).label;
      if (!names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
    }
    const shown = names.slice(0, 2).map((n, i) => (i === 0 ? n : n.toLowerCase()));
    const label = shown.join(" + ") + (names.length > 2 ? ` +${names.length - 2}` : "");
    return clip(label);
  }
  const words = request.message.trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
  if (!words) return "Edit";
  return clip(words.charAt(0).toUpperCase() + words.slice(1));
}

/** Friendly project title from a space type, e.g. "living-room" → "Living room". */
export function spaceTitle(space: string): string {
  const s = space.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
