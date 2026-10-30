import {
  parseTableState,
  serializeTableState,
  type ColumnSpec,
  type TableState,
} from "./table-filters";
import { z } from "zod";
const filterSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    op: z.enum(["contains", "startsWith", "equals"]),
    value: z.string().max(1000),
  }),
  z.object({
    type: z.literal("select"),
    values: z.array(z.string().max(300)).max(500),
  }),
  z.object({
    type: z.literal("number"),
    op: z.enum(["eq", "lt", "lte", "gt", "gte", "between"]),
    value: z.number(),
    to: z.number().optional(),
  }),
  z.object({
    type: z.literal("date"),
    preset: z.enum(["today", "7d", "30d", "custom"]),
    from: z.string().optional(),
    to: z.string().optional(),
  }),
]);
export const viewPayloadSchema = z.object({
  version: z.literal(1),
  owns: z
    .array(
      z.enum(["search", "filters", "sort", "hidden", "order", "showArchived"]),
    )
    .max(6),
  state: z.object({
    search: z.string().max(1000),
    filters: z.record(z.string().max(80), filterSchema),
    sort: z
      .array(z.object({ id: z.string().max(80), dir: z.enum(["asc", "desc"]) }))
      .max(100),
    hidden: z.array(z.string().max(80)).max(100),
    order: z.array(z.string().max(80)).max(100),
    showArchived: z.boolean(),
  }),
});
export const VIEW_PARTS = [
  "search",
  "filters",
  "sort",
  "hidden",
  "order",
  "showArchived",
] as const;
export type ViewPart = (typeof VIEW_PARTS)[number];
export type ColumnLayout = { hidden: string[]; order: string[] };
export type ViewPayload = {
  version: 1;
  owns: ViewPart[];
  state: TableState & ColumnLayout & { showArchived: boolean };
};
export type SavedView = {
  id: string;
  profileId: string;
  name: string;
  isDefault: boolean;
  version: number;
  payload: unknown;
};
export function normalizeLayout(
  ids: readonly string[],
  layout: Partial<ColumnLayout>,
  locked: readonly string[] = [],
): ColumnLayout {
  const known = new Set(ids);
  const order = [
    ...new Set(
      (Array.isArray(layout.order) ? layout.order : []).filter(
        (id) => typeof id === "string" && known.has(id),
      ),
    ),
  ];
  for (const id of ids) if (!order.includes(id)) order.push(id);
  return {
    order,
    hidden: [
      ...new Set(
        (Array.isArray(layout.hidden) ? layout.hidden : []).filter(
          (id) =>
            typeof id === "string" && known.has(id) && !locked.includes(id),
        ),
      ),
    ],
  };
}
export function readViewPayload(
  raw: unknown,
  columns: readonly Pick<ColumnSpec<unknown>, "id" | "type">[],
): ViewPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (
    value.version !== 1 ||
    !Array.isArray(value.owns) ||
    !value.state ||
    typeof value.state !== "object"
  )
    return null;
  const state = value.state as Record<string, unknown>;
  const owns = value.owns.filter((part): part is ViewPart =>
    VIEW_PARTS.includes(part as ViewPart),
  );
  // Reuse the URL parser as the runtime validator for filters and sort.
  const params = new URLSearchParams();
  if (typeof state.search === "string")
    params.set("q", state.search.slice(0, 1000));
  if (Array.isArray(state.sort))
    params.set(
      "sort",
      state.sort
        .filter(
          (s) =>
            s &&
            typeof s === "object" &&
            typeof s.id === "string" &&
            (s.dir === "asc" || s.dir === "desc"),
        )
        .map((s) => `${s.id}:${s.dir}`)
        .join(","),
    );
  if (state.filters && typeof state.filters === "object")
    for (const [id, filter] of Object.entries(state.filters)) {
      const valid = filterSchema.safeParse(filter);
      if (valid.success)
        serializeTableState({
          filters: { [id]: valid.data },
          sort: [],
          search: "",
        }).forEach((v, k) => params.set(k, v));
    }
  const parsed = parseTableState(params, columns);
  return {
    version: 1,
    owns,
    state: {
      ...parsed,
      ...normalizeLayout(
        columns.map((c) => c.id),
        {
          hidden: Array.isArray(state.hidden) ? state.hidden : [],
          order: Array.isArray(state.order) ? state.order : [],
        },
      ),
      showArchived: state.showArchived === true,
    },
  };
}
export function captureView(
  owns: ViewPart[],
  state: TableState,
  layout: ColumnLayout,
  showArchived: boolean,
): ViewPayload {
  // URL round-trip strips inactive filter drafts rather than persisting them.
  return {
    version: 1,
    owns: [...owns],
    state: { ...state, filters: state.filters, ...layout, showArchived },
  };
}
export function applyView(
  current: TableState & ColumnLayout & { showArchived: boolean },
  payload: ViewPayload,
) {
  const next = { ...current };
  for (const part of payload.owns)
    Object.assign(next, { [part]: payload.state[part] });
  return next;
}
export function hasExplicitInventoryState(search: string): boolean {
  return [...new URLSearchParams(search).keys()].some((key) =>
    key.startsWith("inv."),
  );
}
export function cleanViewState(
  state: TableState,
  columns: readonly Pick<ColumnSpec<unknown>, "id" | "type">[],
): TableState {
  return parseTableState(serializeTableState(state), columns);
}
