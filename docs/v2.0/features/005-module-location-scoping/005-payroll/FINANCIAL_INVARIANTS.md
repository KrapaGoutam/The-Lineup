# Feature V2-005.005: Payroll Financial Invariants

## 1. Core Financial Formulas & Ledger Balance Contract

All monetary values are stored and calculated as **non-negative integer cents** (with the sole exception of `payroll_adjustments.delta_cents`, which is a signed non-zero integer):

$$ \text{Gross Cents} = \text{round}(\text{hours_snapshot} \times \text{rate_cents_snapshot}) $$

$$ \text{Balance Cents} = \text{gross_cents} - \sum(\text{confirmed_payment_cents}) - \sum(\text{adjustment_delta_cents}) $$

### Contract Invariants:

1. **Draft payments NEVER reduce balance**:
   - A draft payment is recorded but pending confirmation.
   - It is displayed separately in the UI ("N drafts pending, $X") so managers are aware of in-flight disbursements without moving the legal balance.
2. **Confirmed payments IMMEDIATELY reduce balance**:
   - When a payment is confirmed (`status = 'confirmed'`), it enters the balance subtraction.
   - Once confirmed, the payment's `amount_cents`, `payment_date`, `comment`, `payroll_period_id`, and `organization_id` become permanently immutable via database triggers (`private.forbid_confirmed_payment_edit()`).
3. **Confirmed payments are UNDELETABLE**:
   - Attempting to delete a confirmed payment throws an exception via `private.forbid_confirmed_payment_delete()`.
4. **Unconfirm is an explicit, reason-gated transaction**:
   - Allowed only through `public.unconfirm_payroll_payment(p_payment_id, p_reason)`.
   - Requires a mandatory reason (minimum 3 characters).
   - Writes an atomic `audit_event` with `action = 'payroll_payment_unconfirmed'`, before/after state, and actor attribution.
5. **Adjustments are append-only corrections**:
   - `payroll_adjustments` has no UPDATE or DELETE grant for any role.
   - Every adjustment requires a non-zero `delta_cents` and a mandatory reason (minimum 3 characters).
   - Once inserted, an adjustment can never be altered or deleted.
6. **Frozen snapshots & payment protection**:
   - A `payroll_periods` row holds immutable columns: `hours_snapshot`, `rate_cents_snapshot`, `gross_cents`.
   - Regeneration is permitted ONLY when `COUNT(payroll_payments) == 0` (draft or confirmed) AND `status <> 'locked'`.
   - Database trigger `private.forbid_payroll_period_snapshot_edit()` independently guards snapshot columns against unauthorized mutation.
7. **Unique period contract**:
   - `UNIQUE(organization_id, neon_user_id, period_month)` is strictly preserved.
   - An employee has at most ONE payroll period per calendar month per organization.
   - Adding `location_id` as an optional column does NOT alter this uniqueness constraint.
   - Multi-location double counting or duplicate period generation is structurally impossible in the database schema.
8. **No automatic recomputation**:
   - Subsequent changes in Neon attendance records or updates to `payroll_rates` have zero effect on already-generated monthly periods.
9. **No cross-location drift**:
   - Payments and adjustments reference `payroll_period_id`, inheriting the exact tenant and location scope of the period.
   - A payment or adjustment cannot be created or moved across locations or organizations.
