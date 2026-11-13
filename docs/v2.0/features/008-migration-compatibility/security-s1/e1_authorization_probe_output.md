# E-1 authorization probe — recorded output (2026-11-12)

Produced by [e1_authorization_probe.sql](e1_authorization_probe.sql) against the **disposable local stack** (local ledger 90, GoTrue v2.186.0). Every probe ran the real RPC as the actor under the `authenticated` role with a live `session_id` claim inside a subtransaction that was always rolled back; the file ends in `ROLLBACK`. No hosted DEV, Production or Neon access. 306 probe rows = 16 actors × 23 probes.

Fixture: organization A with **two** active locations (A1, A2); organization B with one. Actors 01–03 hold Overall roles (no membership rows); 04–06 hold org roles only; 07–13 hold location rows; 14 is an org member with no location row; 15 is anonymous.

Legend: ✅ authorized (statement completed, then rolled back) · ⛔ denied `42501` · ✅\* passed authorization and failed later on the deliberately empty probe payload (`22023`) · `–` not probed.

Probe keys — **W1** `bar_recipe_category_save` · **W2** `bar_recipe_save` · **W3** `inventory_vendor_create @A1` · **W4** `inventory_vendor_update @A1` (rename of a _shared_ seeded vendor) · **W5** `inventory_category_create @A1` · **W6** `inventory_product_create @A1` · **W7** `inventory_product_set_active(false) @A1` (deactivates a _shared_ seeded product) · **W8** `inventory_vendor_create @A2` · **L1/L2** `inventory_bootstrap @A1/@A2` · **L3/L4** `inventory_bulk_count @A1/@A2` · **R1–R4** rows visible in `inventory_vendors / inventory_products / bar_recipes / bar_recipe_categories` (seed: 2 vendors, 1 product, 2 recipes of which 1 archived, 1 recipe category) · **X1/X2** the same writes aimed at organization B.

## Headline reading

1. **No cross-tenant write exists.** Every organization-A actor is denied at organization B (X1/X2); only B's own owner is authorized there.
2. **Inventory shared-catalog writes (W3–W7): a location assistant manager at A1 — and a location manager — can create, rename and deactivate organization-level vendors, categories and products** used by every location. The only thing gating them is `inventory_begin(org, location)`, i.e. location-scoped authority at a location the caller chooses.
3. **Recipes writes (W1/W2): location manager, location assistant manager and even the manager of an unrelated location (13) can edit the organization-wide book.** This matches the V2-005 plan sentence "Location Managers / Assistant Managers have management authority for recipes within their organization" and pgTAP 0069; it is a documented contract, not an accident (see the E-1 plan §3).
4. **Org shift manager with no location row (06)** can write Recipes in a two-location organization but is denied every Inventory path — the Recipes seam was never reconciled with ACCESS_MODEL §5 rule 5.
5. Location **staff**, an **inactive** location manager, a manager with an **inactive org membership**, a **cross-org** actor, an **org member with no location row** and **anonymous** are denied everywhere that matters.

### Predicates (`true` = ✅)

| Actor                                      | recipes_is_member(A) | recipes_is_manager(A) | inventory_is_manager(A) | inventory_can_access(A,A1) | inventory_can_access(A,A2) |
| ------------------------------------------ | :------------------: | :-------------------: | :---------------------: | :------------------------: | :------------------------: |
| 01 Overall owner                           |          ✅          |          ✅           |           ✅            |             ✅             |             ✅             |
| 02 Overall manager                         |          ✅          |          ✅           |           ✅            |             ✅             |             ✅             |
| 03 Overall assistant manager               |          ✅          |          ✅           |           ✅            |             ✅             |             ✅             |
| 04 Org owner (A)                           |          ✅          |          ✅           |           ✅            |             ✅             |             ✅             |
| 05 Org general manager (A)                 |          ✅          |          ✅           |           ✅            |             ✅             |             ✅             |
| 06 Org shift manager (A, no loc row)       |          ✅          |          ✅           |           ⛔            |             ⛔             |             ⛔             |
| 07 Location MANAGER A1                     |          ✅          |          ✅           |           ✅            |             ✅             |             ⛔             |
| 08 Location ASSISTANT MGR A1               |          ✅          |          ✅           |           ✅            |             ✅             |             ⛔             |
| 09 Location STAFF A1                       |          ✅          |          ⛔           |           ⛔            |             ⛔             |             ⛔             |
| 10 INACTIVE location manager A1            |          ✅          |          ⛔           |           ⛔            |             ⛔             |             ⛔             |
| 11 Loc manager A1, INACTIVE org membership |          ⛔          |          ⛔           |           ⛔            |             ⛔             |             ⛔             |
| 12 Cross-org actor (org B owner)           |          ⛔          |          ⛔           |           ⛔            |             ⛔             |             ⛔             |
| 13 Cross-location: manager of A2 only      |          ✅          |          ✅           |           ✅            |             ⛔             |             ✅             |
| 14 Org member, no location row             |          ✅          |          ⛔           |           ⛔            |             ⛔             |             ⛔             |

### Writes (✅ = authorized, ⛔ = 42501)

| Actor                                      | W1  | W2  | W3  | W4  | W5  | W6  | W7  | W8  |
| ------------------------------------------ | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| 01 Overall owner                           | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  |
| 02 Overall manager                         | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  |
| 03 Overall assistant manager               | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  |
| 04 Org owner (A)                           | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  |
| 05 Org general manager (A)                 | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  |
| 06 Org shift manager (A, no loc row)       | ✅  | ✅  | ⛔  | ⛔  | ⛔  | ⛔  | ⛔  | ⛔  |
| 07 Location MANAGER A1                     | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | ⛔  |
| 08 Location ASSISTANT MGR A1               | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | ✅  | ⛔  |
| 09 Location STAFF A1                       | ⛔  | ⛔  | ⛔  | ⛔  | ⛔  | ⛔  | ⛔  | ⛔  |
| 10 INACTIVE location manager A1            | ⛔  | ⛔  | ⛔  | ⛔  | ⛔  | ⛔  | ⛔  | ⛔  |
| 11 Loc manager A1, INACTIVE org membership | ⛔  | ⛔  | ⛔  | ⛔  | ⛔  | ⛔  | ⛔  | ⛔  |
| 12 Cross-org actor (org B owner)           | ⛔  | ⛔  | ⛔  | ⛔  | ⛔  | ⛔  | ⛔  | ⛔  |
| 13 Cross-location: manager of A2 only      | ✅  | ✅  | ⛔  | ⛔  | ⛔  | ⛔  | ⛔  | ✅  |
| 14 Org member, no location row             | ⛔  | ⛔  | ⛔  | ⛔  | ⛔  | ⛔  | ⛔  | ⛔  |
| 15 Anonymous                               | ⛔  |  –  | ⛔  |  –  |  –  |  –  |  –  |  –  |

### Location-scoped Inventory (✅\* = passed authorization, then 22023 on the empty probe payload)

| Actor                                      | L1  | L2  |  L3  |  L4  |
| ------------------------------------------ | :-: | :-: | :--: | :--: |
| 01 Overall owner                           | ✅  | ✅  | ✅\* | ✅\* |
| 02 Overall manager                         | ✅  | ✅  | ✅\* | ✅\* |
| 03 Overall assistant manager               | ✅  | ✅  | ✅\* | ✅\* |
| 04 Org owner (A)                           | ✅  | ✅  | ✅\* | ✅\* |
| 05 Org general manager (A)                 | ✅  | ✅  | ✅\* | ✅\* |
| 06 Org shift manager (A, no loc row)       | ⛔  | ⛔  |  ⛔  |  ⛔  |
| 07 Location MANAGER A1                     | ✅  | ⛔  | ✅\* |  ⛔  |
| 08 Location ASSISTANT MGR A1               | ✅  | ⛔  | ✅\* |  ⛔  |
| 09 Location STAFF A1                       | ⛔  | ⛔  |  ⛔  |  ⛔  |
| 10 INACTIVE location manager A1            | ⛔  | ⛔  |  ⛔  |  ⛔  |
| 11 Loc manager A1, INACTIVE org membership | ⛔  | ⛔  |  ⛔  |  ⛔  |
| 12 Cross-org actor (org B owner)           | ⛔  | ⛔  |  ⛔  |  ⛔  |
| 13 Cross-location: manager of A2 only      | ⛔  | ✅  |  ⛔  | ✅\* |
| 14 Org member, no location row             | ⛔  | ⛔  |  ⛔  |  ⛔  |

### Shared-resource reads (rows visible)

| Actor                                      | R1  | R2  | R3  | R4  |
| ------------------------------------------ | :-: | :-: | :-: | :-: |
| 01 Overall owner                           |  2  |  1  |  2  |  1  |
| 02 Overall manager                         |  2  |  1  |  2  |  1  |
| 03 Overall assistant manager               |  2  |  1  |  2  |  1  |
| 04 Org owner (A)                           |  2  |  1  |  2  |  1  |
| 05 Org general manager (A)                 |  2  |  1  |  2  |  1  |
| 06 Org shift manager (A, no loc row)       |  0  |  0  |  2  |  1  |
| 07 Location MANAGER A1                     |  2  |  1  |  2  |  1  |
| 08 Location ASSISTANT MGR A1               |  2  |  1  |  2  |  1  |
| 09 Location STAFF A1                       |  0  |  0  |  1  |  1  |
| 10 INACTIVE location manager A1            |  0  |  0  |  1  |  1  |
| 11 Loc manager A1, INACTIVE org membership |  0  |  0  |  0  |  0  |
| 12 Cross-org actor (org B owner)           |  0  |  0  |  0  |  0  |
| 13 Cross-location: manager of A2 only      |  2  |  1  |  2  |  1  |
| 14 Org member, no location row             |  0  |  0  |  1  |  1  |

### Cross-tenant: every actor aimed at ORG B

| Actor                            | X1  | X2  |
| -------------------------------- | :-: | :-: |
| 04 Org owner (A)                 | ⛔  | ⛔  |
| 07 Location MANAGER A1           | ⛔  | ⛔  |
| 08 Location ASSISTANT MGR A1     | ⛔  | ⛔  |
| 12 Cross-org actor (org B owner) | ✅  | ✅  |
| 13 Manager of A2 only            | ⛔  | ⛔  |
