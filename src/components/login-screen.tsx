"use client";

import { FormEvent, useState, useEffect } from "react";
import { ArrowLeft, Delete, KeyRound, Sparkles, UserPlus } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  isValidPasscode,
  type AppRole,
  type Designation,
} from "@/features/auth/domain/passcode";
import {
  isValidContact,
  isValidDisplayName,
} from "@/features/auth/domain/registration";
import { demoAccounts as staticDemoAccounts } from "@/lib/demo-data";

export type SignedInUser = {
  profileId: string;
  name: string;
  role: AppRole;
  // Feature 014: the finer 4-value label `role` is derived from
  // (`designationToRole`). Every capability check still reads `role`;
  // `designation` exists so the Team tab can gate who may change whose
  // label without a fourth permission tier.
  designation: Designation;
  // Feature 015: scopes every real-mode query (schedule, allocation,
  // tips, roster). Demo mode never queries anything with it, but every
  // SignedInUser still carries a value -- a stable placeholder
  // ("demo-org") for demo accounts -- so the type stays one shape
  // instead of an optional field threaded through every consumer.
  organizationId: string;
};

export type RegisterDemoResult =
  | { ok: true; account: SignedInUser }
  | { ok: false; error: string };

const KEYPAD_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * Feature 013: additive alongside the typed input, never a replacement —
 * both write to the same `passcode` state via the same capped-at-4 rule,
 * so there's no divergence between typing and tapping. Hidden at desktop
 * width (`lg:hidden`); desktop already has a physical keyboard.
 */
function NumericKeypad({
  onDigit,
  onBackspace,
}: {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
}) {
  return (
    <div
      className="mt-3 grid grid-cols-3 gap-2 lg:hidden"
      aria-label="Numeric keypad"
    >
      {KEYPAD_DIGITS.map((digit) => (
        <Button
          key={digit}
          type="button"
          variant="secondary"
          className="h-14 font-mono text-lg font-semibold"
          aria-label={`Digit ${digit}`}
          onClick={() => onDigit(digit)}
        >
          {digit}
        </Button>
      ))}
      <div aria-hidden="true" />
      <Button
        type="button"
        variant="secondary"
        className="h-14 font-mono text-lg font-semibold"
        aria-label="Digit 0"
        onClick={() => onDigit("0")}
      >
        0
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="h-14"
        aria-label="Backspace"
        onClick={onBackspace}
      >
        <Delete aria-hidden="true" />
      </Button>
    </div>
  );
}

export function LoginScreen({
  demoMode,
  restaurantSlug,
  onSignIn,
  demoAccounts = staticDemoAccounts,
  onRegisterDemo,
}: {
  demoMode: boolean;
  restaurantSlug: string;
  onSignIn: (user: SignedInUser) => void;
  /** Demo mode only: the current session's passcode -> account lookup, extended live by registration. */
  demoAccounts?: Record<string, SignedInUser>;
  /** Demo mode only: registers a new in-memory team member for this session. */
  onRegisterDemo?: (input: {
    displayName: string;
    passcode: string;
  }) => RegisterDemoResult;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setHydrated(true), []);

  async function submitPasscode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!isValidPasscode(passcode)) {
      setError("Enter your 4-digit restaurant passcode.");
      return;
    }
    if (demoMode) {
      const account = demoAccounts[passcode];
      if (!account) {
        setError("Passcode not recognized. Check it or register.");
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
        code?: string;
      };
      if (!response.ok || !payload.user) {
        setError(
          payload.code === "org_lockout"
            ? "Too many failed attempts across this restaurant right now. Ask a manager who's already signed in to clear the lockout, or try again shortly."
            : (payload.error ?? "Unable to sign in."),
        );
        return;
      }
      onSignIn(payload.user);
    } catch {
      setError("The restaurant service is unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function submitRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get("displayName") ?? "").trim();
    const contact = String(form.get("contact") ?? "").trim();
    const chosenPasscode = String(form.get("passcode") ?? "").replace(
      /\D/g,
      "",
    );

    if (!isValidDisplayName(displayName)) {
      setError("Enter the name your manager knows you by.");
      return;
    }
    if (!isValidContact(contact)) {
      setError("Leave this blank or enter a valid phone number or email.");
      return;
    }
    if (!isValidPasscode(chosenPasscode)) {
      setError("Choose a 4-digit passcode.");
      return;
    }

    if (demoMode) {
      const result = onRegisterDemo?.({
        displayName,
        passcode: chosenPasscode,
      });
      if (!result || !result.ok) {
        setError(result?.error ?? "Unable to register right now.");
        return;
      }
      onSignIn(result.account);
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          restaurantSlug,
          displayName,
          contact,
          passcode: chosenPasscode,
        }),
      });
      const payload = (await response.json()) as {
        user?: SignedInUser;
        error?: string;
      };
      if (!response.ok || !payload.user) {
        setError(payload.error ?? "Unable to register right now.");
        return;
      }
      onSignIn(payload.user);
    } catch {
      setError("The restaurant service is unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,rgba(242,166,90,0.22),transparent_40%)]" />
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="relative w-full max-w-md">
        <div className="mb-7 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://www.monkswebster.com/assets/img/logo-light.png"
              alt="The Monk's Logo"
              className="h-10 object-contain"
            />
          </div>
          <p className="text-primary mt-5 text-xs font-bold tracking-[0.2em] uppercase">
            The Monk&apos;s
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
            {mode === "login"
              ? "Your shift starts here"
              : "Create your account"}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            {mode === "login"
              ? "One private passcode opens your schedule, table rotation, and tip estimate."
              : "Choose a 4-digit passcode. You'll be signed in immediately as a server — a manager can promote you later."}
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
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      value={passcode}
                      onChange={(event) =>
                        setPasscode(
                          event.target.value.replace(/\D/g, "").slice(0, 4),
                        )
                      }
                      placeholder="••••"
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
                  <NumericKeypad
                    onDigit={(digit) =>
                      setPasscode((current) => (current + digit).slice(0, 4))
                    }
                    onBackspace={() =>
                      setPasscode((current) => current.slice(0, -1))
                    }
                  />
                </div>
                {error ? (
                  <p className="text-destructive text-sm" aria-live="polite">
                    {error}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={pending || !hydrated}
                >
                  {pending ? "Opening workspace…" : "Open workspace"}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setError("");
                  }}
                  className="text-muted-foreground hover:text-foreground min-h-11 w-full text-sm font-medium"
                >
                  Not registered? Create an account
                </button>
              </form>
            ) : (
              <form onSubmit={submitRegister} className="space-y-5">
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
                  <Label htmlFor="contact">
                    Phone or email{" "}
                    <span className="text-muted-foreground font-normal">
                      (optional)
                    </span>
                  </Label>
                  <Input
                    id="contact"
                    name="contact"
                    placeholder="So your manager can reach you"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-passcode">Choose a passcode</Label>
                  <Input
                    id="register-passcode"
                    name="passcode"
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    autoComplete="new-password"
                    placeholder="••••"
                    className="font-mono tracking-[0.35em]"
                    required
                  />
                  <p className="text-muted-foreground text-xs">
                    4 digits. Must be different from every other passcode at
                    this restaurant.
                  </p>
                </div>
                {error ? (
                  <p className="text-destructive text-sm" aria-live="polite">
                    {error}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={pending || !hydrated}
                >
                  <UserPlus className="size-4" aria-hidden="true" />{" "}
                  {pending ? "Creating account…" : "Create account"}
                </Button>
              </form>
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
              Manager: <span className="text-foreground font-mono">2468</span> ·
              Server: <span className="text-foreground font-mono">1357</span> ·
              Owner: <span className="text-foreground font-mono">9999</span>
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
