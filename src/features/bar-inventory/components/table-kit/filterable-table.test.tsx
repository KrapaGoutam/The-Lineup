import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  dropForeignTableState,
  FilterableTable,
  TableProfileContext,
  writeTableState,
  type TableColumn,
} from "./filterable-table";

type Row = { id: string; name: string; vendor: string | null; total: number };

const rows: Row[] = [
  { id: "1", name: "Tito's", vendor: "Faust", total: 3 },
  { id: "2", name: "Casamigos", vendor: "Faust", total: 8 },
  { id: "3", name: "Modelo", vendor: "Del Papa", total: 3 },
];

const columns: TableColumn<Row>[] = [
  {
    id: "name",
    label: "Name",
    type: "text",
    sortable: true,
    searchable: true,
    get: (r) => r.name,
    render: (r) => r.name,
  },
  {
    id: "vendor",
    label: "Vendor",
    type: "select",
    sortable: true,
    get: (r) => r.vendor,
    render: (r) => r.vendor ?? "—",
  },
  {
    id: "total",
    label: "Total",
    type: "number",
    sortable: true,
    align: "right",
    get: (r) => r.total,
    render: (r) => r.total,
  },
];

describe("V1.1 scoped column preferences and defaults", () => {
  function scoped(profile: string, slug = "demo") {
    return render(
      <TableProfileContext.Provider value={profile}>
        <FilterableTable
          tableKey="t"
          restaurantSlug={slug}
          label="Items"
          rows={rows}
          columns={columns}
          getRowId={(r) => r.id}
          timeZone="America/Chicago"
          emptyMessage="Empty"
        />
      </TableProfileContext.Provider>,
    );
  }
  it("persists visibility/order only for the same restaurant and profile", async () => {
    const user = userEvent.setup();
    let mounted = scoped("manager-a");
    await user.click(screen.getByRole("button", { name: "Columns" }));
    const chooser = screen.getByRole("dialog", { name: "Choose columns" });
    await user.click(within(chooser).getByRole("checkbox", { name: "Total" }));
    await user.click(
      within(chooser).getByRole("button", {
        name: "Move Vendor up",
      }),
    );
    mounted.unmount();
    mounted = scoped("manager-a");
    expect(screen.getAllByRole("columnheader")[0]).toHaveTextContent("Vendor");
    expect(
      screen.queryByRole("columnheader", { name: /Total/ }),
    ).not.toBeInTheDocument();
    mounted.unmount();
    mounted = scoped("manager-b");
    expect(screen.getAllByRole("columnheader")[0]).toHaveTextContent("Name");
    expect(
      screen.getByRole("columnheader", { name: /Total/ }),
    ).toBeInTheDocument();
    mounted.unmount();
    scoped("manager-a", "other-restaurant");
    expect(screen.getAllByRole("columnheader")[0]).toHaveTextContent("Name");
  });
  const defaultView = {
    id: "v",
    profileId: "manager-a",
    name: "My default",
    isDefault: true,
    version: 1,
    payload: {
      version: 1,
      owns: ["search", "hidden", "order"],
      state: {
        search: "Modelo",
        filters: {},
        sort: [],
        hidden: ["total"],
        order: ["vendor", "name", "total"],
        showArchived: false,
      },
    },
  };
  function saved() {
    return render(
      <FilterableTable
        tableKey="inv"
        restaurantSlug="demo"
        label="Items"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        timeZone="America/Chicago"
        emptyMessage="Empty"
        savedViews={{
          views: [defaultView],
          run: async () => ({ ok: false, error: "unused" }),
          showArchived: false,
          setShowArchived: () => {},
        }}
      />,
    );
  }
  it("initializes a server default without a local cache", () => {
    saved();
    expect(screen.getByRole("searchbox")).toHaveValue("Modelo");
    expect(screen.getAllByRole("columnheader")[0]).toHaveTextContent("Vendor");
    expect(
      screen.queryByRole("columnheader", { name: /Total/ }),
    ).not.toBeInTheDocument();
  });
  it("explicit dashboard URL state wins over a saved default", () => {
    writeTableState("inv", "demo", { search: "Tito", filters: {}, sort: [] });
    saved();
    expect(screen.getByRole("searchbox")).toHaveValue("Tito");
  });
});

function renderTable(slug = "demo") {
  return render(
    <FilterableTable<Row>
      tableKey="t"
      restaurantSlug={slug}
      label="Items"
      rows={rows}
      columns={columns}
      getRowId={(r) => r.id}
      timeZone="America/New_York"
      emptyMessage="Nothing here."
    />,
  );
}

const bodyNames = () =>
  within(screen.getByRole("table", { name: "Items" }))
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.querySelectorAll("td")[0]?.textContent);

beforeEach(() => window.history.replaceState(null, "", "/"));
afterEach(cleanup);

describe("FilterableTable", () => {
  it("filters by a column popover, shows a chip, removes it, and clears all", async () => {
    const user = userEvent.setup();
    renderTable();
    expect(bodyNames()).toEqual(["Tito's", "Casamigos", "Modelo"]);

    await user.click(screen.getByRole("button", { name: "Filter Vendor" }));
    const panel = screen.getByRole("dialog", { name: "Vendor filter" });
    await user.click(within(panel).getByRole("checkbox", { name: /Del Papa/ }));
    await user.click(within(panel).getByRole("button", { name: "Done" }));
    expect(bodyNames()).toEqual(["Modelo"]);
    expect(screen.getByText("1 of 3 rows match")).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: /Remove filter Vendor: Del Papa/ }),
    );
    expect(bodyNames()).toHaveLength(3);

    await user.type(
      screen.getByRole("searchbox", { name: "Search Items" }),
      "casa",
    );
    expect(bodyNames()).toEqual(["Casamigos"]);
    await user.click(screen.getByRole("button", { name: /^Clear all/ }));
    expect(bodyNames()).toHaveLength(3);
  });

  it("keeps the header and its filters when nothing matches", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.type(
      screen.getByRole("searchbox", { name: "Search Items" }),
      "zzz",
    );
    expect(screen.getByText("No items match these filters.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filter Total" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Clear all filters" }));
    expect(bodyNames()).toHaveLength(3);
  });

  it("sorts by header (asc, desc, off) and reports aria-sort", async () => {
    const user = userEvent.setup();
    renderTable();
    const header = screen.getByRole("columnheader", { name: /Total/ });
    const button = within(header).getByRole("button", { name: /^Total/ });
    await user.click(button);
    expect(header.getAttribute("aria-sort")).toBe("ascending");
    await user.click(button);
    expect(header.getAttribute("aria-sort")).toBe("descending");
    expect(bodyNames()[0]).toBe("Casamigos");
    await user.click(button);
    expect(header.getAttribute("aria-sort")).toBe("none");
  });

  it("writes the state to the URL under the table key, scoped to the organization", async () => {
    const user = userEvent.setup();
    renderTable("demo");
    await user.type(
      screen.getByRole("searchbox", { name: "Search Items" }),
      "tito",
    );
    const params = new URLSearchParams(window.location.search);
    expect(params.get("t.q")).toBe("tito");
    expect(params.get("bi.org")).toBe("demo");
  });

  it("restores the state from the URL on mount", () => {
    window.history.replaceState(
      null,
      "",
      "/?bi.org=demo&t.f.name=t%3Acontains%3Amodelo",
    );
    renderTable("demo");
    expect(bodyNames()).toEqual(["Modelo"]);
  });

  it("ignores table state written for another organization", () => {
    window.history.replaceState(
      null,
      "",
      "/?bi.org=other&t.f.name=t%3Acontains%3Amodelo&keep=1",
    );
    dropForeignTableState("demo");
    renderTable("demo");
    expect(bodyNames()).toHaveLength(3);
    const params = new URLSearchParams(window.location.search);
    expect(params.get("keep")).toBe("1");
    expect(params.get("t.f.name")).toBeNull();
  });
});
