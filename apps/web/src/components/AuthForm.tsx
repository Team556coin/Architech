"use client";

import { Button, Segmented } from "@architech/ui";
import { Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { isNative } from "@/lib/native";
import { startNativeGoogle } from "@/lib/native-google";
import { useSession } from "./Providers";

const field = "h-13 w-full rounded-2xl border border-line bg-white px-4 text-[17px] outline-none focus:border-forest focus:ring-2 focus:ring-forest/20";

export function AuthForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const { refresh } = useSession();
  const [mode, setMode] = useState<"up" | "in">(params.get("mode") === "in" ? "in" : "up");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(params.has("error") ? "Google sign-in didn't finish. Please try again." : null);
  const [busy, setBusy] = useState(false);
  const requestedNext = params.get("next") || "/";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") && !requestedNext.includes("\\") ? requestedNext : "/";

  async function signInWithGoogle() {
    setError(null);
    setBusy(true);
    try {
      if (isNative()) {
        await startNativeGoogle(next);
        return;
      }
      const challenge = params.get("native");
      const callbackURL = challenge && /^[a-f0-9]{64}$/.test(challenge) ? `/api/auth/native/complete?challenge=${challenge}` : next;
      const res = await authClient.signIn.social({
        provider: "google",
        callbackURL,
        errorCallbackURL: `/sign-in?error=google&next=${encodeURIComponent(next)}`,
      });
      if (res.error) setError("Google sign-in couldn't start. Please try again.");
    } catch {
      setError("Can't reach Google sign-in. Check your internet connection.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res =
        mode === "up"
          ? await authClient.signUp.email({ email: email.trim(), password, name: name.trim() || email.trim().split("@")[0]! })
          : await authClient.signIn.email({ email: email.trim(), password });
      if (res.error) {
        const msg = res.error.message ?? "";
        if (/already exists/i.test(msg)) setError("That email already has an account. Try signing in.");
        else if (/invalid email or password/i.test(msg)) setError("That email or password isn't right.");
        else if (/password.*short/i.test(msg)) setError("Use at least 6 characters for your password.");
        else setError(msg || "That didn't work. Please try again.");
        return;
      }
      await refresh();
      router.replace(next);
    } catch {
      setError("Can't reach HomeRedo. Check your internet connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-line bg-white/70 p-6 shadow-sm md:p-8">
      <h1 className="text-3xl font-extrabold text-forest">{mode === "up" ? "Make your free account" : "Welcome back"}</h1>
      <p className="mt-2 flex items-center gap-2 text-muted">
        <Sparkles className="size-4 text-coral" /> {mode === "up" ? "You get 20 free edits to start." : "Sign in to see your projects."}
      </p>
      {googleEnabled && (
        <div className="mt-6">
          <Button variant="outline" size="lg" block disabled={busy} onClick={() => void signInWithGoogle()}>
            Continue with Google
          </Button>
          <p className="mt-4 text-center text-sm text-muted">Or use your email</p>
        </div>
      )}
      <Segmented
        className="mt-6 w-full"
        label="Account"
        value={mode}
        onChange={(v) => {
          setMode(v);
          setError(null);
        }}
        options={[
          { value: "up", label: "New here" },
          { value: "in", label: "I have an account" },
        ]}
      />
      <form className="mt-6 space-y-4" onSubmit={submit}>
        {mode === "up" && (
          <label className="block">
            <span className="mb-1.5 block font-semibold">Your first name</span>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" placeholder="Sam" />
          </label>
        )}
        <label className="block">
          <span className="mb-1.5 block font-semibold">Email</span>
          <input className={field} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" placeholder="you@example.com" />
        </label>
        <label className="block">
          <span className="mb-1.5 block font-semibold">Password</span>
          <input
            className={field}
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "up" ? "new-password" : "current-password"}
            placeholder="At least 6 characters"
          />
        </label>
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 font-semibold text-red-800">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" block disabled={busy}>
          {busy ? "One sec..." : mode === "up" ? "Create account" : "Sign in"}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted"><a href="/privacy" className="underline">Privacy notice</a></p>
    </div>
  );
}
