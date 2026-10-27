"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

import type { CatalogCommand } from "../domain/catalog-commands";
import {
  UNIT_LABEL_MAX,
  UNIT_TYPES,
  UNIT_TYPE_LABELS,
  type CatalogConflict,
  type CatalogSnapshot,
  type CategoryView,
  type ProductView,
  type SubcategoryView,
  type UnitType,
  type VendorView,
} from "../domain/inventory-types";
import { nameKey } from "../domain/keys";
import type { CatalogRunResult } from "../hooks/use-catalog-controller";

export type RunCatalogCommand = (
  command: CatalogCommand,
) => Promise<CatalogRunResult>;

const NEW_VENDOR = "__new_vendor__";

/**
 * Shared submit behaviour: busy state, the server's plain-language error and
 * the optimistic-concurrency recovery (OWN-3: never a silent overwrite). When
 * the row changed underneath the form, the dialog says who changed it, keeps
 * what the person typed and offers an explicit "save over their change".
 */
function useCatalogSubmit(
  run: RunCatalogCommand,
  openedVersion: number | null,
  onDone: () => void,
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState<Extract<
    CatalogConflict,
    { kind: "stale" }
  > | null>(null);

  async function submit(build: (expectedVersion: number) => CatalogCommand) {
    setBusy(true);
    setError(null);
    try {
      const expected = stale?.currentVersion ?? openedVersion ?? 1;
      const result = await run(build(expected));
      if (result.ok) {
        onDone();
        return;
      }
      if (result.conflict?.kind === "stale") {
        setStale(result.conflict);
        setError(null);
      } else {
        setError(result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, stale, submit };
}

function FormMessages({
  error,
  stale,
}: {
  error: string | null;
  stale: Extract<CatalogConflict, { kind: "stale" }> | null;
}) {
  return (
    <>
      {stale ? (
        <p
          role="alert"
          className="border-warn/30 bg-warn/15 text-warn rounded-lg border px-3 py-2 text-sm"
        >
          {stale.updatedBy ?? "Someone"} changed this {stale.entity}
          {stale.updatedAt
            ? ` at ${new Date(stale.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
            : ""}
          . The list behind this window now shows the latest. Review it, then
          save again to replace their change.
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/15 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {error}
        </p>
      ) : null}
    </>
  );
}

function Footer({
  busy,
  stale,
  submitLabel,
  onCancel,
}: {
  busy: boolean;
  stale: boolean;
  submitLabel: string;
  onCancel: () => void;
}) {
  return (
    // Sticky so the action stays in view when a long form scrolls (phones).
    <div className="border-border bg-card sticky bottom-0 -mx-5 -mb-5 flex flex-wrap justify-end gap-2 border-t px-5 py-3">
      <Button variant="ghost" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : stale ? "Save over their change" : submitLabel}
      </Button>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------
// Vendor
// ---------------------------------------------------------------------
export function VendorDialog({
  open,
  vendor,
  run,
  onClose,
}: {
  open: boolean;
  /** null = create. */
  vendor: VendorView | null;
  run: RunCatalogCommand;
  onClose: () => void;
}) {
  // Keyed by the caller so each open starts from a fresh form.
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={vendor ? "Edit vendor" : "Add vendor"}
      description="Vendors are shared by every product. Spelling variants of the same name are matched, not duplicated."
    >
      {open ? <VendorForm vendor={vendor} run={run} onClose={onClose} /> : null}
    </Dialog>
  );
}

function VendorForm({
  vendor,
  run,
  onClose,
}: {
  vendor: VendorView | null;
  run: RunCatalogCommand;
  onClose: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(vendor?.name ?? "");
  const [notes, setNotes] = useState(vendor?.notes ?? "");
  const { busy, error, stale, submit } = useCatalogSubmit(
    run,
    vendor?.version ?? null,
    onClose,
  );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit((expectedVersion) =>
          vendor
            ? {
                type: "vendorUpdate",
                id: vendor.id,
                name,
                notes: notes.trim() === "" ? null : notes,
                expectedVersion,
              }
            : {
                type: "vendorCreate",
                name,
                notes: notes.trim() === "" ? null : notes,
              },
        );
      }}
    >
      <Field label="Vendor name" htmlFor={`${id}-name`}>
        <Input
          id={`${id}-name`}
          value={name}
          maxLength={120}
          autoFocus
          required
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field label="Notes (optional)" htmlFor={`${id}-notes`}>
        <Input
          id={`${id}-notes`}
          value={notes}
          maxLength={500}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>
      <FormMessages error={error} stale={stale} />
      <Footer
        busy={busy}
        stale={stale !== null}
        submitLabel={vendor ? "Save vendor" : "Add vendor"}
        onCancel={onClose}
      />
    </form>
  );
}

// ---------------------------------------------------------------------
// Category / subcategory
// ---------------------------------------------------------------------
export function CategoryDialog({
  open,
  category,
  run,
  onClose,
}: {
  open: boolean;
  category: CategoryView | null;
  run: RunCatalogCommand;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={category ? "Rename category" : "Add category"}
    >
      {open ? (
        <CategoryForm category={category} run={run} onClose={onClose} />
      ) : null}
    </Dialog>
  );
}

function CategoryForm({
  category,
  run,
  onClose,
}: {
  category: CategoryView | null;
  run: RunCatalogCommand;
  onClose: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(category?.name ?? "");
  const { busy, error, stale, submit } = useCatalogSubmit(
    run,
    category?.version ?? null,
    onClose,
  );
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit((expectedVersion) =>
          category
            ? { type: "categoryUpdate", id: category.id, name, expectedVersion }
            : { type: "categoryCreate", name },
        );
      }}
    >
      <Field label="Category name" htmlFor={`${id}-name`}>
        <Input
          id={`${id}-name`}
          value={name}
          maxLength={80}
          autoFocus
          required
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <FormMessages error={error} stale={stale} />
      <Footer
        busy={busy}
        stale={stale !== null}
        submitLabel={category ? "Save category" : "Add category"}
        onCancel={onClose}
      />
    </form>
  );
}

export function SubcategoryDialog({
  open,
  subcategory,
  defaultCategoryId,
  categories,
  run,
  onClose,
}: {
  open: boolean;
  subcategory: SubcategoryView | null;
  defaultCategoryId: string | null;
  categories: CategoryView[];
  run: RunCatalogCommand;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={subcategory ? "Edit subcategory" : "Add subcategory"}
      description="A subcategory always belongs to one category."
    >
      {open ? (
        <SubcategoryForm
          subcategory={subcategory}
          defaultCategoryId={defaultCategoryId}
          categories={categories}
          run={run}
          onClose={onClose}
        />
      ) : null}
    </Dialog>
  );
}

function SubcategoryForm({
  subcategory,
  defaultCategoryId,
  categories,
  run,
  onClose,
}: {
  subcategory: SubcategoryView | null;
  defaultCategoryId: string | null;
  categories: CategoryView[];
  run: RunCatalogCommand;
  onClose: () => void;
}) {
  const id = useId();
  const choices = categories.filter(
    (category) => category.active || category.id === subcategory?.categoryId,
  );
  const [name, setName] = useState(subcategory?.name ?? "");
  const [categoryId, setCategoryId] = useState(
    subcategory?.categoryId ?? defaultCategoryId ?? choices[0]?.id ?? "",
  );
  const { busy, error, stale, submit } = useCatalogSubmit(
    run,
    subcategory?.version ?? null,
    onClose,
  );
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit((expectedVersion) =>
          subcategory
            ? {
                type: "subcategoryUpdate",
                id: subcategory.id,
                categoryId,
                name,
                expectedVersion,
              }
            : { type: "subcategoryCreate", categoryId, name },
        );
      }}
    >
      <Field label="Category" htmlFor={`${id}-category`}>
        <Select
          id={`${id}-category`}
          value={categoryId}
          required
          onChange={(event) => setCategoryId(event.target.value)}
        >
          {choices.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Subcategory name" htmlFor={`${id}-name`}>
        <Input
          id={`${id}-name`}
          value={name}
          maxLength={80}
          autoFocus
          required
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <FormMessages error={error} stale={stale} />
      <Footer
        busy={busy}
        stale={stale !== null}
        submitLabel={subcategory ? "Save subcategory" : "Add subcategory"}
        onCancel={onClose}
      />
    </form>
  );
}

// ---------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------
export function ProductDialog({
  open,
  product,
  snapshot,
  run,
  onClose,
}: {
  open: boolean;
  product: ProductView | null;
  snapshot: CatalogSnapshot;
  run: RunCatalogCommand;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={product ? "Edit product" : "Add product"}
      description="Vendor, name, size and unit identify a product. Set counts and levels from Inventory after adding it."
      className="max-w-[min(94vw,40rem)] sm:w-[min(94vw,40rem)]"
    >
      {open ? (
        <ProductForm
          product={product}
          snapshot={snapshot}
          run={run}
          onClose={onClose}
        />
      ) : null}
    </Dialog>
  );
}

function ProductForm({
  product,
  snapshot,
  run,
  onClose,
}: {
  product: ProductView | null;
  snapshot: CatalogSnapshot;
  run: RunCatalogCommand;
  onClose: () => void;
}) {
  const id = useId();
  const unassigned = snapshot.vendors.find((vendor) => vendor.isSystem);
  const [vendorId, setVendorId] = useState(
    product?.vendorId ?? unassigned?.id ?? "",
  );
  const [name, setName] = useState(product?.name ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [subcategoryId, setSubcategoryId] = useState(
    product?.subcategoryId ?? "",
  );
  const [size, setSize] = useState(product?.size ?? "");
  const [unitType, setUnitType] = useState<UnitType>(
    product?.unitType ?? "bottle",
  );
  const [unitLabel, setUnitLabel] = useState(product?.unitLabel ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [notes, setNotes] = useState(product?.notes ?? "");
  const [newVendorName, setNewVendorName] = useState("");
  const [vendorBusy, setVendorBusy] = useState(false);
  const [vendorError, setVendorError] = useState<string | null>(null);
  const { busy, error, stale, submit } = useCatalogSubmit(
    run,
    product?.version ?? null,
    onClose,
  );

  const vendorChoices = snapshot.vendors.filter(
    (vendor) => vendor.active || vendor.id === product?.vendorId,
  );
  const categoryChoices = snapshot.categories.filter(
    (category) => category.active || category.id === product?.categoryId,
  );
  const subcategoryChoices = snapshot.subcategories.filter(
    (sub) =>
      sub.categoryId === categoryId &&
      (sub.active || sub.id === product?.subcategoryId),
  );

  async function addVendorInline() {
    setVendorBusy(true);
    setVendorError(null);
    try {
      const result = await run({
        type: "vendorCreate",
        name: newVendorName,
        notes: null,
      });
      if (!result.ok) {
        setVendorError(result.error);
        return;
      }
      const key = nameKey(newVendorName);
      const created = result.snapshot.vendors.find(
        (vendor) => nameKey(vendor.name) === key,
      );
      if (created) setVendorId(created.id);
      setNewVendorName("");
    } finally {
      setVendorBusy(false);
    }
  }

  const choosingNewVendor = vendorId === NEW_VENDOR;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (choosingNewVendor) {
          setVendorError(
            "Add the new vendor first, or choose an existing one.",
          );
          return;
        }
        const input = {
          vendorId,
          name,
          categoryId: categoryId || null,
          subcategoryId: categoryId && subcategoryId ? subcategoryId : null,
          size: size.trim() === "" ? null : size,
          unitType,
          unitLabel:
            unitType === "other" && unitLabel.trim() !== "" ? unitLabel : null,
          sku: sku.trim() === "" ? null : sku,
          notes: notes.trim() === "" ? null : notes,
        };
        void submit((expectedVersion) =>
          product
            ? { type: "productUpdate", id: product.id, input, expectedVersion }
            : { type: "productCreate", input },
        );
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vendor" htmlFor={`${id}-vendor`}>
          <Select
            id={`${id}-vendor`}
            value={vendorId}
            required
            onChange={(event) => setVendorId(event.target.value)}
          >
            {vendorChoices.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
                {vendor.active ? "" : " (inactive)"}
              </option>
            ))}
            <option value={NEW_VENDOR}>＋ New vendor…</option>
          </Select>
        </Field>
        <Field label="Product name" htmlFor={`${id}-name`}>
          <Input
            id={`${id}-name`}
            value={name}
            maxLength={160}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
      </div>

      {choosingNewVendor ? (
        <div className="border-border bg-muted/30 flex flex-col gap-2 rounded-xl border p-3">
          <Label htmlFor={`${id}-newvendor`}>New vendor name</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id={`${id}-newvendor`}
              className="min-w-0 flex-1"
              value={newVendorName}
              maxLength={120}
              onChange={(event) => setNewVendorName(event.target.value)}
            />
            <Button
              variant="secondary"
              disabled={vendorBusy || newVendorName.trim() === ""}
              onClick={() => void addVendorInline()}
            >
              {vendorBusy ? "Adding…" : "Add vendor"}
            </Button>
          </div>
          {vendorError ? (
            <p role="alert" className="text-destructive text-sm">
              {vendorError}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category (optional)" htmlFor={`${id}-category`}>
          <Select
            id={`${id}-category`}
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              setSubcategoryId("");
            }}
          >
            <option value="">None</option>
            {categoryChoices.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Subcategory (optional)" htmlFor={`${id}-subcategory`}>
          <Select
            id={`${id}-subcategory`}
            value={subcategoryId}
            disabled={!categoryId}
            onChange={(event) => setSubcategoryId(event.target.value)}
          >
            <option value="">None</option>
            {subcategoryChoices.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Size" htmlFor={`${id}-size`} hint="e.g. 750 mL, 1.75 L">
          <Input
            id={`${id}-size`}
            value={size}
            maxLength={40}
            onChange={(event) => setSize(event.target.value)}
          />
        </Field>
        <Field label="Unit" htmlFor={`${id}-unit`}>
          <Select
            id={`${id}-unit`}
            value={unitType}
            onChange={(event) => setUnitType(event.target.value as UnitType)}
          >
            {UNIT_TYPES.map((type) => (
              <option key={type} value={type}>
                {UNIT_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="SKU / item code" htmlFor={`${id}-sku`}>
          <Input
            id={`${id}-sku`}
            value={sku}
            maxLength={60}
            onChange={(event) => setSku(event.target.value)}
          />
        </Field>
      </div>

      {unitType === "other" ? (
        <Field
          label="Unit name"
          htmlFor={`${id}-unitlabel`}
          hint="What do you count this in?"
        >
          <Input
            id={`${id}-unitlabel`}
            value={unitLabel}
            maxLength={UNIT_LABEL_MAX}
            required
            onChange={(event) => setUnitLabel(event.target.value)}
          />
        </Field>
      ) : null}

      <Field label="Notes (optional)" htmlFor={`${id}-notes`}>
        <Input
          id={`${id}-notes`}
          value={notes}
          maxLength={500}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>

      <FormMessages error={error} stale={stale} />
      <Footer
        busy={busy}
        stale={stale !== null}
        submitLabel={product ? "Save product" : "Add product"}
        onCancel={onClose}
      />
    </form>
  );
}
