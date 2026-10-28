// Explicit, paid live-provider smoke test using the repository's sample yard.
// node --env-file=apps/web/.env.local --import tsx scripts/smoke-home-design.mts --live
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { analyzeSpace, createOpenRouterDeps, OpenRouter, runEdit } from "../packages/ai/src/index.ts";

if (!process.argv.includes("--live")) throw new Error("Pass --live to run the configured paid AI provider.");
if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is required.");
const or = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
const models = { vision: process.env.AI_VISION_MODEL ?? "google/gemini-4-argon", image: process.env.AI_IMAGE_MODEL ?? "openai/gpt-image-2.5-sunburst" };
const base = await readFile("apps/web/public/examples/backyard.jpg");
const analysis = await analyzeSpace(or, models, base);
console.log(JSON.stringify({ stage: "analyzed", suggestions: analysis.suggestions }));
const result = await runEdit(createOpenRouterDeps(or, models), {
  base, spaceType: "backyard", calibration: null, history: [],
  request: { message: "Add a modest covered patio with a small outdoor grill kitchen and comfortable seating for four. Preserve the house, trees, camera angle and existing boundaries. Keep a clear walking route.", drawings: [], keep: analysis.keep, fromOriginal: false },
}, (stage) => console.log(stage));
const folder = "apps/web/test-results/live";
await mkdir(folder, { recursive: true });
await writeFile(`${folder}/outdoor-kitchen.jpg`, result.image);
await writeFile(`${folder}/result.json`, JSON.stringify({ analysis, ...result, image: undefined }, null, 2));
console.log(JSON.stringify({ verified: result.verified, attempts: result.attempts, problems: result.problems, output: `${folder}/outdoor-kitchen.jpg` }));
