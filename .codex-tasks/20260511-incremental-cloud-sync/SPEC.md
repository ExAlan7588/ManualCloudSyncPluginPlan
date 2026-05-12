# Incremental Cloud Sync Task

## Goal

Complete the actionable items in `docs/IncrementalCloudSyncPlan.md` to the highest feasible quality inside this repository.

## Repository Boundary

This repository is a TauriTavern GitHub extension frontend. It does not contain the Rust `src-tauri` backend, TT-Sync server, VPS deployment files, or mobile app build pipeline referenced by the plan.

## Deliverables

- Audit the plan and distinguish repo-local deliverables from external backend/VPS/mobile deliverables.
- Add a separate incremental TT-Sync UI surface so it is not confused with the existing full zip transfer panel.
- Wire the UI to real backend command names only; failures must be visible and must not be mocked.
- Preserve the existing WebDAV/S3 full zip and compatibility-mode behavior.
- Update documentation so completed, external, and deferred items are explicit.
- Run reproducible validation before completion.

## Non-Goals

- Implement a TT-Sync server inside this frontend-only plugin repository.
- Simulate backend success when `tt_sync_*` commands are absent.
- Deploy or configure a real VPS without deployable server artifacts and credentials.
