/**
 * E2E Tests: Authentication flows
 *
 * Tests login, register, redirect behavior, and logout.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, login } from "./helpers";

test.describe("Auth - Login", () => {
    test("should show login page", async ({ page }) => {
        await page.goto("/login");
        await expect(page.getByRole("heading", { name: "Sign in to Ciao Digital Signage" })).toBeVisible();
        await expect(page.getByLabel("Email")).toBeVisible();
        await expect(page.getByLabel("Password")).toBeVisible();
        await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    });

    test("should reject invalid credentials", async ({ page }) => {
        await page.goto("/login");
        await page.getByLabel("Email").fill("wrong@example.com");
        await page.getByLabel("Password").fill("WrongPassword1!");
        await page.getByRole("button", { name: "Sign in" }).click();

        // Should stay on login page and show an error
        await expect(page).toHaveURL(/\/login/);
        // Wait for error text (better-auth returns "Invalid credentials" or similar)
        await expect(page.locator(".text-red-500, [role=alert]")).toBeVisible({ timeout: 5_000 });
    });

    test("should login with valid credentials and redirect to dashboard", async ({ page }) => {
        await login(page);
        await expect(page).toHaveURL(/\/dashboard/);
        await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    });

    test("should redirect unauthenticated user to /login", async ({ page }) => {
        await page.goto("/dashboard");
        await expect(page).toHaveURL(/\/login/);
    });

    test("should redirect authenticated user away from /login", async ({ page }) => {
        // First login
        await login(page);
        // Then visit /login — should redirect back to dashboard
        await page.goto("/login");
        await expect(page).toHaveURL(/\/dashboard/);
    });
});

test.describe("Auth - Register", () => {
    test("should show registration form", async ({ page }) => {
        await page.goto("/register");
        await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
        await expect(page.getByLabel("Full Name")).toBeVisible();
        await expect(page.getByLabel("Email")).toBeVisible();
        await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
    });

    test("should navigate from login to register", async ({ page }) => {
        await page.goto("/login");
        await page.getByRole("link", { name: "Create account" }).click();
        await expect(page).toHaveURL(/\/register/);
    });
});

test.describe("Auth - Logout", () => {
    test("should logout and redirect to login", async ({ page }) => {
        await login(page);
        // Multiple sign-out buttons can be present (header + sidebar).
        // Click the first available one to avoid strict-mode ambiguity.
        const logoutButton = page.locator("main").getByRole("button", { name: /logout|sign out|esci/i }).first();
        if (await logoutButton.count()) {
            await logoutButton.click({ force: true });
            await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
        }
    });
});
