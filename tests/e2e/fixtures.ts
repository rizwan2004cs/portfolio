import { test as base, expect, type Page } from "@playwright/test";

/** Each test gets its own client IP (the per-IP rate limit is shared across the suite) and fails on any console error. */
export const test = base.extend<{ errors: string[]; allowErrors: RegExp[]; nudge: boolean }>({
  allowErrors: [[], { option: true }],
  // the one-time "try the agent" arrow would sit over Classic in every test; only its own tests turn it on
  nudge: [false, { option: true }],
  errors: [async ({ page, allowErrors }, use) => {
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error" && !allowErrors.some((r) => r.test(m.text()))) errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(e.message));
    await use(errors);
    expect(errors, "console errors").toEqual([]);
  }, { auto: true }],
  page: async ({ page, nudge }, use) => {
    if (!nudge) await page.addInitScript(() => { try { localStorage.setItem("rz_nudge", "1"); } catch { /* storage off */ } });
    await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.${rnd()}.${rnd()}.${rnd()}` });
    await use(page);
  },
});
const rnd = () => Math.floor(Math.random() * 250) + 1;
export { expect };

/** Send one message and wait until the turn is fully finished (composer idle, chips rendered). */
export async function ask(page: Page, text: string) {
  const turns = await page.locator(".turn").count();
  await page.locator("#inp").fill(text);
  await page.locator("#inp").press("Enter");
  await expect(page.locator(".turn")).toHaveCount(turns + 1);
  await settle(page);
  return page.locator(".turn").last();
}
export async function settle(page: Page) {
  await expect(page.locator("#form")).toHaveAttribute("aria-busy", "false", { timeout: 20_000 });
  await expect(page.locator("#sugg button").first()).toBeVisible();
}
export async function openAgent(page: Page, path = "/agent") {
  await page.goto(path);
  await expect(page.locator("#shell[data-mounted]")).toBeAttached();
}
/** A turn must never be silent: it shows words, and the visitor gets next steps. */
export async function expectHealthy(turn: ReturnType<Page["locator"]>, page: Page) {
  await expect(turn.locator(".msg .sr").first()).not.toBeEmpty();
  await expect(page.locator("#sugg button")).not.toHaveCount(0);
}
