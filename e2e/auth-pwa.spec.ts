import { expect, test } from "@playwright/test";

test.describe("CampusFace staff entry", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("./");
    await expect(
      page.getByRole("heading", { name: "Sign in to CampusFace" }),
    ).toBeVisible();
  });

  test("shows the authorised staff sign-in form without public registration", async ({ page }) => {
    await expect(page.getByLabel("Staff email address")).toHaveAttribute(
      "type",
      "email",
    );
    await expect(page.getByLabel("Password")).toHaveAttribute(
      "type",
      "password",
    );
    await expect(
      page.getByRole("button", { name: "Sign in securely" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /sign up|create account/i }),
    ).toHaveCount(0);
    await expect(
      page.getByText(/there is no public sign-up/i),
    ).toBeVisible();
  });

  test("allows the password visibility control to show and hide the entered value", async ({ page }) => {
    const password = page.getByLabel("Password");
    await password.fill("ExampleOnly-NotARealAccount-123");

    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(
      page.getByRole("button", { name: "Hide password" }),
    ).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("opens password reset mode and returns to staff sign-in", async ({ page }) => {
    await page.getByRole("button", { name: "Forgot password?" }).click();

    await expect(
      page.getByRole("heading", { name: "Reset your password" }),
    ).toBeVisible();
    await expect(page.getByLabel("Staff email address")).toHaveAttribute(
      "type",
      "email",
    );
    await expect(
      page.getByRole("button", { name: "Send password reset email" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Back to sign in" }).click();
    await expect(
      page.getByRole("heading", { name: "Sign in to CampusFace" }),
    ).toBeVisible();
  });

  test("keeps the staff sign-in card inside a narrow phone viewport", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const card = page.locator(".auth-card");
    await expect(card).toBeVisible();

    const bounds = await card.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(361);
  });
});

test("serves the installable PWA manifest and service worker", async ({ page, request, baseURL }) => {
  await page.goto("./");
  const manifestResponse = await request.get(new URL("manifest.webmanifest", baseURL).toString());
  expect(manifestResponse.ok()).toBeTruthy();

  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe("CampusFace Attendance");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBeTruthy();

  const serviceWorkerResponse = await request.get(new URL("sw.js", baseURL).toString());
  expect(serviceWorkerResponse.ok()).toBeTruthy();
});
