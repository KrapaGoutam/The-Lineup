import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import {
  applyLocationAssignmentChanges,
  listActiveProfileLocationAssignments,
  listProfileLocationAssignments,
} from "./location-assignment";

const ORG_MONKS = "00000000-0000-0000-0000-0000000000a1";
const ORG_LIQUOR_TAP = "00000000-0000-0000-0000-0000000000a2";

const WEBSTER = "00000000-0000-0000-0000-000000000001";
const NASA = "00000000-0000-0000-0000-000000000002";
const LEAGUE_CITY = "00000000-0000-0000-0000-000000000003";

const USER_JOHN = "00000000-0000-0000-0000-000000000011";

type LocationMembershipDbRow = {
  id: number;
  location_id: string;
  profile_id: string;
  role: Database["public"]["Enums"]["location_role"];
  active: boolean;
  created_at: string;
  updated_at: string;
  locations?: {
    organization_id: string;
  };
};

function createMockSupabase(options: {
  selectRows?: LocationMembershipDbRow[];
  rpcData?: LocationMembershipDbRow[] | null;
  rpcError?: { message: string; code?: string } | null;
}) {
  const rpcMock = vi.fn().mockResolvedValue({
    data: options.rpcData ?? null,
    error: options.rpcError ?? null,
  });

  const selectRows = options.selectRows ?? [];

  function createOrderChain(rows: LocationMembershipDbRow[]) {
    const chain = {
      order: vi.fn().mockImplementation(() => chain),
      then: (
        resolve: (val: {
          data: LocationMembershipDbRow[];
          error: null;
        }) => void,
      ) => Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return chain;
  }

  const queryMock = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation((col: string, val: unknown) => {
      let filtered = selectRows;
      if (col === "profile_id") {
        filtered = filtered.filter((r) => r.profile_id === val);
      }
      if (col === "active") {
        filtered = filtered.filter((r) => r.active === val);
      }
      return {
        eq: vi.fn().mockImplementation((col2: string, val2: unknown) => {
          let innerFiltered = filtered;
          if (col2 === "active") {
            innerFiltered = innerFiltered.filter((r) => r.active === val2);
          }
          return {
            order: vi
              .fn()
              .mockImplementation(() => createOrderChain(innerFiltered)),
          };
        }),
        order: vi.fn().mockImplementation(() => createOrderChain(filtered)),
      };
    }),
    order: vi.fn().mockImplementation(() => createOrderChain(selectRows)),
  };

  const client = {
    from: vi.fn().mockReturnValue(queryMock),
    rpc: rpcMock,
  } as unknown as SupabaseClient<Database>;

  return { client, rpcMock };
}

describe("location-assignment data layer", () => {
  describe("readers", () => {
    it("DATA-001: listProfileLocationAssignments returns all assignments", async () => {
      const mockRows: LocationMembershipDbRow[] = [
        {
          id: 1,
          location_id: NASA,
          profile_id: USER_JOHN,
          role: "manager",
          active: true,
          created_at: "2026-11-03T00:00:00Z",
          updated_at: "2026-11-03T00:00:00Z",
          locations: { organization_id: ORG_LIQUOR_TAP },
        },
        {
          id: 2,
          location_id: WEBSTER,
          profile_id: USER_JOHN,
          role: "staff",
          active: false,
          created_at: "2026-11-03T00:00:00Z",
          updated_at: "2026-11-03T00:00:00Z",
          locations: { organization_id: ORG_MONKS },
        },
      ];

      const { client } = createMockSupabase({ selectRows: mockRows });
      const result = await listProfileLocationAssignments(USER_JOHN, client);

      expect(result).toHaveLength(2);
      expect(result[0].locationId).toBe(NASA);
      expect(result[1].locationId).toBe(WEBSTER);
    });

    it("DATA-002: listActiveProfileLocationAssignments filters active assignments", async () => {
      const mockRows: LocationMembershipDbRow[] = [
        {
          id: 1,
          location_id: NASA,
          profile_id: USER_JOHN,
          role: "manager",
          active: true,
          created_at: "2026-11-03T00:00:00Z",
          updated_at: "2026-11-03T00:00:00Z",
          locations: { organization_id: ORG_LIQUOR_TAP },
        },
      ];

      const { client } = createMockSupabase({ selectRows: mockRows });
      const result = await listActiveProfileLocationAssignments(
        USER_JOHN,
        client,
      );

      expect(result).toHaveLength(1);
      expect(result[0].active).toBe(true);
    });
  });

  describe("applyLocationAssignmentChanges", () => {
    it("fails early if targetProfileId is empty", async () => {
      const { client, rpcMock } = createMockSupabase({});
      const result = await applyLocationAssignmentChanges(
        "",
        [{ locationId: NASA, role: "manager" }],
        client,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("MISSING_TARGET_PROFILE");
      }
      expect(rpcMock).not.toHaveBeenCalled();
    });

    it("DATA-004: pre-validation rejects duplicate locations without RPC call", async () => {
      const { client, rpcMock } = createMockSupabase({});
      const result = await applyLocationAssignmentChanges(
        USER_JOHN,
        [
          { locationId: NASA, action: "assign", role: "manager" },
          { locationId: NASA, action: "update", role: "staff" },
        ],
        client,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("DUPLICATE_LOCATION");
      }
      expect(rpcMock).not.toHaveBeenCalled();
    });

    it("DATA-005: empty change set returns deterministic no-op without RPC call", async () => {
      const { client, rpcMock } = createMockSupabase({});
      const result = await applyLocationAssignmentChanges(
        USER_JOHN,
        [],
        client,
      );

      expect(result).toEqual({
        success: true,
        assignments: [],
      });
      expect(rpcMock).not.toHaveBeenCalled();
    });

    it("DATA-003 & DATA-008: calls PostgreSQL RPC with targetProfileId and formatted changes", async () => {
      const returnedRows: LocationMembershipDbRow[] = [
        {
          id: 10,
          location_id: NASA,
          profile_id: USER_JOHN,
          role: "manager",
          active: true,
          created_at: "2026-11-03T10:00:00Z",
          updated_at: "2026-11-03T10:00:00Z",
        },
        {
          id: 11,
          location_id: LEAGUE_CITY,
          profile_id: USER_JOHN,
          role: "assistant_manager",
          active: true,
          created_at: "2026-11-03T10:00:00Z",
          updated_at: "2026-11-03T10:00:00Z",
        },
      ];

      const { client, rpcMock } = createMockSupabase({ rpcData: returnedRows });

      const result = await applyLocationAssignmentChanges(
        USER_JOHN,
        [
          { locationId: NASA, action: "assign", role: "manager" },
          {
            locationId: LEAGUE_CITY,
            action: "assign",
            role: "assistant_manager",
          },
        ],
        client,
      );

      expect(rpcMock).toHaveBeenCalledWith(
        "apply_location_assignment_changes",
        {
          p_target_profile_id: USER_JOHN,
          p_changes: [
            {
              locationId: NASA,
              action: "assign",
              role: "manager",
              active: true,
            },
            {
              locationId: LEAGUE_CITY,
              action: "assign",
              role: "assistant_manager",
              active: true,
            },
          ],
        },
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.assignments).toHaveLength(2);
        expect(result.assignments[0].role).toBe("manager");
        expect(result.assignments[1].role).toBe("assistant_manager");
      }
    });

    it("DATA-006: maps unauthorized RPC error to UNAUTHORIZED code", async () => {
      const { client } = createMockSupabase({
        rpcError: {
          message:
            "Unauthorized: caller lacks management role in organization ...",
          code: "42501",
        },
      });

      const result = await applyLocationAssignmentChanges(
        USER_JOHN,
        [{ locationId: NASA, action: "assign", role: "manager" }],
        client,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("UNAUTHORIZED");
      }
    });

    it("DATA-007: maps missing parent org membership to MEMBERSHIP_REQUIRED code", async () => {
      const { client } = createMockSupabase({
        rpcError: {
          message: "Target profile lacks active membership in organization ...",
          code: "42501",
        },
      });

      const result = await applyLocationAssignmentChanges(
        USER_JOHN,
        [{ locationId: NASA, action: "assign", role: "manager" }],
        client,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("MEMBERSHIP_REQUIRED");
      }
    });

    it("DATA-009: maps duplicate location error to DUPLICATE_LOCATION code", async () => {
      const { client } = createMockSupabase({
        rpcError: {
          message: "Duplicate location instruction in batch",
          code: "23505",
        },
      });

      const result = await applyLocationAssignmentChanges(
        USER_JOHN,
        [{ locationId: NASA, action: "assign", role: "manager" }],
        client,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("DUPLICATE_LOCATION");
      }
    });

    it("handles unexpected runtime exceptions gracefully", async () => {
      const client = {
        rpc: vi.fn().mockRejectedValue(new Error("Network connection dropped")),
      } as unknown as SupabaseClient<Database>;

      const result = await applyLocationAssignmentChanges(
        USER_JOHN,
        [{ locationId: NASA, action: "assign", role: "manager" }],
        client,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("INTERNAL_ERROR");
        expect(result.error).toContain("Network connection dropped");
      }
    });
  });
});
