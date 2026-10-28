import { expect, test, type Locator, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const postgres = require("postgres") as typeof import("postgres");
const DB_URL = "postgres://architech:architech@localhost:5433/architech_e2e";
const EXAMPLES = path.join(import.meta.dirname, "..", "public", "examples");

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;

async function signUp(page: Page) {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.dev`;
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.goto("/sign-in");
    await page.getByLabel("Your first name").fill("Casey");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("secret123");
    const res = page.waitForResponse((r) => r.url().includes("/api/auth/sign-up"));
    await page.getByRole("button", { name: "Create account" }).click();
    const status = (await res).status();
    if (status === 429) {
      await page.waitForTimeout(11_000);
      continue;
    }
    expect(status).toBe(200);
    await expect(page).not.toHaveURL(/sign-in/);
    return email;
  }
  throw new Error("Sign-up kept getting rate limited");
}

async function upload(page: Page, example: string) {
  await page.goto("/");
  const input = page.getByTestId(isPhone(page) ? "camera-input" : "photo-input");
  await input.setInputFiles(path.join(EXAMPLES, `${example}.jpg`));
  await expect(page).toHaveURL(/\/p\/[0-9a-f-]{36}/);
  await page.getByText("Choose what stays", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Shed", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByText("Choose what stays", { exact: true }).click();
}

async function chat(page: Page, text: string) {
  await page.getByLabel("Tell us what to change").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

const credits = (page: Page) => page.getByTestId("credits").first();

/** Tap a spot on the photo, given as fractions of its size. */
async function tapAt(target: Locator, fx: number, fy: number) {
  const box = (await target.boundingBox())!;
  await target.click({ position: { x: box.width * fx, y: box.height * fy } });
}

async function dragOn(page: Page, target: Locator, from: [number, number], to: [number, number]) {
  const size = (await target.boundingBox())!;
  await target.hover({ position: { x: size.width * from[0], y: size.height * from[1] } });
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 10 });
  await page.mouse.up();
}

test("upload a photo, change it by chatting, compare and download", async ({ page }) => {
  await signUp(page);
  await upload(page, "kitchen");
  await expect(credits(page)).toHaveText("20 free edits");

  await chat(page, "paint the cabinets sage green");
  await expect(page.getByText("Done! Here's your design.")).toBeVisible({ timeout: 60_000 });
  await expect(credits(page)).toHaveText("19 free edits");
  await expect(page.getByText("Original", { exact: true })).toBeVisible();
  await expect(page.getByTestId("compare-area")).toBeVisible();

  await page.getByRole("radio", { name: "Before" }).click();
  await expect(page.getByRole("img", { name: "Before" })).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.(jpe?g|png|webp)$/);
});

test("quick outdoor concept stays simple, with optional planning and searchable additions", async ({ page }) => {
  await signUp(page);
  await upload(page, "backyard");
  const planning = page.locator("details").filter({ hasText: "Plan this project" });
  await expect(planning).not.toHaveAttribute("open");
  await chat(page, "Add an outdoor kitchen and comfortable seating for six");
  await expect(page.getByText("Done! Here's your design.")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Wrong size", exact: true }).click();
  await expect(page.getByLabel("Tell us what to change")).toHaveValue("Keep everything else the same, but resize ");
  await expect(credits(page)).toHaveText("19 free edits");
  await planning.locator("summary").click();
  await expect(planning.getByText(/This is a visual concept/)).toBeVisible();
  await page.getByLabel("Tell us what to change").fill("");
  await page.getByRole("button", { name: "Add something", exact: true }).click();
  await page.getByRole("searchbox").fill("kitchen");
  await expect(page.getByRole("button", { name: "Outdoor kitchen", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fence", exact: true })).toBeHidden();
  await page.getByRole("searchbox").fill("gazebo");
  await page.getByRole("button", { name: "Gazebo", exact: true }).click();
  await expect(page.getByTestId("draw-canvas")).toBeVisible();
  await page.screenshot({ path: `test-results/outdoor-additions-${isPhone(page) ? "phone" : "desktop"}.png`, fullPage: true });
});

test("persistent planner supports dimensions, alternatives, 3D, export and preview revisions", async ({ page }) => {
  await signUp(page);
  await upload(page, "backyard");
  await page.getByRole("button", { name: "Open project planner" }).click();
  await page.getByLabel("Search planning items").fill("patio cover");
  await page.getByRole("button", { name: "Patio cover", exact: true }).click();
  await page.getByLabel("Width", { exact: true }).fill("16 ft");
  await page.getByLabel("Width", { exact: true }).blur();
  await page.getByLabel("Item material").fill("Cedar");
  await page.getByLabel("Design option: Roof").selectOption("gable");
  await page.getByLabel("Alternative name").fill("Covered patio");
  await page.getByLabel("Lock this item").check();
  await expect(page.getByLabel("Width", { exact: true })).toBeDisabled();
  await page.getByLabel("Lock this item").uncheck();
  await page.getByRole("button", { name: "3D view", exact: true }).click();
  await expect(page.getByLabel("3D design layout")).toBeVisible();
  await page.screenshot({ path: `test-results/planner-3d-${isPhone(page) ? "phone" : "desktop"}.png`, fullPage: true });
  await page.getByRole("button", { name: "Duplicate alternative" }).click();
  await page.getByLabel("Alternative name").fill("Smaller cover");
  await page.getByLabel("Width", { exact: true }).fill("10 ft");
  await page.getByLabel("Width", { exact: true }).blur();
  await page.getByLabel("Design alternative").selectOption({ label: "Covered patio" });
  await page.getByRole("button", { name: "1. Patio cover", exact: true }).click();
  await expect(page.getByLabel("Width", { exact: true })).toHaveValue("16 ft");
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Plan saved online.");
  const url = page.url();
  await page.reload();
  await page.getByRole("button", { name: "Open project planner" }).click();
  await expect(page.getByLabel("Alternative name")).toHaveValue("Covered patio");
  await page.getByRole("button", { name: "1. Patio cover", exact: true }).click();
  await expect(page.getByLabel("Width", { exact: true })).toHaveValue("16 ft");
  await expect(page.getByLabel("Item material")).toHaveValue("Cedar");
  await expect(page.getByLabel("Design option: Roof")).toHaveValue("gable");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export project packet" }).click();
  expect((await download).suggestedFilename()).toBe("HomeRedo-project-plan.html");
  await page.getByRole("button", { name: "Save and preview design" }).click();
  await expect(page.getByText(/Done! Here's your design/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Open project planner" }).click();
  await expect(page.getByText("A photo preview exists for this revision.")).toBeVisible();
  await page.getByRole("button", { name: "1. Patio cover", exact: true }).click();
  await page.getByLabel("Width", { exact: true }).fill("18 ft");
  await page.getByLabel("Width", { exact: true }).blur();
  await expect(page.getByText(/photo preview is out of date/)).toBeVisible();
  await expect(page).toHaveURL(url);
});

test("start without a photo and shape a curved lazy river", async ({ page }) => {
  await signUp(page);
  await page.goto("/");
  await page.getByText("Start without a photo", { exact: true }).click();
  await page.getByRole("button", { name: "Start a layout" }).click();
  await expect(page.getByTestId("project-planner")).toBeVisible();
  await page.getByLabel("Search planning items").fill("lazy river");
  await page.getByRole("button", { name: "Lazy river", exact: true }).click();
  await expect(page.getByLabel("Close the loop")).toBeChecked();
  await expect(page.getByLabel("Round the corners")).toBeChecked();
  await page.getByLabel("Route points").fill("-8, -6\n8, -6\n8, 6\n-8, 6");
  await page.getByLabel("Route points").blur();
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Plan saved online.");
  await page.reload();
  await expect(page.getByTestId("project-planner")).toBeVisible();
  await page.getByRole("button", { name: "1. Lazy river", exact: true }).click();
  await expect(page.getByLabel("Route points")).toHaveValue("-8.00, -6.00\n8.00, -6.00\n8.00, 6.00\n-8.00, 6.00");
});

test("draw a fence on the photo and make it real", async ({ page }) => {
  await signUp(page);
  await upload(page, "backyard");

  await page.getByRole("button", { name: "Add something" }).click();
  await page.getByRole("button", { name: "Fence", exact: true }).click();
  const canvas = page.getByTestId("draw-canvas");
  await tapAt(canvas, 0.2, 0.75);
  await tapAt(canvas, 0.8, 0.75);
  await expect(page.getByText("2 dots placed")).toBeVisible();
  await page.getByRole("button", { name: "Done drawing" }).click();

  await page.getByRole("button", { name: "Make it real" }).click();
  await expect(page.getByText("Done! Here's your design right where you drew it.")).toBeVisible({ timeout: 60_000 });
  await expect(credits(page)).toHaveText("19 free edits");
});

test("measure something you know, then type an exact size and see it on the photo", async ({ page }) => {
  await signUp(page);
  await upload(page, "backyard");

  await page.getByRole("button", { name: "Check sizes" }).click();
  await page.getByRole("button", { name: "Measure something" }).click();
  await dragOn(page, page.getByTestId("calibrate-stage"), [0.5, 0.45], [0.5, 0.85]);
  await page.getByLabel("Real length").fill("80 in");
  await expect(page.getByRole("radio", { name: "Standing up" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Use this size" }).click();
  await expect(page.getByText("Scale based on your measurements; check derived sizes on site")).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByText("Saved. Sizes are now to scale.")).toBeVisible();

  await page.getByRole("button", { name: "Add something" }).click();
  await page.getByRole("button", { name: "Fence", exact: true }).click();
  const canvas = page.getByTestId("draw-canvas");
  await tapAt(canvas, 0.2, 0.8);
  await tapAt(canvas, 0.7, 0.8);
  await page.getByRole("button", { name: "Done drawing" }).click();

  const length = page.getByLabel("Length", { exact: true });
  await length.fill("20 ft");
  await length.press("Enter");
  await expect(length).toHaveValue("20 ft");

  await page.getByRole("switch", { name: "Measurements" }).click();
  await expect(page.getByTestId("dimension").filter({ hasText: "20 ft" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Make it real" }).click();
  await expect(page.getByRole("listbox", { name: "Versions" }).getByText("Fence")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: /What you're getting/ })).toBeVisible();
  await expect(page.getByText("Total length")).toBeVisible();

  const save = async (choice: string) => {
    await page.getByRole("button", { name: "Download" }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: choice }).click();
    const file = await download;
    await file.saveAs(test.info().outputPath(file.suggestedFilename()));
    return file.suggestedFilename();
  };
  expect(await save("With measurements")).toMatch(/-measurements\.jpg$/);
  expect(await save("Clean photo")).not.toMatch(/measurements/);
});

test("indoor items start at a standard size and warn when they don't fit the room", async ({ page }) => {
  await signUp(page);
  await upload(page, "bathroom");
  const projectId = page.url().split("/p/")[1]!;
  const sql = postgres(DB_URL, { max: 1 });
  await sql`update projects set space_type = 'bathroom' where id = ${projectId}`;
  await sql.end();
  await page.reload();

  await page.getByRole("button", { name: "Check sizes" }).click();
  await page.getByLabel("Length").fill("8 ft");
  await page.getByLabel("Width").fill("5 ft");
  await page.getByLabel("Width").press("Enter");
  await page.getByRole("button", { name: "Measure something" }).click();
  await dragOn(page, page.getByTestId("calibrate-stage"), [0.5, 0.45], [0.5, 0.85]);
  await page.getByLabel("Real length").fill("80 in");
  await page.getByRole("button", { name: "Use this size" }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByText("Saved. Sizes are now to scale.")).toBeVisible();

  await page.getByRole("button", { name: "Add something" }).click();
  await page.getByRole("button", { name: "Walk-in shower" }).click();
  await tapAt(page.getByTestId("draw-canvas"), 0.5, 0.8);
  const length = page.getByLabel("Length", { exact: true });
  await expect(length).toHaveAttribute("placeholder", /5 ft|60 in/);
  await expect(page.getByText(/bigger than your room/)).toBeHidden();

  await length.fill("12 ft");
  await length.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "This walk-in shower is bigger than your room" })).toBeVisible();
});

test("running out of free edits shows a friendly sheet", async ({ page }) => {
  const email = await signUp(page);
  await upload(page, "bedroom");
  const sql = postgres(DB_URL, { max: 1 });
  await sql`update profiles set credits = 0 where user_id = (select id from "user" where email = ${email})`;
  await sql.end();

  await chat(page, "add a reading chair");
  const sheet = page.getByRole("dialog", { name: /used all your free edits/i });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Got it" }).click();
  await expect(sheet).toBeHidden();
});

/** Builds a real image File inside the page, as if it came from the user's computer. */
const fileInPage = (example: string) => `(async () => {
  const blob = await (await fetch("/examples/${example}.jpg")).blob();
  const dt = new DataTransfer();
  dt.items.add(new File([blob], "${example}.jpg", { type: "image/jpeg" }));
  return dt;
})()`;

test("drop a photo onto the page to start", async ({ page }) => {
  test.skip(isPhone(page), "Dragging files is for computers");
  await signUp(page);
  await page.goto("/");
  const dt = await page.evaluateHandle(fileInPage("kitchen"));
  await page.getByTestId("dropzone").dispatchEvent("dragover", { dataTransfer: dt });
  await page.getByTestId("dropzone").dispatchEvent("drop", { dataTransfer: dt });
  await expect(page).toHaveURL(/\/p\/[0-9a-f-]{36}/);
  await page.getByText("Choose what stays", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Shed", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByText("Choose what stays", { exact: true }).click();
});

test("paste a photo to start", async ({ page }) => {
  test.skip(isPhone(page), "Pasting files is for computers");
  await signUp(page);
  await page.goto("/");
  await expect(page.getByTestId("dropzone")).toBeVisible();
  await page.evaluate(async (src) => {
    const dt: DataTransfer = await (0, eval)(src);
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, fileInPage("bedroom"));
  await expect(page).toHaveURL(/\/p\/[0-9a-f-]{36}/);
});

test("something's wrong? redo it free", async ({ page }) => {
  await signUp(page);
  await upload(page, "kitchen");
  await chat(page, "paint the cabinets navy");
  await expect(page.getByText("Done! Here's your design.")).toBeVisible({ timeout: 60_000 });
  await expect(credits(page)).toHaveText("19 free edits");
  const versions = page.getByRole("listbox", { name: "Versions" }).getByRole("option");
  await expect(versions).toHaveCount(2);

  await page.getByRole("button", { name: "Something's wrong? Redo it free" }).click();
  await page.getByLabel("What's wrong").fill("the window disappeared");
  await page.getByRole("button", { name: "Redo it free" }).click();
  await expect(versions).toHaveCount(3, { timeout: 60_000 });
  await expect(credits(page)).toHaveText("19 free edits");
  await expect(page.getByRole("button", { name: "Something's wrong? Redo it free" })).toBeHidden();
});

test("only 5 projects online; the rest stay on the device and you choose which", async ({ page }) => {
  test.setTimeout(240_000);
  const email = await signUp(page);
  for (let i = 0; i < 6; i++) await upload(page, "backyard");
  const sql = postgres(DB_URL, { max: 1 });
  await sql`
    update projects p set title = 'Room ' || r.n
    from (select id, row_number() over (order by created_at) as n from projects
          where user_id = (select id from "user" where email = ${email})) r
    where p.id = r.id`;
  await sql.end();

  await page.goto("/projects");
  const cards = page.getByTestId("project-card");
  const card = (title: string) => cards.filter({ has: page.getByText(title, { exact: true }) });
  await expect(cards).toHaveCount(6);
  await expect(page.getByText("Online: 5 of 5")).toBeVisible();
  await expect(card("Backyard").getByText("This device")).toBeVisible();

  await page.getByRole("button", { name: "Options for Backyard" }).click();
  await page.getByRole("button", { name: "Save online" }).click();
  const dialog = page.getByRole("dialog", { name: "Choose a project to move" });
  await expect(dialog.getByText("Your 5 online spots are full")).toBeVisible();
  await dialog.getByRole("button", { name: /Room 2/ }).click();

  await expect(page.getByText(/Swapped: "Backyard" is online, "Room 2" is on this device/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Online: 5 of 5")).toBeVisible();
  await expect(card("Backyard").getByText("Online", { exact: true })).toBeVisible();
  await expect(card("Room 2").getByText("This device")).toBeVisible();

  await card("Room 2").getByRole("link").click();
  await expect(page.getByText("This device", { exact: true })).toBeVisible();
  await page.getByText("Choose what stays", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Shed", exact: true })).toBeVisible();
});

test("keyboard: hold Space to peek at the original, Ctrl+Z to undo", async ({ page }) => {
  test.skip(isPhone(page), "Keyboard shortcuts are for computers");
  await signUp(page);
  await upload(page, "bathroom");
  await chat(page, "make the tiles white");
  await expect(page.getByText("Done! Here's your design.")).toBeVisible({ timeout: 60_000 });

  const field = page.getByLabel("Tell us what to change");
  await field.fill("abc");
  await field.press("Space");
  await expect(field).toHaveValue("abc ");
  await expect(page.getByRole("img", { name: "Original photo" })).toBeHidden();
  await field.fill("");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  await page.keyboard.down("Space");
  await expect(page.getByRole("img", { name: "Original photo" })).toBeVisible();
  await page.keyboard.up("Space");
  await expect(page.getByRole("img", { name: "Original photo" })).toBeHidden();

  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByRole("button", { name: "Start fresh from the original" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("start fresh from the original and find the project online", async ({ page }) => {
  await signUp(page);
  await upload(page, "front-yard");
  await chat(page, "add flower beds along the path");
  await expect(page.getByText("Done! Here's your design.")).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "Start fresh from the original" }).click();
  await expect(page.getByText(/Back to your original photo/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start fresh from the original" })).toBeHidden();

  await page.getByRole("link", { name: "My projects" }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/projects/);
  await expect(page.getByText("Online: 1 of 5")).toBeVisible();
  await expect(page.getByText("2 versions")).toBeVisible();
});
