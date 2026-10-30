import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { RecipeImage } from "./recipe-image";
import { RecipeImageSection } from "./recipe-image-section";
const mock = vi.hoisted(() => ({
  sign: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  prepare: vi.fn(),
}));
vi.mock("../actions/recipe-image-actions", () => ({
  getRecipeImageUrlsAction: mock.sign,
  uploadRecipeImageAction: mock.upload,
  removeRecipeImageAction: mock.remove,
}));
vi.mock("../domain/image-pipeline", () => ({
  prepareRecipeImage: mock.prepare,
}));
const metadata = {
  image_path: "org/id/image.webp",
  image_thumb_path: "org/id/image-thumb.webp",
};
const initial = {
  hero: "https://private.invalid/hero?token=signed",
  thumb: "https://private.invalid/thumb?token=signed",
  expiresAt: Date.now() + 3600000,
};
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
beforeEach(() => {
  vi.clearAllMocks();
  mock.sign.mockResolvedValue({ ok: true, data: initial });
  mock.prepare.mockResolvedValue({
    hero: new Blob(["test"], { type: "image/webp" }),
    thumb: new Blob(["test"], { type: "image/webp" }),
  });
  mock.upload.mockResolvedValue({
    ok: true,
    data: { ...metadata, id: "id", version: 3 },
  });
  mock.remove.mockResolvedValue({
    ok: true,
    data: { image_path: null, image_thumb_path: null, id: "id", version: 4 },
  });
});
afterEach(cleanup);
const props = () => ({
  recipeId: "id",
  name: "Synthetic drink",
  version: 2,
  restaurantSlug: "the-monks",
  onChanged: vi.fn(),
  onBusy: vi.fn(),
  onStale: vi.fn(),
  onSessionInvalid: vi.fn(),
});
describe("recipe photo UI", () => {
  it("renders private hero with recipe alt and reserved box", () => {
    render(
      <RecipeImage
        recipeId="id"
        name="Synthetic drink"
        hasImage
        restaurantSlug="org"
        initial={initial}
      />,
    );
    expect(screen.getByRole("img")).toHaveAttribute("src", initial.hero);
    expect(screen.getByRole("img")).toHaveAttribute("alt", "Synthetic drink");
  });
  it("uses lazy thumbnail only", () => {
    render(
      <RecipeImage
        recipeId="id"
        name="Drink"
        hasImage
        restaurantSlug="org"
        initial={initial}
        thumbnail
      />,
    );
    expect(screen.getByRole("img")).toHaveAttribute("src", initial.thumb);
    expect(screen.getByRole("img")).toHaveAttribute("loading", "lazy");
  });
  it("shows decorative placeholder without requests", () => {
    render(<RecipeImage recipeId="id" name="Drink" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(
      screen.getByTestId("recipe-image").querySelector("svg"),
    ).toHaveAttribute("aria-hidden", "true");
    expect(mock.sign).not.toHaveBeenCalled();
  });
  it("refreshes after one image failure and falls back after second", async () => {
    render(
      <RecipeImage
        recipeId="id"
        name="Drink"
        hasImage
        restaurantSlug="org"
        initial={initial}
      />,
    );
    const original = screen.getByRole("img");
    fireEvent.error(original);
    await waitFor(() => expect(screen.getByRole("img")).not.toBe(original));
    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("img")).toBeNull();
    expect(mock.sign).toHaveBeenCalledTimes(1);
  });
  it("locks unsaved photo input", () => {
    render(<RecipeImageSection {...props()} recipeId={undefined} />);
    expect(
      screen.getByText("Save the recipe first, then add a photo."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add photo" })).toBeNull();
  });
  it.each(["Staff", "archived"])(
    "omits mutation controls for %s read-only surface",
    () => {
      render(
        <RecipeImageSection
          {...props()}
          disabled
          metadata={metadata}
          initial={initial}
        />,
      );
      expect(screen.queryByRole("button", { name: /photo/i })).toBeNull();
    },
  );
  it("prepares, uploads, reports success and updates version", async () => {
    const p = props();
    render(<RecipeImageSection {...p} />);
    fireEvent.change(screen.getByLabelText("Recipe photo"), {
      target: {
        files: [new File(["source"], "fixture.png", { type: "image/png" })],
      },
    });
    await waitFor(() => expect(screen.getByText("Photo saved.")).toBeVisible());
    expect(mock.upload).toHaveBeenCalledTimes(1);
    expect(p.onChanged).toHaveBeenCalledWith(
      3,
      expect.objectContaining(metadata),
    );
    expect(p.onBusy.mock.calls).toEqual([[true], [false]]);
  });
  it.each([
    "Unsupported image type",
    "Image must be no larger than 8 MB",
    "Image is too small",
  ])("keeps prior image on validation: %s", async (message) => {
    mock.prepare.mockRejectedValue(new Error(message));
    render(
      <RecipeImageSection {...props()} metadata={metadata} initial={initial} />,
    );
    fireEvent.change(screen.getByLabelText("Recipe photo"), {
      target: {
        files: [new File(["source"], "fixture.png", { type: "image/png" })],
      },
    });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(message),
    );
    expect(screen.getByRole("img")).toHaveAttribute("src", initial.hero);
    expect(mock.upload).not.toHaveBeenCalled();
  });
  it("disables duplicate operations during processing", async () => {
    let resolve!: (value: unknown) => void;
    mock.prepare.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(<RecipeImageSection {...props()} />);
    const input = screen.getByLabelText("Recipe photo");
    fireEvent.change(input, { target: { files: [new File(["a"], "a.png")] } });
    expect(screen.getByText("Preparing image…")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add photo" })).toBeDisabled();
    resolve({ hero: new Blob(["a"]), thumb: new Blob(["a"]) });
    await waitFor(() => expect(screen.getByText("Photo saved.")).toBeVisible());
  });
  it("confirms removal, supports cancel and then removes", async () => {
    const p = props();
    render(<RecipeImageSection {...p} metadata={metadata} initial={initial} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    expect(mock.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep photo" }));
    expect(mock.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove photo",
      }),
    );
    await waitFor(() =>
      expect(p.onChanged).toHaveBeenCalledWith(
        4,
        expect.objectContaining({ image_path: null }),
      ),
    );
  });
  it("retains prior photo and reports stale metadata rejection", async () => {
    const p = props();
    mock.upload.mockResolvedValue({
      ok: false,
      kind: "stale",
      error: "Reload latest",
    });
    render(<RecipeImageSection {...p} metadata={metadata} initial={initial} />);
    fireEvent.change(screen.getByLabelText("Recipe photo"), {
      target: { files: [new File(["a"], "a.png")] },
    });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Reload latest"),
    );
    expect(p.onStale).toHaveBeenCalled();
    expect(p.onChanged).not.toHaveBeenCalled();
    expect(screen.getByRole("img")).toBeVisible();
  });
  it("demo uses local preview without live mutation", async () => {
    const p = props();
    render(<RecipeImageSection {...p} demo />);
    fireEvent.change(screen.getByLabelText("Recipe photo"), {
      target: { files: [new File(["a"], "a.png")] },
    });
    await waitFor(() =>
      expect(p.onChanged).toHaveBeenCalledWith(
        3,
        { image_path: null, image_thumb_path: null },
        expect.stringContaining("data:"),
      ),
    );
    expect(mock.upload).not.toHaveBeenCalled();
    expect(mock.sign).not.toHaveBeenCalled();
  });
});
