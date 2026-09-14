# CauseConnect Frontend

This feature branch contains the Stage 2 campaign homepage implementation. Registration, login and logout are separate Stage 2 tasks; participation and campaign posting remain Stage 3 work.

The page follows the current CauseConnect storyboard and the web design standards recorded in the team's Stage 2 Design Document. Campaigns are loaded from the public backend API implemented in PR #8.

## Run locally

```sh
npm install
npm run dev
```

The local development server forwards `/api` requests to the backend on `http://127.0.0.1:3000`, so the backend must also be running when testing the live campaign data.

## Verify

```sh
npm test
npm run build
```

## Integration handoff

These paths show what is available in this branch and what still needs to be added.

| Path | Expected owner contribution | Current state |
|---|---|---|
| `/` | Campaign homepage | Loads approved campaigns from `GET /api/campaigns/public` |
| `/campaigns/:campaignId` | Public campaign details | Temporarily finds the selected campaign in the public list |
| `/login` | Login form and validation | Planned; header link is commented out |
| `/register` | Account-registration form and validation | Planned; link from the login page when ready |

The frontend maps the backend's `campaigns` response into the existing card layout, converts numeric campaign IDs for browser routes, and uses a placeholder when `imageUrl` is empty. A dedicated campaign-details request can replace the current list lookup if a single-campaign endpoint is added later.

## Current design decisions

- The shared colours, typography and responsive layout follow the current Stage 2 web design standards.
- `Campaigns` moves to the list on the homepage.
- Each `View campaign` link opens the matching public campaign details route. Search and filters remain outside this branch.
- Login stays hidden until `/login` exists.
- Campaign images use empty alternative text because the adjacent title and description already provide the campaign meaning. Campaigns without an image use the local CauseConnect placeholder.

Image provenance is recorded in [the Stage 2 evidence folder](../docs/evidence/stage-2/campaign-image-provenance.md).
