import { readFileSync } from "node:fs";
import path from "node:path";

import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ClientHydrationMarker } from "./hydration-marker";

const read = (relative: string) =>
  readFileSync(path.resolve(import.meta.dirname, relative), "utf8");

describe("ClientHydrationMarker", () => {
  afterEach(() => document.body.removeAttribute("data-hydrated"));

  it("flags the body once mounted", () => {
    expect(document.body.getAttribute("data-hydrated")).toBeNull();
    render(<ClientHydrationMarker />);
    expect(document.body.getAttribute("data-hydrated")).toBe("true");
  });

  // Tasks V1.1 T-6: the app hydrates inside a Suspense boundary (the `?tab=`
  // module address). A marker in the layout fires before that subtree is
  // interactive, so a fast `fill()` on the passcode field is reset by React's
  // hydration (flaky WebKit host-tablet sign-in on `/r/[slug]`). The marker
  // must be hydrated with the app, never with the layout.
  it("is mounted with the app inside its Suspense boundary, not in the layout", () => {
    expect(read("../app/layout.tsx")).not.toContain("ClientHydrationMarker");

    const app = read("./restaurant-operations-app.tsx");
    const boundary = app.slice(app.indexOf("<Suspense fallback={null}>"));
    expect(boundary.slice(0, boundary.indexOf("</Suspense>"))).toContain(
      "<ClientHydrationMarker />",
    );
  });
});
