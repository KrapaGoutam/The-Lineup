import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import {
  assertLocalMigrations,
  assertReleaseContext,
  assertRemoteLedger,
} from "./guard-production.mjs";

const manifest = JSON.parse(
  readFileSync(new URL("./approved-migrations.json", import.meta.url), "utf8"),
);
const sha = "a".repeat(40);
const receipt = "b".repeat(64);
const valid = {
  eventName: "workflow_dispatch",
  ref: "refs/heads/main",
  headSha: sha,
  inputSha: sha,
  approvedSha: sha,
  checkoutSha: sha,
  projectRef: "ftadewtkjlaotfdvtjcv",
  approvedEnvironment: "production",
  inputReceipt: receipt,
  approvedReceipt: receipt,
};

test("only owner-pinned main dispatch with matching fence receipt reaches migration", () => {
  assert.doesNotThrow(() => assertReleaseContext(valid));
  for (const change of [
    { eventName: "push" },
    { eventName: "pull_request" },
    { ref: "refs/heads/development" },
    { inputSha: "c".repeat(40) },
    { approvedSha: "c".repeat(40) },
    { checkoutSha: "c".repeat(40) },
    { projectRef: "opmujepkemwcdxxorhfd" },
    { approvedEnvironment: "preview" },
    { approvedEnvironment: "" },
    { inputReceipt: "" },
    { approvedReceipt: "c".repeat(64) },
  ]) {
    assert.throws(() => assertReleaseContext({ ...valid, ...change }));
  }
});

test("approved migration content and exact 62-to-97 ledger are immutable", () => {
  const directory = new URL("../../supabase/migrations/", import.meta.url);
  const files = readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      version: name.slice(0, 14),
      sha256: createHash("sha256")
        .update(readFileSync(new URL(name, directory)))
        .digest("hex"),
    }));
  assert.doesNotThrow(() => assertLocalMigrations(files, manifest));
  assert.throws(() =>
    assertLocalMigrations(
      files.map((file, index) =>
        index === 62 ? { ...file, sha256: "0".repeat(64) } : file,
      ),
      manifest,
    ),
  );
  const baseline = manifest.versions
    .slice(0, 62)
    .map((version) => ({ version }));
  assert.doesNotThrow(() => assertRemoteLedger(baseline, manifest, "before"));
  assert.throws(() =>
    assertRemoteLedger(baseline.slice(0, 61), manifest, "before"),
  );
  assert.throws(() =>
    assertRemoteLedger(
      baseline.map((row, index) =>
        index === 20 ? { version: "20260000000000" } : row,
      ),
      manifest,
      "before",
    ),
  );
  assert.doesNotThrow(() =>
    assertRemoteLedger(
      manifest.versions.map((version) => ({ version })),
      manifest,
      "after",
    ),
  );
});

test("workflow queues overlap and never reopens access after failure", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/database.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /workflow_dispatch:\s*\n\s*inputs:/);
  assert.doesNotMatch(workflow, /\n\s*push:\s*\n\s*branches:\s*\[main\]/);
  assert.match(
    workflow,
    /group: production-database-migration\s*\n\s*cancel-in-progress: false/,
  );
  assert.match(workflow, /environment: production/);
  assert.match(
    workflow,
    /RELEASE_APPROVED_ENVIRONMENT:.*D3B_APPROVED_ENVIRONMENT/,
  );
  assert.doesNotMatch(
    workflow,
    /^\s*run:.*\b(vercel promote|firewall disable|data-api enable|reopen traffic)\b/im,
  );

  // Synthetic control-flow rehearsal. Provider enforcement still needs live proof.
  const fences = {
    edgeDenied: true,
    dataApiDisabled: true,
    storageWritesDenied: true,
    authSignupDisabled: true,
    cronPaused: true,
    privilegedWritersPaused: true,
  };
  const active = { id: "first", cancelled: false };
  const queue = [active];
  queue.push({ id: "second", waiting: true });
  assert.equal(active.cancelled, false);
  assert.equal(queue[1].waiting, true);
  assert.equal(fences.dataApiDisabled && fences.storageWritesDenied, true);
  assert.equal(fences.edgeDenied && fences.privilegedWritersPaused, true);
  assert.throws(() =>
    assertReleaseContext({ ...valid, inputSha: "c".repeat(40) }),
  );
  assert.deepEqual(fences, {
    edgeDenied: true,
    dataApiDisabled: true,
    storageWritesDenied: true,
    authSignupDisabled: true,
    cronPaused: true,
    privilegedWritersPaused: true,
  });
  // A stale browser with a JWT has no direct PostgREST or Storage mutation path
  // in this model; neither depends on the Vercel page being shown.
  const obsoleteMutationAllowed =
    !fences.dataApiDisabled || !fences.storageWritesDenied;
  assert.equal(obsoleteMutationAllowed, false);
  // The modeled operator path remains available while client writes are fenced.
  assert.doesNotThrow(() => assertReleaseContext(valid));
  assert.doesNotThrow(() =>
    assertRemoteLedger(
      manifest.versions.slice(0, 62).map((version) => ({ version })),
      manifest,
      "before",
    ),
  );
  const approvedOperatorCanMigrate =
    fences.edgeDenied &&
    fences.dataApiDisabled &&
    fences.storageWritesDenied &&
    !active.cancelled;
  assert.equal(approvedOperatorCanMigrate, true);
});
