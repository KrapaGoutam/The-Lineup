import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import { createPersonAuthPassword } from "@/lib/passcode-security";
import { universalPinLogin } from "./universal-pin-login";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  read: vi.fn(),
  mark: vi.fn(),
  clear: vi.fn(),
  lookup: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
    },
  }),
}));
vi.mock("./global-pin", () => ({
  readPersonalPinAccount: mocks.read,
  markPinAttemptSucceeded: mocks.mark,
}));
vi.mock("@/features/context/data/context-cookie-writer", () => ({
  clearActiveContextCookie: mocks.clear,
}));
const account = {
  profile_id: "person",
  synthetic_email: "internal@private.invalid",
  locator: "locator",
  operation_id: null,
  updated_at: "version",
};
const chain = {
  select: () => chain,
  eq: () => chain,
  is: () => chain,
  maybeSingle: mocks.lookup,
};
const admin = { from: () => chain } as unknown as SupabaseClient<Database>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_PIN_PEPPER", "b5-test-only-pepper-at-least-32-characters");
  mocks.lookup.mockResolvedValue({ data: account, error: null });
  mocks.read.mockResolvedValue(account);
  mocks.signInWithPassword.mockResolvedValue({
    data: { user: { id: "person" }, session: { user: { id: "person" } } },
    error: null,
  });
});
describe("universal PIN Auth binding", () => {
  it("uses only the person-bound password, and returns no lookup identity", async () => {
    const response = await universalPinLogin(admin, "0007", "attempt");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ next: "/" });
    expect(mocks.signInWithPassword).toHaveBeenCalledExactlyOnceWith({
      email: account.synthetic_email,
      password: createPersonAuthPassword("person", "0007"),
    });
    expect(mocks.mark).toHaveBeenCalledWith(admin, "attempt");
    expect(mocks.clear).toHaveBeenCalledOnce();
  });
  it.each([
    { user: { id: "other" }, session: { user: { id: "other" } } },
    { user: { id: "person" }, session: { user: { id: "other" } } },
    { user: { id: "person" }, session: null },
  ])(
    "rejects an unbound/missing session without exposing identity",
    async (data) => {
      mocks.signInWithPassword.mockResolvedValue({ data, error: null });
      const response = await universalPinLogin(admin, "0007", "attempt");
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "PIN not recognized." });
      expect(mocks.mark).not.toHaveBeenCalled();
      if (data.session) expect(mocks.signOut).toHaveBeenCalledOnce();
    },
  );
  it("unknown PIN never calls Auth and has the same generic error", async () => {
    mocks.lookup.mockResolvedValue({ data: null, error: null });
    expect(
      await (await universalPinLogin(admin, "0007", "attempt")).json(),
    ).toEqual({ error: "PIN not recognized." });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
  it("concurrent reset revokes the session just established", async () => {
    mocks.read.mockResolvedValue({ ...account, operation_id: "reset" });
    expect((await universalPinLogin(admin, "0007", "attempt")).status).toBe(
      401,
    );
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.mark).not.toHaveBeenCalled();
  });
  it("registry errors are recoverable failures, never false no-account responses", async () => {
    mocks.lookup.mockResolvedValue({ data: null, error: {} });
    expect((await universalPinLogin(admin, "0007", "attempt")).status).toBe(
      503,
    );
  });
});
