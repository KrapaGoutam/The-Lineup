"use client";
import { Select } from "@/components/ui/select";
import type { TableState } from "../domain/table-filters";
const EXPIRATION = [
  "Any",
  "Expired",
  "Expires today",
  "Within 7 days",
  "Within 15 days",
  "Within 30 days",
  "No expiration entered",
];
export function DateFilters({
  state,
  onChange,
}: {
  state: TableState;
  onChange: (state: TableState) => void;
}) {
  const exp = state.filters.expirationDays;
  const freshness = state.filters.freshness;
  const value =
    exp?.type === "number"
      ? exp.op === "lt" && exp.value === 0
        ? "Expired"
        : exp.op === "eq" && exp.value === 0
          ? "Expires today"
          : exp.op === "between" && exp.value === 0
            ? `Within ${exp.to} days`
            : "Any"
      : state.filters.expiration?.type === "select" &&
          state.filters.expiration.values.includes("__none__")
        ? "No expiration entered"
        : "Any";
  return (
    <>
      <Select
        aria-label="Expiration filter"
        className="w-auto max-w-full"
        value={value}
        onChange={(e) => {
          const filters = { ...state.filters };
          delete filters.expirationDays;
          delete filters.expiration;
          const v = e.target.value;
          if (v === "Expired")
            filters.expirationDays = { type: "number", op: "lt", value: 0 };
          else if (v === "Expires today")
            filters.expirationDays = { type: "number", op: "eq", value: 0 };
          else if (v.startsWith("Within"))
            filters.expirationDays = {
              type: "number",
              op: "between",
              value: 0,
              to: Number(v.split(" ")[1]),
            };
          else if (v === "No expiration entered")
            filters.expiration = { type: "select", values: ["__none__"] };
          onChange({ ...state, filters });
        }}
      >
        {EXPIRATION.map((v) => (
          <option key={v} value={v}>
            {v === "Any" ? "Expiration: Any" : v}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Manufacture freshness filter"
        className="w-auto max-w-full"
        value={
          freshness?.type === "select" && freshness.values.length === 1
            ? freshness.values[0]
            : "Any"
        }
        onChange={(e) => {
          const filters = { ...state.filters };
          if (e.target.value === "Any") delete filters.freshness;
          else filters.freshness = { type: "select", values: [e.target.value] };
          onChange({ ...state, filters });
        }}
      >
        {[
          "Any",
          "Fresh",
          "Aging Soon",
          "Freshness Limit",
          "No Rule",
          "No Manufacture Date",
        ].map((v) => (
          <option key={v} value={v}>
            {v === "Any" ? "Freshness: Any" : v}
          </option>
        ))}
      </Select>
    </>
  );
}
