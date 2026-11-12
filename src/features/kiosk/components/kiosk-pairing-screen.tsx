"use client";

import * as React from "react";
import {
  AlertCircle,
  KeyRound,
  Loader2,
  RotateCcw,
  Tablet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  isValidPairingCodeFormat,
  normalizePairingCode,
  PAIRING_CODE_ALPHABET,
  type KioskActiveContext,
} from "../domain/kiosk-device";
import { pairKioskDeviceAction } from "../actions/kiosk-pairing-actions";

export interface KioskPairingScreenProps {
  readonly onPaired?: (context: KioskActiveContext) => void;
  readonly defaultCode?: string;
}

const KEYPAD_COLUMNS = 8;

/**
 * Keypad rows are derived from the shared pairing alphabet, so every
 * character the generator can emit has a key (and vice versa).
 */
export const KEYPAD_ROWS: readonly (readonly string[])[] = Array.from(
  { length: Math.ceil(PAIRING_CODE_ALPHABET.length / KEYPAD_COLUMNS) },
  (_, row) =>
    PAIRING_CODE_ALPHABET.slice(
      row * KEYPAD_COLUMNS,
      (row + 1) * KEYPAD_COLUMNS,
    ).split(""),
);

export function KioskPairingScreen({
  onPaired,
  defaultCode = "",
}: KioskPairingScreenProps) {
  const [code, setCode] = React.useState<string>(() =>
    normalizePairingCode(defaultCode).slice(0, 6),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [isShaking, setIsShaking] = React.useState<boolean>(false);

  const triggerShake = React.useCallback(() => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  }, []);

  const handlePair = React.useCallback(
    async (rawCode: string) => {
      const normalized = normalizePairingCode(rawCode);
      if (!isValidPairingCodeFormat(normalized)) {
        setError("Pairing code must be 6 characters.");
        triggerShake();
        return;
      }

      setError(null);
      setIsSubmitting(true);

      try {
        const res = await pairKioskDeviceAction({ pairingCode: normalized });
        if (!res.ok) {
          setError(res.error);
          triggerShake();
          setIsSubmitting(false);
          return;
        }

        if (onPaired) {
          onPaired(res.data);
        } else {
          // If no custom handler, reload the page to refresh server component with cookie
          window.location.reload();
        }
      } catch (err: unknown) {
        console.error("Pairing failure", err);
        setError("An unexpected error occurred while pairing the device.");
        triggerShake();
        setIsSubmitting(false);
      }
    },
    [onPaired, triggerShake],
  );

  const handleKeyTap = React.useCallback(
    (char: string) => {
      if (isSubmitting) return;
      setError(null);
      if (code.length < 6) {
        const nextCode = code + char;
        setCode(nextCode);
        if (nextCode.length === 6) {
          void handlePair(nextCode);
        }
      }
    },
    [code, isSubmitting, handlePair],
  );

  const handleBackspace = React.useCallback(() => {
    if (isSubmitting) return;
    setError(null);
    setCode((prev) => prev.slice(0, -1));
  }, [isSubmitting]);

  const handleClear = React.useCallback(() => {
    if (isSubmitting) return;
    setError(null);
    setCode("");
  }, [isSubmitting]);

  // Physical keyboard support
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isSubmitting) return;

      if (e.key === "Backspace") {
        e.preventDefault();
        handleBackspace();
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        handleClear();
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (code.length === 6) {
          void handlePair(code);
        }
        return;
      }

      // Ignore shortcuts (Ctrl/Cmd/Alt + key) and non-single-character keys.
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;

      const key = e.key.toUpperCase();
      // Only process keys that exist on the keypad
      if (PAIRING_CODE_ALPHABET.includes(key)) {
        e.preventDefault();
        handleKeyTap(key);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    code,
    isSubmitting,
    handleBackspace,
    handleClear,
    handleKeyTap,
    handlePair,
  ]);

  return (
    <div
      data-testid="kiosk-pairing-screen"
      className="flex min-h-screen w-full flex-col items-center justify-center bg-[#0b0b0d] p-4 text-[#f6f3ed] selection:bg-[#f2a65a]/30 sm:p-6 md:p-8"
    >
      {/* Decorative ambient background */}
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-[#f2a65a]/10 blur-[100px]" />
      </div>

      <div className="relative z-10 flex w-full max-w-xl flex-col items-center">
        {/* Header Branding */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#f2a65a]/30 bg-[#1c140d] text-[#f2a65a] shadow-lg shadow-[#f2a65a]/5">
            <Tablet className="h-7 w-7" />
          </div>
          <h1 className="font-serif text-3xl font-medium tracking-tight text-[#f6f3ed] sm:text-4xl">
            Clock In / Out Kiosk
          </h1>
          <p className="mt-2 text-sm text-[#aaa7a1] sm:text-base">
            Enter the 6-character pairing code generated by your manager in{" "}
            <span className="font-medium text-[#f6f3ed]">
              Location Settings &gt; Kiosks
            </span>
            .
          </p>
        </div>

        {/* Pairing Code Display (Split 3 - 3) */}
        <div
          className={`mb-6 flex items-center justify-center gap-2 transition-transform sm:gap-3 ${
            isShaking ? "animate-bounce" : ""
          }`}
          data-testid="pairing-code-display"
        >
          {[0, 1, 2, 3, 4, 5].map((index) => {
            const char = code[index] || "";
            const isCurrent = index === code.length && !isSubmitting;
            return (
              <React.Fragment key={index}>
                {index === 3 && (
                  <span className="text-xl font-bold text-[#aaa7a1]/50 sm:text-2xl">
                    –
                  </span>
                )}
                <div
                  className={`flex h-14 w-11 items-center justify-center rounded-xl border-2 font-mono text-2xl font-bold transition-all sm:h-16 sm:w-13 sm:text-3xl ${
                    char
                      ? "border-[#f2a65a] bg-[#1c140d] text-[#f2a65a] shadow-md shadow-[#f2a65a]/10"
                      : isCurrent
                        ? "animate-pulse border-[#f2a65a]/60 bg-[#141416] text-[#f6f3ed]"
                        : "border-white/10 bg-[#141416] text-[#aaa7a1]"
                  }`}
                  data-testid={`code-box-${index}`}
                >
                  {char}
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Error Alert */}
        {error && (
          <div
            className="mb-4 flex w-full max-w-md items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-sm text-red-300 backdrop-blur-sm"
            role="alert"
            data-testid="pairing-error-alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <p className="flex-1">{error}</p>
          </div>
        )}

        {/* Alphanumeric Touch Keyboard */}
        <div
          className="flex w-full flex-col gap-2 rounded-2xl border border-white/10 bg-[#141416]/90 p-3 shadow-2xl backdrop-blur-md sm:p-4"
          data-testid="virtual-keypad"
        >
          {KEYPAD_ROWS.map((row, rowIndex) => (
            <div
              key={rowIndex}
              className="flex w-full justify-center gap-1.5 sm:gap-2"
            >
              {row.map((char) => (
                <button
                  key={char}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleKeyTap(char)}
                  className="flex h-12 max-w-[56px] flex-1 items-center justify-center rounded-lg border border-white/5 bg-[#1b1b1e] text-lg font-semibold text-[#f6f3ed] transition hover:border-[#f2a65a]/40 hover:bg-[#252329] focus:ring-2 focus:ring-[#f2a65a]/40 focus:outline-none active:scale-95 disabled:pointer-events-none disabled:opacity-40"
                  data-testid={`key-${char}`}
                >
                  {char}
                </button>
              ))}
            </div>
          ))}

          {/* Action Row: Clear, Enter/Pair, Backspace */}
          <div className="mt-1 flex w-full justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting || code.length === 0}
              onClick={handleClear}
              className="h-12 flex-1 border-white/10 text-xs font-medium hover:bg-white/5 sm:text-sm"
              data-testid="key-clear"
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Clear
            </Button>

            <Button
              type="button"
              disabled={isSubmitting || code.length !== 6}
              onClick={() => handlePair(code)}
              className="h-12 flex-2 bg-[#f2a65a] text-sm font-semibold text-[#1c1007] shadow-md shadow-[#f2a65a]/20 hover:bg-[#e09244] sm:text-base"
              data-testid="pair-submit-button"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Pairing...
                </>
              ) : (
                <>
                  <KeyRound className="mr-2 h-4 w-4" />
                  Pair Kiosk Tablet
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting || code.length === 0}
              onClick={handleBackspace}
              className="h-12 flex-1 border-white/10 text-xs font-medium hover:bg-white/5 sm:text-sm"
              data-testid="key-backspace"
            >
              Delete
            </Button>
          </div>
        </div>

        {/* Pairing Help Note */}
        <div className="mt-6 text-center text-xs text-[#aaa7a1]/70">
          <p>
            Pairing binds this physical device securely to a single restaurant
            location.
          </p>
          <p className="mt-1">
            Codes expire after 15 minutes and can only be used once.
          </p>
        </div>
      </div>
    </div>
  );
}
