"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

import { sortByOrder } from "../domain/chore-rules";
import type { TaskTeamMember } from "../domain/task-types";
import type { ChoreController } from "../hooks/use-chore-controller";
import { ChoreBoardsSection } from "./chore-boards-section";
import { ChorePeopleSection } from "./chore-people-section";
import { ChoreAccessSection, ChoreRulesSection } from "./chore-rules-section";
import { ChoreRowsSection } from "./chore-rows-section";

export type ChoreSettingsSection =
  | "boards"
  | "people"
  | "chores"
  | "rules"
  | "access";

export const CHORE_SETTINGS_LABELS: Record<ChoreSettingsSection, string> = {
  boards: "Boards",
  people: "People / Columns",
  chores: "Chores / Rows",
  rules: "Completion Rules",
  access: "Access / Permissions",
};

type Props = {
  controller: ChoreController;
  /** The location's eligible people for column assignment. */
  team: readonly TaskTeamMember[];
  section: ChoreSettingsSection;
  onSectionChange: (section: ChoreSettingsSection) => void;
  boardId: string | null;
  onBoardChange: (boardId: string | null) => void;
};

/**
 * Tasks → Manage → Chore boards. Everything a manager needs to set up and run a
 * board lives inside the Tasks module; nothing here leaves Tasks.
 */
export function ChoreSettings({
  controller,
  team,
  section,
  onSectionChange,
  boardId,
  onBoardChange,
}: Props) {
  const { snapshot, ensureLoaded } = controller;
  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);

  // A board that was just created/copied is selected by name once it arrives.
  const [pendingName, setPendingName] = useState<string | null>(null);
  const boards = snapshot?.boards ?? [];
  const live = sortByOrder(boards.filter((b) => !b.archived));
  const justCreated = pendingName
    ? live.find((b) => b.name === pendingName)
    : undefined;
  const board =
    justCreated ?? live.find((b) => b.id === boardId) ?? live[0] ?? null;
  const choose = (id: string | null) => {
    setPendingName(null);
    onBoardChange(id);
  };

  if (controller.loadError && !snapshot) {
    return (
      <div className="border-border rounded-2xl border p-6 text-center">
        <p className="text-sm">{controller.loadError}</p>
        <Button
          className="mt-3"
          variant="secondary"
          onClick={() => void controller.refresh()}
        >
          Try again
        </Button>
      </div>
    );
  }
  if (!snapshot) {
    return (
      <p
        role="status"
        className="text-muted-foreground p-6 text-center text-sm"
      >
        Loading chore boards…
      </p>
    );
  }

  return (
    <div className="space-y-4" data-testid="chore-settings">
      {section === "boards" ? (
        <ChoreBoardsSection
          controller={controller}
          boards={boards}
          selectedId={board?.id ?? null}
          onSelect={choose}
          onCreated={setPendingName}
        />
      ) : !board ? (
        <p
          role="status"
          className="border-border text-muted-foreground rounded-2xl border border-dashed p-6 text-center text-sm"
        >
          There is no board to set up yet.{" "}
          <button
            type="button"
            className="text-foreground underline"
            onClick={() => onSectionChange("boards")}
          >
            Create one in Boards
          </button>
          .
        </p>
      ) : (
        <>
          {live.length > 1 ? (
            <div className="max-w-sm space-y-1.5">
              <label
                htmlFor="chore-settings-board"
                className="text-sm font-medium"
              >
                Board
              </label>
              <Select
                id="chore-settings-board"
                value={board.id}
                onChange={(e) => choose(e.target.value)}
              >
                {live.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <p className="text-sm">
              Board: <strong>{board.name}</strong>
            </p>
          )}
          {section === "people" ? (
            <ChorePeopleSection
              key={board.id}
              controller={controller}
              board={board}
              team={team}
            />
          ) : null}
          {section === "chores" ? (
            <ChoreRowsSection
              key={board.id}
              controller={controller}
              board={board}
            />
          ) : null}
          {section === "rules" ? (
            <ChoreRulesSection
              key={board.id}
              controller={controller}
              board={board}
            />
          ) : null}
          {section === "access" ? (
            <ChoreAccessSection
              key={board.id}
              controller={controller}
              board={board}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
