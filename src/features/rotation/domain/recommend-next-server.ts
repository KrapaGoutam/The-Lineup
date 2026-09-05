export type RotationStatus = "active" | "paused" | "closing" | "unavailable";

export type RotationMember = {
  id: string;
  displayName: string;
  status: RotationStatus;
  position: number;
  partyCount: number;
  coverCount: number;
  activeTableCount: number;
  maxConcurrentTables: number | null;
  lastSeatedAt: string | null;
};

export type RotationPolicy = {
  coverWeight: number;
  activeTableWeight: number;
};

export type RotationRecommendation = {
  member: RotationMember;
  effectiveWorkload: number;
  explanation: string;
};

const defaultPolicy: RotationPolicy = {
  coverWeight: 0.25,
  activeTableWeight: 0.5,
};

function isEligible(member: RotationMember) {
  if (member.status !== "active") return false;
  if (member.maxConcurrentTables === null) return true;
  return member.activeTableCount < member.maxConcurrentTables;
}

function workload(member: RotationMember, policy: RotationPolicy) {
  return (
    member.partyCount +
    member.coverCount * policy.coverWeight +
    member.activeTableCount * policy.activeTableWeight
  );
}

function lastSeatedValue(value: string | null) {
  return value === null ? Number.NEGATIVE_INFINITY : Date.parse(value);
}

export function recommendNextServer(
  members: RotationMember[],
  policy: RotationPolicy = defaultPolicy,
): RotationRecommendation | null {
  const ranked = members
    .filter(isEligible)
    .map((member) => ({ member, effectiveWorkload: workload(member, policy) }))
    .sort((left, right) => {
      const loadDelta = left.effectiveWorkload - right.effectiveWorkload;
      if (loadDelta !== 0) return loadDelta;

      const seatedDelta =
        lastSeatedValue(left.member.lastSeatedAt) -
        lastSeatedValue(right.member.lastSeatedAt);
      if (seatedDelta !== 0) return seatedDelta;

      const positionDelta = left.member.position - right.member.position;
      if (positionDelta !== 0) return positionDelta;

      return left.member.id.localeCompare(right.member.id);
    });

  const selected = ranked[0];
  if (!selected) return null;

  return {
    ...selected,
    explanation: `${selected.member.displayName} has the lowest eligible workload (${selected.effectiveWorkload.toFixed(2)}); ties use the oldest seating time and stable rotation order.`,
  };
}
