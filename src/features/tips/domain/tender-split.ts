import { splitCentsEvenly } from "@/features/tips/domain/calculate-tip-splits";

/** Per-tender cap, identical to `tips_save_interval` ($100,000.00). */
export const MAX_TENDER_CENTS = 10_000_000;
export const MAX_PARTICIPANTS = 200;

export type TenderShare = {
  participantId: string;
  totalCents: number;
  cashCents: number;
  cardCents: number;
};

export type RemainderDisclosure = {
  /** Cents left after dividing the combined total evenly. */
  totalRemainderCents: number;
  cashRemainderCents: number;
  cardRemainderCents: number;
  /** People who received one extra cent of the TOTAL (stable id order). */
  totalRemainderRecipients: string[];
  cashRemainderRecipients: string[];
};

export type TenderSplit = {
  cashCents: number;
  cardCents: number;
  totalCents: number;
  /** In stable participant-id order, the same order the database uses. */
  shares: TenderShare[];
  remainder: RemainderDisclosure;
};

export function assertTenderAmounts(cashCents: number, cardCents: number) {
  for (const value of [cashCents, cardCents]) {
    if (!Number.isInteger(value) || value < 0 || value > MAX_TENDER_CENTS) {
      throw new Error(
        "Cash and card tips must each be between $0.00 and $100,000.00.",
      );
    }
  }
  if (cashCents + cardCents <= 0) {
    throw new Error("Enter a cash or card tip amount greater than zero.");
  }
}

/**
 * Divides one interval's cash and card tips among its participants in integer cents.
 *
 * This is the TypeScript mirror of `private.tips_interval_shares` (a database test pins
 * both to the same worked examples):
 *   - each person's TOTAL is the legacy even split of cash + card;
 *   - cash is split evenly on its own, with the same stable rank order;
 *   - card is each person's total minus their cash, which is never negative.
 * So sum(cash) = cash, sum(card) = card, sum(total) = cash + card, always, and a person's
 * total never depends on how the money was tendered.
 */
export function splitTenders(input: {
  cashCents: number;
  cardCents: number;
  participantIds: readonly string[];
}): TenderSplit {
  assertTenderAmounts(input.cashCents, input.cardCents);
  const participants = [...new Set(input.participantIds)];
  if (participants.length === 0) {
    throw new Error("Choose at least one participant.");
  }
  if (participants.length > MAX_PARTICIPANTS) {
    throw new Error("Too many participants for one interval.");
  }
  const totalCents = input.cashCents + input.cardCents;
  const totals = splitCentsEvenly(totalCents, participants);
  const cash = splitCentsEvenly(input.cashCents, participants);
  const shares = totals.map((total, index) => ({
    participantId: total.participantId,
    totalCents: total.amountCents,
    cashCents: cash[index].amountCents,
    cardCents: total.amountCents - cash[index].amountCents,
  }));
  const count = shares.length;
  const baseTotal = Math.floor(totalCents / count);
  const baseCash = Math.floor(input.cashCents / count);
  return {
    cashCents: input.cashCents,
    cardCents: input.cardCents,
    totalCents,
    shares,
    remainder: {
      totalRemainderCents: totalCents % count,
      cashRemainderCents: input.cashCents % count,
      cardRemainderCents: input.cardCents % count,
      totalRemainderRecipients: shares
        .filter((share) => share.totalCents > baseTotal)
        .map((share) => share.participantId),
      cashRemainderRecipients: shares
        .filter((share) => share.cashCents > baseCash)
        .map((share) => share.participantId),
    },
  };
}

/** Every cent of the interval is accounted for exactly once. */
export function isReconciled(split: TenderSplit): boolean {
  const sum = (pick: (share: TenderShare) => number) =>
    split.shares.reduce((acc, share) => acc + pick(share), 0);
  return (
    sum((s) => s.cashCents) === split.cashCents &&
    sum((s) => s.cardCents) === split.cardCents &&
    sum((s) => s.totalCents) === split.totalCents &&
    split.shares.every(
      (s) => s.cashCents >= 0 && s.cardCents >= 0 && s.totalCents >= 0,
    )
  );
}

/** Plain-language remainder note for the review screen and the printed report. */
export function describeRemainder(
  split: TenderSplit,
  nameOf: (participantId: string) => string,
): string | null {
  const { totalRemainderCents, totalRemainderRecipients } = split.remainder;
  if (totalRemainderCents === 0) return null;
  const names = totalRemainderRecipients.map(nameOf).join(", ");
  return `${totalRemainderCents}¢ could not be divided evenly. It is given one cent at a time in a fixed order (by employee ID) to: ${names}.`;
}
