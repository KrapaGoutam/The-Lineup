"use client";

import { FormEvent, useState } from "react";
import {
  ArrowLeft,
  KeyRound,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidPasscode, type AppRole } from "@/features/auth/domain/passcode";
import { demoAccounts } from "@/lib/demo-data";

export type SignedInUser = {
  profileId: string;
  name: string;
  role: AppRole;
};

export function LoginScreen({
  demoMode,
  restaurantSlug,
  onSignIn,
}: {
  demoMode: boolean;
  restaurantSlug: string;
  onSignIn: (user: SignedInUser) => void;
}) {
  const [mode, setMode] = useState<"login" | "request" | "sent">("login");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submitPasscode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!isValidPasscode(passcode)) {
      setError("Enter your 6–8 digit restaurant passcode.");
      return;
    }
    if (demoMode) {
      const account = demoAccounts[passcode];
      if (!account) {
        setError("Passcode not recognized. Check it or request access.");
        return;
      }
      onSignIn(account);
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/auth/passcode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ restaurantSlug, passcode }),
      });
      const payload = (await response.json()) as {
        user?: SignedInUser;
        error?: string;
      };
      if (!response.ok || !payload.user) {
        setError(payload.error ?? "Unable to sign in.");
        return;
      }
      onSignIn(payload.user);
    } catch {
      setError("The restaurant service is unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get("displayName") ?? "").trim();
    const contact = String(form.get("contact") ?? "").trim();
    if (displayName.length < 2) {
      setError("Enter the name your manager knows you by.");
      return;
    }
    if (!demoMode) {
      setPending(true);
      try {
        const response = await fetch("/api/access-requests", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ restaurantSlug, displayName, contact }),
        });
        if (!response.ok) throw new Error("request failed");
      } catch {
        setError("Unable to send the request right now.");
        setPending(false);
        return;
      }
      setPending(false);
    }
    setMode("sent");
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,rgba(242,166,90,0.22),transparent_40%)]" />
      <div className="relative w-full max-w-md">
        <div className="mb-7 text-center">
          <div className="bg-primary text-primary-foreground mx-auto grid size-12 place-items-center rounded-2xl text-xl font-black shadow-[0_18px_60px_-20px_var(--primary)]">
            S
          </div>
          <p className="text-primary mt-5 text-xs font-bold tracking-[0.2em] uppercase">
            Autumn House · River Oaks
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
            {mode === "login"
              ? "Your shift starts here"
              : mode === "request"
                ? "Request restaurant access"
                : "Request sent"}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            {mode === "login"
              ? "One private passcode opens your schedule, table rotation, and tip estimate."
              : mode === "request"
                ? "Your manager will approve the request and give you a private passcode."
                : "A manager can now review your request. You can return when you receive your passcode."}
          </p>
        </div>

        <Card className="bg-card/90 overflow-hidden backdrop-blur-xl">
          <CardContent className="p-6 sm:p-7">
            {mode === "login" ? (
              <form onSubmit={submitPasscode} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="passcode">Restaurant passcode</Label>
                  <div className="relative">
                    <KeyRound
                      className="text-muted-foreground absolute top-1/2 left-3 size-5 -translate-y-1/2"
                      aria-hidden="true"
                    />
                    <Input
                      id="passcode"
                      aria-describedby="passcode-help"
                      autoComplete="current-password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={8}
                      value={passcode}
                      onChange={(event) =>
                        setPasscode(event.target.value.replace(/\D/g, ""))
                      }
                      placeholder="••••••"
                      className="h-14 pl-11 text-center font-mono text-xl tracking-[0.35em]"
                      autoFocus
                    />
                  </div>
                  <p
                    id="passcode-help"
                    className="text-muted-foreground text-xs"
                  >
                    No username is required. Your restaurant link identifies the
                    location.
                  </p>
                </div>
                {error ? (
                  <p className="text-destructive text-sm" aria-live="polite">
                    {error}
                  </p>
                ) : null}
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? "Opening workspace…" : "Open workspace"}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("request");
                    setError("");
                  }}
                  className="text-muted-foreground hover:text-foreground min-h-11 w-full text-sm font-medium"
                >
                  Not registered? Request access
                </button>
              </form>
            ) : mode === "request" ? (
              <form onSubmit={submitRequest} className="space-y-5">
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError("");
                  }}
                  className="text-muted-foreground hover:text-foreground flex min-h-11 items-center gap-2 text-sm"
                >
                  <ArrowLeft className="size-4" aria-hidden="true" /> Back to
                  passcode
                </button>
                <div className="space-y-2">
                  <Label htmlFor="displayName">Your name</Label>
                  <Input
                    id="displayName"
                    name="displayName"
                    placeholder="Name your manager recognizes"
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact">Phone or email</Label>
                  <Input
                    id="contact"
                    name="contact"
                    placeholder="So your manager can reach you"
                    autoComplete="email"
                    required
                  />
                </div>
                {error ? (
                  <p className="text-destructive text-sm" aria-live="polite">
                    {error}
                  </p>
                ) : null}
                <Button type="submit" className="w-full" disabled={pending}>
                  <Users className="size-4" aria-hidden="true" />{" "}
                  {pending ? "Sending…" : "Send request"}
                </Button>
              </form>
            ) : (
              <div className="text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-400/10 text-emerald-300">
                  <ShieldCheck className="size-7" aria-hidden="true" />
                </span>
                <Button
                  className="mt-6 w-full"
                  onClick={() => setMode("login")}
                >
                  Return to sign in
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {demoMode ? (
          <div className="border-border bg-background/60 text-muted-foreground mt-4 rounded-2xl border p-4 text-xs leading-5">
            <p className="text-foreground flex items-center gap-2 font-semibold">
              <Sparkles className="text-primary size-4" aria-hidden="true" />{" "}
              Interactive demo
            </p>
            <p className="mt-1">
              Manager: <span className="text-foreground font-mono">246810</span>{" "}
              · Server:{" "}
              <span className="text-foreground font-mono">135790</span> · Owner:{" "}
              <span className="text-foreground font-mono">86420975</span>
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
