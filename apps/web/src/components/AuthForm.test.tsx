// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "./AuthForm";

const mocks = vi.hoisted(() => ({ social: vi.fn(), params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => mocks.params }));
vi.mock("@/lib/auth-client", () => ({ authClient: { signIn: { social: mocks.social } } }));
vi.mock("./Providers", () => ({ useSession: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);
beforeEach(() => {
  mocks.params = new URLSearchParams();
  mocks.social.mockReset().mockResolvedValue({ data: { redirect: true } });
});

describe("Google sign-in", () => {
  it("hides the option until server credentials are configured", () => {
    render(<AuthForm />);
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
  });
  it("starts Google OAuth and preserves the requested page", async () => {
    mocks.params.set("next", "/projects");
    render(<AuthForm googleEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(mocks.social).toHaveBeenCalledWith({ provider: "google", callbackURL: "/projects", errorCallbackURL: "/sign-in?error=google&next=%2Fprojects" }));
  });
  it.each(["https://example.com", "//example.com", "/\\example.com"])("rejects an external destination: %s", async (next) => {
    mocks.params.set("next", next);
    render(<AuthForm googleEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(mocks.social).toHaveBeenCalledWith(expect.objectContaining({ callbackURL: "/" })));
  });
  it("shows a useful error if Google OAuth cannot start", async () => {
    mocks.social.mockResolvedValue({ error: { message: "Provider missing" } });
    render(<AuthForm googleEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("couldn't start"));
  });
  it("returns native sign-ins through the verifier-bound handoff", async () => {
    const challenge = "a".repeat(64);
    mocks.params.set("native", challenge);
    render(<AuthForm googleEnabled />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(mocks.social).toHaveBeenCalledWith(expect.objectContaining({ callbackURL: `/api/auth/native/complete?challenge=${challenge}` })));
  });
  it("shows an error after an unsuccessful OAuth callback", () => {
    mocks.params.set("error", "google");
    render(<AuthForm googleEnabled />);
    expect(screen.getByRole("alert").textContent).toContain("didn't finish");
  });
});
