# SSE progress error surface

## Goal

Fix the TT-Sync minimal server progress event stream so asynchronous polling failures are surfaced explicitly to the client instead of becoming unhandled promise rejections or hanging SSE connections.

## Scope

- Audit `/v2/plans/{plan_id}/events` streaming behavior.
- Keep normal progress event payloads unchanged.
- On stream polling failure, send an explicit SSE error event and end the response.
- Add focused test coverage that does not require opening a listening socket.
- Run available relevant checks.

## Constraints

- Do not change existing success behavior or API routes.
- Do not add silent fallback behavior.
- Keep the fix small and aligned with existing route helpers.
