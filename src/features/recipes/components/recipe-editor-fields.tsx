"use client";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { moveRow, type Variant } from "../domain/recipe-editor-state";
export const suggestions = {
  base_spirit: ["Vodka", "Gin", "Rum", "Tequila", "Whiskey", "Brandy"],
  method: ["Shake", "Stir", "Build", "Blend", "Muddle"],
  rim_type: ["Salt", "Sugar", "Tajín", "None"],
  glass: ["Martini", "Coupe", "Rocks", "Highball", "Margarita", "Shot"],
  unit: ["oz", "ml", "dash", "tsp", "tbsp", "drop"],
};
export function EditorField({
  id,
  label,
  value,
  onChange,
  error,
  maxLength,
  options,
  multiline,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  maxLength?: number;
  options?: readonly string[];
  multiline?: boolean;
  type?: string;
}) {
  const listId = useId();
  const props = {
    id,
    value,
    maxLength,
    "aria-invalid": !!error,
    "aria-describedby": error ? `${id}-error` : undefined,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => onChange(event.target.value),
  };
  return (
    <div className="flex min-w-0 flex-col gap-2" data-invalid={!!error}>
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <textarea
          {...props}
          rows={3}
          className="border-input bg-background min-h-24 w-full rounded-md border px-3 py-2 text-base focus-visible:outline-2"
        />
      ) : (
        <Input
          {...props}
          type={type}
          list={options ? listId : undefined}
          min={type === "number" ? 1 : undefined}
          max={type === "number" ? 9999 : undefined}
          step={type === "number" ? 1 : undefined}
        />
      )}
      {options ? (
        <datalist id={listId}>
          {options.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
type RowField<T> = {
  name: Exclude<Extract<keyof T, string>, "key">;
  label: string;
  limit: number;
  multiline?: boolean;
  options?: readonly string[];
};
function RowList<T extends { key: string }>({
  title,
  singular,
  rows,
  fields,
  prefix,
  errors,
  cap,
  blank,
  onChange,
}: {
  title: string;
  singular: string;
  rows: T[];
  fields: RowField<T>[];
  prefix: string;
  errors: Record<string, string>;
  cap: number;
  blank: () => T;
  onChange: (rows: T[]) => void;
}) {
  return (
    <section className="flex flex-col gap-4" aria-label={title}>
      <h3 className="font-semibold">{title}</h3>
      {rows.map((row, index) => (
        <fieldset
          key={row.key}
          className="border-border flex min-w-0 flex-col gap-3 rounded-lg border p-3"
        >
          <legend className="px-1 text-sm">
            {singular} {index + 1}
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => (
              <EditorField
                key={field.name}
                id={`${prefix}.${index}.${field.name}`}
                label={field.label}
                value={String(row[field.name])}
                maxLength={field.limit}
                multiline={field.multiline}
                options={field.options}
                error={errors[`${prefix}.${index}.${field.name}`]}
                onChange={(value) =>
                  onChange(
                    rows.map((r, i) =>
                      i === index ? { ...r, [field.name]: value } : r,
                    ),
                  )
                }
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={index === 0}
              aria-label={`Move ${singular.toLowerCase()} ${index + 1} up`}
              onClick={() => onChange(moveRow(rows, index, -1))}
            >
              Move up
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={index === rows.length - 1}
              aria-label={`Move ${singular.toLowerCase()} ${index + 1} down`}
              onClick={() => onChange(moveRow(rows, index, 1))}
            >
              Move down
            </Button>
            <Button
              type="button"
              variant="outline"
              aria-label={`Remove ${singular.toLowerCase()} ${index + 1}`}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          </div>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={rows.length >= cap}
        onClick={() => onChange([...rows, blank()])}
      >
        Add {singular.toLowerCase()}
      </Button>
      {rows.length >= cap ? (
        <p className="text-muted-foreground text-sm">
          Maximum {cap} {title.toLowerCase()}.
        </p>
      ) : null}
    </section>
  );
}
const variantFields = [
  ["method", "Method", 60],
  ["rim_type", "Rim", 40],
  ["rim_notes", "Rim notes", 200],
  ["glass", "Glass", 40],
  ["glass_notes", "Glass notes", 200],
  ["presentation_notes", "Presentation notes", 500],
  ["tips", "Tips", 1000],
  ["batch_notes", "Batch notes", 1000],
] as const;
export function RecipeVariantEditor({
  kind,
  value,
  errors,
  onChange,
}: {
  kind: "perfect" | "house";
  value: Variant;
  errors: Record<string, string>;
  onChange: (value: Variant) => void;
}) {
  const prefix = `variants.${kind}`;
  return (
    <details open className="border-border rounded-xl border p-4">
      <summary className="min-h-11 cursor-pointer text-lg font-semibold">
        {kind === "perfect" ? "Perfect Bartending Recipe" : "House Recipe"}
      </summary>
      <div className="flex flex-col gap-6 pt-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {variantFields.map(([name, label, limit]) => (
            <EditorField
              key={name}
              id={`${prefix}.${name}`}
              label={label}
              value={value[name]}
              maxLength={limit}
              multiline={name === "tips" || name === "batch_notes"}
              error={errors[`${prefix}.${name}`]}
              options={
                name === "method" || name === "rim_type" || name === "glass"
                  ? suggestions[name]
                  : undefined
              }
              onChange={(text) => onChange({ ...value, [name]: text })}
            />
          ))}
        </div>
        <RowList
          title="Ingredients"
          singular="Ingredient"
          rows={value.ingredients}
          prefix={`${prefix}.ingredients`}
          errors={errors}
          cap={30}
          fields={[
            { name: "ingredient_name", label: "Ingredient name", limit: 120 },
            { name: "amount", label: "Amount", limit: 40 },
            {
              name: "unit",
              label: "Unit",
              limit: 30,
              options: suggestions.unit,
            },
            { name: "preparation", label: "Preparation", limit: 120 },
          ]}
          blank={() => ({
            key: crypto.randomUUID(),
            ingredient_name: "",
            amount: "",
            unit: "",
            preparation: "",
          })}
          onChange={(ingredients) => onChange({ ...value, ingredients })}
        />
        <RowList
          title="Steps"
          singular="Step"
          rows={value.steps}
          prefix={`${prefix}.steps`}
          errors={errors}
          cap={20}
          fields={[
            {
              name: "instruction",
              label: "Instruction",
              limit: 500,
              multiline: true,
            },
          ]}
          blank={() => ({ key: crypto.randomUUID(), instruction: "" })}
          onChange={(steps) => onChange({ ...value, steps })}
        />
        <RowList
          title="Garnishes"
          singular="Garnish"
          rows={value.garnishes}
          prefix={`${prefix}.garnishes`}
          errors={errors}
          cap={10}
          fields={[
            { name: "name", label: "Garnish name", limit: 120 },
            { name: "notes", label: "Garnish notes", limit: 200 },
          ]}
          blank={() => ({ key: crypto.randomUUID(), name: "", notes: "" })}
          onChange={(garnishes) => onChange({ ...value, garnishes })}
        />
      </div>
    </details>
  );
}
