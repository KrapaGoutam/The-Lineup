# Subfeature V2-001.007: RLS / Server Security Hardening

Parent Feature: [V2-001: Access & Role Foundation](../README.md)  
Status: `NOT STARTED`

## Scope
1. Permanently remove the `organizations.created_by` bypass from `private.has_org_role` (closes Issue #106 debt).
2. Rewrite database authorization helpers to verify active membership and valid location assignment.
3. Add pgTAP assertions verifying that deactivated creators lose all access.
4. Ensure all existing pgTAP suites pass without regressions.
