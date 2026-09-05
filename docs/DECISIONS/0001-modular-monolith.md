# ADR 0001: Modular Monolith on Vercel and Supabase

**Status:** accepted  
**Date:** 2026-09-05

## Context

The product needs relational scheduling, multi-tenant authorization, transaction-safe seating, and realtime operational updates. The first pilot does not justify independently deployed services.

## Decision

Use one Next.js App Router application deployed to Vercel and one Supabase project for Auth, Postgres, RLS, and Realtime. Organize application code by product feature and keep multi-row invariants in transaction-safe Postgres functions.

## Consequences

- Fewer deployments and simpler tracing for the pilot.
- RLS and relational constraints remain close to the data.
- Feature boundaries must be enforced by code structure and review rather than service APIs.
- A schema deployment can limit application rollback, so migrations must remain backward compatible.
- Extract a service only after observed scaling, integration, or team-ownership pressure.
