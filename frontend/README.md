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

These paths show what is available in this branch and what still needs to be added.

| Path | Expected owner contribution | Current state |
|---|---|---|
| `/` | Campaign homepage | Implemented on this feature branch |
| `/campaigns/:campaignId` | Public campaign details | Implemented with local campaign data |
| `/login` | Login form and validation | Planned; header link is commented out |
| `/register` | Account-registration form and validation | Planned; link from the login page when ready |

The local service returns the draft campaign-list and single-campaign envelopes and the fields needed by these pages. `createdBy` remains omitted because its format has not been agreed. The longer campaign copy and goals are provisional local content; they will need to be confirmed or mapped when the backend response is agreed. Replace the local service during integration using the [draft API contract](../docs/api/api-contract.md).

## Current design decisions

- `Campaigns` moves to the list on the homepage.
- Each `View campaign` link opens the matching public campaign details route. Search and filters remain outside this branch.
- Login stays hidden until `/login` exists.
- The photographs are provisional. They use empty alternative text because the adjacent title and description already provide the campaign meaning; this avoids repeating the same information to screen-reader users.

Image provenance is recorded in [the Stage 2 evidence folder](../docs/evidence/stage-2/campaign-image-provenance.md).
