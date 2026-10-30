# Recipes V1 — migration parity (2026-10-29)

Live history inspection after DEV-only validator fix. Local 62; DEV 62; PROD 54. DEV head `20261029194855`; PROD head `20261028100100`. No remote-only or duplicate versions, no repair performed. Seven older PROD names include the version prefix and store a whole SQL block; SQL-token comparison against DEV matches (comments/whitespace/statement delimiters omitted). This metadata comparison does not assert a complete remote schema diff.

| Migration                                                            | Local | DEV | DEV status | PROD | PROD pending | Feature / history note                                               |
| -------------------------------------------------------------------- | ----- | --- | ---------- | ---- | ------------ | -------------------------------------------------------------------- |
| `20260905065702_initial_schema.sql`                                  | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260905125418_operational_modules.sql`                             | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260905153509_passcode_rate_limit_degrade.sql`                     | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260905163719_self_serve_registration.sql`                         | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260905164904_registration_contact_optional.sql`                   | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260905174919_allocation_open_editing.sql`                         | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260906080000_board_event_type_reorder_values.sql`                 | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260906140000_allocation_board_rpcs.sql`                           | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260906144345_allocation_board_private_fn_grants.sql`              | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260906144901_table_rotation_entries_update_delete_any_member.sql` | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260906145748_allocation_board_manager_only_actions.sql`           | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260907090000_attendance_identity_links.sql`                       | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260907143637_harden_attendance_identity_links.sql`                | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260907180000_payroll_schema_rls.sql`                              | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260907200000_payroll_payment_draft_delete_and_lock.sql`           | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260908090000_payroll_period_snapshot_lock.sql`                    | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260908150000_payroll_adjustments.sql`                             | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260908160000_payroll_payment_target_lock.sql`                     | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260908170000_profiles_manager_rename.sql`                         | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260908180000_table_rotation_entries_finalized_lock_rls_fix.sql`   | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260908190000_board_clear_cell.sql`                                | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260908200000_assert_board_not_locked_security_definer.sql`        | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260908210000_assert_board_not_locked_historical_date.sql`         | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260909100000_shifts_recurrence.sql`                               | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260909120000_payroll_periods_self_locked_only.sql`                | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260911130000_payroll_payment_unconfirm.sql`                       | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20260919120000_table_rotation_multi_view_foundation.sql`            | Yes   | Yes | Matched    | Yes  | No           | Previously released; historical prefixed PROD name, SQL tokens match |
| `20260919130000_board_events_retention.sql`                          | Yes   | Yes | Matched    | Yes  | No           | Previously released; historical prefixed PROD name, SQL tokens match |
| `20260920100000_table_rotation_upgrade_1_1.sql`                      | Yes   | Yes | Matched    | Yes  | No           | Previously released; historical prefixed PROD name, SQL tokens match |
| `20260921100000_table_rotation_multi_table_per_server.sql`           | Yes   | Yes | Matched    | Yes  | No           | Previously released; historical prefixed PROD name, SQL tokens match |
| `20260922100000_table_rotation_end_multiple_and_assign.sql`          | Yes   | Yes | Matched    | Yes  | No           | Previously released; historical prefixed PROD name, SQL tokens match |
| `20260923090000_table_rotation_floor_layout_backfill.sql`            | Yes   | Yes | Matched    | Yes  | No           | Previously released; historical prefixed PROD name, SQL tokens match |
| `20260923100000_table_rotation_concurrency_safe_positions.sql`       | Yes   | Yes | Matched    | Yes  | No           | Previously released; historical prefixed PROD name, SQL tokens match |
| `20261023100000_table_rotation_v2_session_integrity.sql`             | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20261023110000_table_rotation_v2_trusted_mutations.sql`             | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20261025090000_tasks_v1_foundation.sql`                             | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20261025100000_tasks_v1_checklists.sql`                             | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20261025110000_tasks_v1_recurrence.sql`                             | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20261025120000_tasks_v1_notifications.sql`                          | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20261026090000_table_allocation_conflict_resolution.sql`            | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20261026120000_table_input_canonical_resolution.sql`                | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20261026150000_table_allocation_same_server_repeat.sql`             | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20261026170000_bar_inventory_catalog.sql`                           | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20261026180000_bar_inventory_stock_ledger.sql`                      | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20261026190000_bar_inventory_actor_fk_deferrable.sql`               | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20261026190100_bar_inventory_fk_deferrable_cascade.sql`             | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20261026190200_bar_inventory_subcategory_org_cascade.sql`           | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20261027120000_bar_inventory_import_commit.sql`                     | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20261027130000_bar_inventory_realtime.sql`                          | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20261027195142_bar_inventory_order_drafts.sql`                      | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20261027210000_bar_inventory_order_draft_save_order_qty_fix.sql`    | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20261028090000_tasks_v1_1_notification_scope.sql`                   | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20261028100000_tasks_v1_1_opening_reminder_type.sql`                | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20261028100100_tasks_v1_1_opening_reminders.sql`                    | Yes   | Yes | Matched    | Yes  | No           | Previously released                                                  |
| `20261028140623_bar_recipes_foundation.sql`                          | Yes   | Yes | Matched    | No   | Yes          | Recipes V1                                                           |
| `20261028193159_bar_recipes_management_and_images.sql`               | Yes   | Yes | Matched    | No   | Yes          | Recipes V1                                                           |
| `20261029005940_bar_inventory_freshness.sql`                         | Yes   | Yes | Matched    | No   | Yes          | Inventory V1.1                                                       |
| `20261029010431_bar_inventory_bulk_count.sql`                        | Yes   | Yes | Matched    | No   | Yes          | Inventory V1.1                                                       |
| `20261029010756_bar_inventory_saved_views.sql`                       | Yes   | Yes | Matched    | No   | Yes          | Inventory V1.1                                                       |
| `20261029012324_bar_inventory_v1_1_deferred_tenant_fks.sql`          | Yes   | Yes | Matched    | No   | Yes          | Inventory V1.1                                                       |
| `20261029014613_bar_inventory_calendar_year_range.sql`               | Yes   | Yes | Matched    | No   | Yes          | Inventory V1.1                                                       |
| `20261029194855_bar_recipe_category_reorder_validate_ids.sql`        | Yes   | Yes | Matched    | No   | Yes          | Recipes V1                                                           |
