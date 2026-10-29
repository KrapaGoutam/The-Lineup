// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from "vitest";
import { mutateRecipeImageData, signRecipeImages } from "./recipe-image-data";
import { imagePaths } from "../domain/image-rules";
const org = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222";
const old = imagePaths(org, id, "image/jpeg");
const blob = new Blob([new Uint8Array([255, 216, 255, 1])], {
  type: "image/jpeg",
});
const files = { hero: blob, thumb: blob };
function fixture() {
  const events: string[] = [];
  const read = vi.fn().mockResolvedValue({ data: { ...old, is_active: true } });
  const upload = vi.fn().mockImplementation(async () => {
    events.push("upload");
    return { error: null };
  });
  const remove = vi.fn().mockImplementation(async (paths: string[]) => {
    events.push("delete");
    return { data: paths.map((name) => ({ name })), error: null };
  });
  const rpc = vi.fn().mockImplementation(async () => {
    events.push("metadata");
    return { data: { id, version: 7 }, error: null };
  });
  const sign = vi.fn().mockImplementation(async (paths: string[]) => ({
    data: paths.map((path) => ({
      path,
      signedUrl: `https://private.invalid/${path}?token=signed`,
    })),
  }));
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: read,
  };
  const client = {
    from: vi.fn(() => query),
    rpc,
    storage: {
      from: vi.fn(() => ({ upload, remove, createSignedUrls: sign })),
    },
  } as unknown as Parameters<typeof mutateRecipeImageData>[0];
  return { client, events, upload, remove, rpc, read, sign };
}
beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
describe("caller-session image data", () => {
  it("uploads immutable pair, switches version, then deletes old", async () => {
    const f = fixture();
    const result = await mutateRecipeImageData(f.client, org, id, 6, files);
    expect(result).toMatchObject({ ok: true, data: { id, version: 7 } });
    expect(f.events).toEqual(["upload", "upload", "metadata", "delete"]);
    expect(f.upload.mock.calls[0][0]).not.toBe(old.image_path);
    expect(f.upload.mock.calls[0][2]).toMatchObject({
      upsert: false,
      cacheControl: "31536000",
    });
    expect(f.rpc.mock.calls[0][1]).toMatchObject({
      p_organization_id: org,
      p_expected_version: 6,
    });
    expect(f.remove).toHaveBeenCalledWith(Object.values(old));
  });
  it("compensates hero after thumbnail failure", async () => {
    const f = fixture();
    f.upload
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: "secret" } });
    expect((await mutateRecipeImageData(f.client, org, id, 6, files)).ok).toBe(
      false,
    );
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.remove).toHaveBeenCalledWith([f.upload.mock.calls[0][0]]);
  });
  it.each(["PT409", "42501", "XX000"])(
    "compensates both after metadata %s",
    async (code) => {
      const f = fixture();
      f.rpc.mockResolvedValue({ error: { code } });
      expect(
        (await mutateRecipeImageData(f.client, org, id, 6, files)).ok,
      ).toBe(false);
      expect(f.remove).toHaveBeenCalledExactlyOnceWith(
        f.upload.mock.calls.map((c) => c[0]),
      );
    },
  );
  it("does not hide primary stale error when compensation fails", async () => {
    const f = fixture();
    f.rpc.mockResolvedValue({ error: { code: "PT409" } });
    f.remove.mockRejectedValue(new Error("secret"));
    expect(
      await mutateRecipeImageData(f.client, org, id, 6, files),
    ).toMatchObject({ ok: false, kind: "stale" });
    expect(console.warn).toHaveBeenCalledWith(
      "Recipe photo compensation cleanup failed",
    );
  });
  it("keeps successful replacement authoritative if old cleanup fails", async () => {
    const f = fixture();
    f.remove.mockResolvedValue({ error: { message: "secret" } });
    expect(
      await mutateRecipeImageData(f.client, org, id, 6, files),
    ).toMatchObject({ ok: true, data: { cleanupWarning: true } });
  });
  it("clears metadata before removing old objects", async () => {
    const f = fixture();
    expect((await mutateRecipeImageData(f.client, org, id, 6)).ok).toBe(true);
    expect(f.events).toEqual(["metadata", "delete"]);
    expect(f.rpc.mock.calls[0][1]).toMatchObject({
      p_image_path: null,
      p_thumb_path: null,
    });
  });
  it("retains old objects on failed removal", async () => {
    const f = fixture();
    f.rpc.mockResolvedValue({ error: { code: "PT409" } });
    await mutateRecipeImageData(f.client, org, id, 6);
    expect(f.remove).not.toHaveBeenCalled();
  });
  it.each([null, { ...old, is_active: false }])(
    "rejects inaccessible or archived recipe",
    async (data) => {
      const f = fixture();
      f.read.mockResolvedValue({ data });
      expect(
        await mutateRecipeImageData(f.client, org, id, 6, files),
      ).toMatchObject({ ok: false, kind: "permission" });
      expect(f.upload).not.toHaveBeenCalled();
    },
  );
  it("rejects invalid bytes before upload", async () => {
    const f = fixture();
    await mutateRecipeImageData(f.client, org, id, 6, {
      hero: new Blob(["bad"], { type: "image/jpeg" }),
      thumb: blob,
    });
    expect(f.upload).not.toHaveBeenCalled();
  });
  it("signs both scoped paths with TTL 3600", async () => {
    const f = fixture();
    const result = await signRecipeImages(f.client, org, id, old);
    expect(f.sign).toHaveBeenCalledWith(Object.values(old), 3600);
    expect(result.hero).toContain("token=signed");
    expect(result.thumb).toContain("-thumb.jpg");
  });
  it("does not sign absent or foreign paths", async () => {
    const f = fixture();
    expect(await signRecipeImages(f.client, id, org, old)).toMatchObject({
      hero: null,
      thumb: null,
    });
    expect(f.sign).not.toHaveBeenCalled();
  });
});
