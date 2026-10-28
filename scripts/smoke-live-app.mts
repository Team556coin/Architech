// Exercises the deployed app with an isolated QA account and the bundled sample photo.
// node --import tsx scripts/smoke-live-app.mts --live
import { chromium, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { designAlternativeSchema, newDesignItem, planningSchema } from "../packages/core/src/index.ts";

if (!process.argv.includes("--live")) throw new Error("Pass --live to verify the deployed app using paid AI.");
const origin = "https://homeredo.fly.dev";
const folder = "apps/web/test-results/production";
await mkdir(folder, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { Origin: origin } });
const page = await context.newPage();
const api = context.request;
let projectId: string | undefined;
let pending = false;
const checked = async (response: Awaited<ReturnType<typeof api.get>>) => {
  if (!response.ok()) throw new Error(`${response.status()} ${response.url()}: ${(await response.text()).slice(0, 500)}`);
  return response.json();
};
try {
  await checked(await api.post("/api/auth/sign-up/email", { data: { name: "Release verification", email: `release-${randomUUID()}@example.invalid`, password: randomUUID() } }));
  const upload = await checked(await api.post("/api/photos", { multipart: { analyze: "false", photo: { name: "backyard.jpg", mimeType: "image/jpeg", buffer: await readFile("apps/web/public/examples/backyard.jpg") } } }));
  const created = await checked(await api.post("/api/projects", { data: { photoKey: upload.key, title: "Release verification", spaceType: "backyard" } }));
  projectId = created.project.id;
  const design = designAlternativeSchema.parse({ id: randomUUID(), name: "Covered seating", items: [{ ...newDesignItem("patio-cover", "cover"), x: 6, z: 5, material: "Cedar", options: { attachment: "freestanding", roof: "gable", material: "wood" } }] });
  const changed = await checked(await api.post("/api/design", { data: { design, selectedId: "cover", message: "Make the selected cover exactly 16 feet wide. Preserve its roof style, other dimensions, and every other setting." }, timeout: 120_000 }));
  expect(changed.design.items[0].width).toBeCloseTo(4.8768, 4);
  expect(changed.design.items[0].options.roof).toBe("gable");
  const planning = planningSchema.parse({ revision: 1, activeId: design.id, alternatives: [changed.design] });
  await checked(await api.patch(`/api/projects/${projectId}`, { data: { planning, expectedPlanningRevision: 0 } }));
  const reloaded = await checked(await api.get(`/api/projects/${projectId}`));
  expect(reloaded.project.planning).toEqual(planning);
  console.log("Live AI plan editing and persistent save verified.");
  await page.goto(`/p/${projectId}`);
  await page.getByRole("button", { name: "Open project planner" }).click();
  await page.getByRole("button", { name: "1. Patio cover", exact: true }).click();
  await expect(page.getByLabel("Width", { exact: true })).toHaveValue("16 ft");
  await expect(page.getByLabel("Design option: Roof")).toHaveValue("gable");
  await page.screenshot({ path: `${folder}/planner-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 393, height: 852 });
  await page.screenshot({ path: `${folder}/planner-phone.png`, fullPage: true });
  await page.getByRole("button", { name: "Save and preview design" }).click();
  pending = true;
  const finish = Date.now() + 8 * 60_000;
  let result: any;
  while (Date.now() < finish) {
    const state = await checked(await api.get(`/api/projects/${projectId}`));
    const job = state.jobs[0];
    if (job?.status === "failed") { pending = false; throw new Error(`Live generation failed: ${job.error}`); }
    if (job?.status === "succeeded") { result = state; pending = false; break; }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  if (!result) throw new Error("Live generation still pending; QA project retained for inspection.");
  const rendered = result.versions.find((v: any) => v.request?.design?.id === design.id);
  expect(rendered).toBeTruthy();
  const url = rendered.url ?? rendered.imageUrl;
  if (!url) throw new Error("Generated version has no image URL.");
  const image = await api.get(url);
  if (!image.ok()) throw new Error("Generated image cannot be downloaded.");
  await writeFile(`${folder}/preview.jpg`, await image.body());
  await writeFile(`${folder}/result.json`, JSON.stringify({ planning: result.project.planning, job: result.jobs[0], version: rendered }, null, 2));
  console.log(JSON.stringify({ liveUi: true, persistence: true, aiPlanEdit: true, generation: true, verified: rendered.verified, problems: rendered.problems }));
} finally {
  if (projectId && !pending) await checked(await api.delete(`/api/projects/${projectId}`));
  await browser.close();
}
