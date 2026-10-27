"use client";

import { useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import {
  DATE_PRESET_LABEL,
  DATE_PRESETS,
  NUMBER_OPS,
  TEXT_OPS,
  type ColumnSpec,
  type DatePreset,
  type FilterValue,
  type NumberOp,
  type SelectOption,
  type TextOp,
} from "../../domain/table-filters";

const TEXT_OP_LABEL: Record<TextOp, string> = {
  contains: "Contains",
  startsWith: "Starts with",
  equals: "Is exactly",
};
const NUMBER_OP_LABEL: Record<NumberOp, string> = {
  eq: "Equals (=)",
  lt: "Less than (<)",
  lte: "At most (≤)",
  gt: "More than (>)",
  gte: "At least (≥)",
  between: "Between",
};

type ControlProps<T extends FilterValue["type"]> = {
  label: string;
  value: Extract<FilterValue, { type: T }> | undefined;
  onChange: (next: FilterValue | undefined) => void;
};

function TextControl({ label, value, onChange }: ControlProps<"text">) {
  const id = useId();
  const op = value?.op ?? "contains";
  return (
    <div className="flex flex-col gap-2">
      <Select
        aria-label={`${label} match`}
        value={op}
        onChange={(event) =>
          onChange({
            type: "text",
            op: event.target.value as TextOp,
            value: value?.value ?? "",
          })
        }
      >
        {TEXT_OPS.map((o) => (
          <option key={o} value={o}>
            {TEXT_OP_LABEL[o]}
          </option>
        ))}
      </Select>
      <Input
        id={id}
        aria-label={`${label} text`}
        value={value?.value ?? ""}
        placeholder={`Filter ${label.toLowerCase()}`}
        onChange={(event) =>
          onChange({ type: "text", op, value: event.target.value })
        }
      />
    </div>
  );
}

function SelectControl({
  label,
  value,
  options,
  onChange,
}: ControlProps<"select"> & { options: SelectOption[] }) {
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(value?.values ?? []), [value]);
  const shown = options.filter((option) =>
    option.label.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const set = (values: string[]) => onChange({ type: "select", values });
  return (
    <div className="flex flex-col gap-2">
      {options.length > 8 ? (
        <Input
          aria-label={`Search ${label.toLowerCase()} options`}
          value={query}
          placeholder="Search…"
          onChange={(event) => setQuery(event.target.value)}
        />
      ) : null}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            set([...new Set([...selected, ...shown.map((o) => o.value)])])
          }
        >
          Select all
        </Button>
        <Button size="sm" variant="ghost" onClick={() => set([])}>
          None
        </Button>
      </div>
      <ul
        className="flex max-h-56 flex-col overflow-y-auto"
        role="group"
        aria-label={`${label} options`}
      >
        {shown.map((option) => (
          <li key={option.value}>
            <label className="hover:bg-muted flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={selected.has(option.value)}
                onChange={(event) =>
                  set(
                    event.target.checked
                      ? [...selected, option.value]
                      : [...selected].filter((v) => v !== option.value),
                  )
                }
              />
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              <span className="text-muted-foreground text-xs">
                {option.count}
              </span>
            </label>
          </li>
        ))}
        {shown.length === 0 ? (
          <li className="text-muted-foreground px-2 py-2 text-sm">
            No options
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function NumberControl({ label, value, onChange }: ControlProps<"number">) {
  const op = value?.op ?? "eq";
  // Raw text so partial input ("-", "1.") is never clobbered while typing.
  const [raw, setRaw] = useState(value ? String(value.value) : "");
  const [rawTo, setRawTo] = useState(
    value?.to !== undefined ? String(value.to) : "",
  );
  const emit = (nextOp: NumberOp, a: string, b: string) => {
    const first = a.trim() === "" ? Number.NaN : Number(a);
    const second = b.trim() === "" ? Number.NaN : Number(b);
    onChange({
      type: "number",
      op: nextOp,
      value: first,
      ...(nextOp === "between" ? { to: second } : {}),
    });
  };
  return (
    <div className="flex flex-col gap-2">
      <Select
        aria-label={`${label} comparison`}
        value={op}
        onChange={(event) => emit(event.target.value as NumberOp, raw, rawTo)}
      >
        {NUMBER_OPS.map((o) => (
          <option key={o} value={o}>
            {NUMBER_OP_LABEL[o]}
          </option>
        ))}
      </Select>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          step="any"
          aria-label={op === "between" ? `${label} from` : `${label} value`}
          value={raw}
          onChange={(event) => {
            setRaw(event.target.value);
            emit(op, event.target.value, rawTo);
          }}
        />
        {op === "between" ? (
          <>
            <span className="text-muted-foreground text-sm">to</span>
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              aria-label={`${label} to`}
              value={rawTo}
              onChange={(event) => {
                setRawTo(event.target.value);
                emit(op, raw, event.target.value);
              }}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

function DateControl({ label, value, onChange }: ControlProps<"date">) {
  const preset = value?.preset;
  const set = (next: DatePreset, from?: string, to?: string) =>
    onChange({ type: "date", preset: next, from, to });
  return (
    <div
      className="flex flex-col gap-1"
      role="radiogroup"
      aria-label={`${label} range`}
    >
      {DATE_PRESETS.map((p) => (
        <label
          key={p}
          className="hover:bg-muted flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm"
        >
          <input
            type="radio"
            className="size-4"
            name={`${label}-preset`}
            checked={preset === p}
            onChange={() => set(p, value?.from, value?.to)}
          />
          {DATE_PRESET_LABEL[p]}
        </label>
      ))}
      {preset === "custom" ? (
        <div className="flex flex-wrap items-center gap-2 px-2 pb-1">
          <Input
            type="date"
            aria-label={`${label} from`}
            value={value?.from ?? ""}
            onChange={(event) =>
              set("custom", event.target.value || undefined, value?.to)
            }
          />
          <span className="text-muted-foreground text-sm">to</span>
          <Input
            type="date"
            aria-label={`${label} to`}
            value={value?.to ?? ""}
            onChange={(event) =>
              set("custom", value?.from, event.target.value || undefined)
            }
          />
        </div>
      ) : null}
    </div>
  );
}

/** The type-appropriate filter control for one column. */
export function ColumnFilterControl<Row>({
  column,
  value,
  options,
  onChange,
}: {
  column: ColumnSpec<Row>;
  value: FilterValue | undefined;
  options: SelectOption[];
  onChange: (next: FilterValue | undefined) => void;
}) {
  const label = column.label;
  switch (column.type) {
    case "text":
      return (
        <TextControl
          label={label}
          value={value?.type === "text" ? value : undefined}
          onChange={onChange}
        />
      );
    case "select":
      return (
        <SelectControl
          label={label}
          options={options}
          value={value?.type === "select" ? value : undefined}
          onChange={onChange}
        />
      );
    case "number":
      return (
        <NumberControl
          label={label}
          value={value?.type === "number" ? value : undefined}
          onChange={onChange}
        />
      );
    case "date":
      return (
        <DateControl
          label={label}
          value={value?.type === "date" ? value : undefined}
          onChange={onChange}
        />
      );
  }
}
