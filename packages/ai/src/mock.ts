import sharp from "sharp";
import type { SpaceAnalysis } from "./agents";
import type { EditDeps } from "./pipeline";

/**
 * Deterministic stand-in used by automated tests and when AI_PROVIDER=mock.
 * It never calls the network: edits tint the photo so changes are visible.
 */
export function mockAnalysis(): SpaceAnalysis {
  return {
    spaceType: "backyard",
    title: "Backyard",
    summary: "A grassy backyard with a shed and trees.",
    keep: [
      { id: "shed", label: "Shed", keep: true },
      { id: "trees", label: "Trees", keep: true },
      { id: "house", label: "House", keep: true },
    ],
    suggestions: [
      { label: "Privacy fence", prompt: "Add a 6 ft cedar privacy fence around the yard." },
      { label: "Patio", prompt: "Add a paver patio near the house." },
      { label: "Fire pit", prompt: "Add a sunken fire pit with stone seating." },
      { label: "Flower beds", prompt: "Add colorful flower beds along the fence." },
      { label: "Pool", prompt: "Add an in-ground pool." },
      { label: "String lights", prompt: "Add warm string lights." },
    ],
    horizonY: 0.42,
    references: [],
  };
}

export function createMockDeps(): EditDeps {
  return {
    plan: async ({ message, drawingNotes }) => {
      if (/\b(nude|weapon|gun)\b/i.test(message)) return { allowed: false, refusal: "I can only help with home and yard design.", reply: "", editPrompt: "", followUps: [] };
      return {
        allowed: true,
        refusal: null,
        reply: `Done! Here's your design${drawingNotes.length ? " right where you drew it" : ""}.`,
        editPrompt: message || "Apply the marked changes.",
        followUps: ["Darker colors", "Add lights", "More plants"],
      };
    },
    edit: async ({ images }) => {
      const base = images[0]!;
      return sharp(base).modulate({ hue: 90, saturation: 1.4 }).jpeg().toBuffer();
    },
    verify: async () => ({ pass: true, problems: [] }),
  };
}
