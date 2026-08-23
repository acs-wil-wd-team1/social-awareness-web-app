# CauseConnect Frontend

This feature branch contains the Stage 2 campaign homepage implementation. Registration, login and logout are separate Stage 2 tasks; participation and campaign posting remain Stage 3 work.

The page follows the current CauseConnect storyboard direction and uses local campaign data while the backend is being developed. Colours, photographs and layout remain open for the Front-end Designers to finalise.

## Run locally

```sh
npm install
npm run dev
```

## Verify

```sh
npm test
npm run build
```

## Integration handoff

These are working paths, not active links until the matching page is implemented and merged.

| Path | Expected owner contribution | Current state |
|---|---|---|
| `/` | Campaign homepage | Implemented on this feature branch |
| `/login` | Login form and validation | Planned; header link is commented out |
| `/register` | Account-registration form and validation | Planned; link from the login page when ready |

The local service returns the draft campaign-list envelope and the fields needed by this page. `createdBy` remains omitted because its format has not been agreed. Replace the local service during integration using the [draft API contract](../docs/api/api-contract.md).

## Current design decisions

- `Campaigns` moves to the list on the homepage.
- Campaign-detail buttons, search and filters are waiting for confirmed scope and working backend behaviour.
- Login stays hidden until `/login` exists.
- The photographs are provisional. They use empty alternative text because the adjacent title and description already provide the campaign meaning; this avoids repeating the same information to screen-reader users.

Image provenance is recorded in [the Stage 2 evidence folder](../docs/evidence/stage-2/campaign-image-provenance.md).
