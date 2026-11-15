"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completePinLogin } from "@/lib/pin-login-navigation";
import { requestSignOut } from "@/lib/client-sign-out";

export function PinEnrollment() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/passcode/enroll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPasscode: values.get("currentPasscode"),
          newPasscode: values.get("newPasscode"),
        }),
      });
      const payload = (await response.json()) as {
        next?: string;
        error?: string;
      };
      form.reset();
      if (!response.ok || !payload.next) {
        setError(
          payload.error ?? "Unable to update your PIN. Please try again.",
        );
        return;
      }
      completePinLogin(payload.next);
    } catch {
      setError("PIN service unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center p-4">
      <Card className="w-full">
        <CardHeader>
          <h1 className="text-lg font-semibold">Enable your personal PIN</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Your restaurant sign-in was verified. That PIN may already belong to
            someone else in The Lineup. Choose a different PIN to use across all
            your restaurants. Your location assignments stay the same.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="current-pin">Current restaurant PIN</Label>
              <Input
                id="current-pin"
                name="currentPasscode"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4}"
                minLength={4}
                maxLength={4}
                required
                autoComplete="current-password"
                disabled={pending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-pin">New personal PIN</Label>
              <Input
                id="new-pin"
                name="newPasscode"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4}"
                minLength={4}
                maxLength={4}
                required
                autoComplete="new-password"
                disabled={pending}
                aria-describedby={error ? "pin-error" : undefined}
              />
            </div>
            {error && (
              <p
                id="pin-error"
                role="alert"
                className="text-destructive text-sm"
              >
                {error}
              </p>
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "Updating PIN…" : "Save personal PIN"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={async () => {
                await requestSignOut();
                window.location.replace("/");
              }}
            >
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
