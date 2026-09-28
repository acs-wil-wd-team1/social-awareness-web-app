# CauseConnect Frontend

React frontend for CauseConnect. It includes public campaign browsing, registration, login/logout, and text-only social-cause campaign submission for public users.

The layout follows the CauseConnect storyboard and Stage 2 web design standards. Campaign data and authentication use the backend API.

## Run locally

```sh
npm ci
npm run dev
```

The local development server forwards `/api` requests to the backend on `http://127.0.0.1:3000`, so the backend must also be running when testing the live campaign data.

Use Node.js 22.12 or newer. Backend configuration is in the [backend README](../backend/README.md).

## Verify

```sh
npm test
npm run build
```

## Routes

| Path | Page | API behaviour |
|---|---|---|
| `/` | Campaign homepage | Loads approved campaigns from `GET /api/campaigns` |
| `/campaigns/:campaignId` | Public campaign details | Loads the selected campaign from `GET /api/campaigns/:id` |
| `/login` | Login | Calls `POST /api/auth/login` and stores the returned token |
| `/register` | Registration | Calls `POST /api/auth/register` for a public user account |
| `/logout` | Logout | Calls `PUT /api/auth/logout`, then removes the local token |
| `/campaigns/new` | Create a campaign | Loads `GET /api/campaigns/categories` and submits to `POST /api/campaigns` with a Bearer token |
| `/draft/campaigns/new` | Development-only form sample | Uses sample data; makes no API requests and saves nothing |

The creation form submits text details only. The backend checks the active session and public role, assigns the creator and pending status, and saves the campaign. The page shows the saved campaign ID after a valid `201` response. Pending campaigns do not have a public details link. Image uploads, business posting, and admin moderation are separate follow-up work.

The Create campaign link uses token presence to decide whether to show it; it does not determine permissions. Expired sessions and unsupported roles are rejected by the backend and shown as errors in the form.

The frontend maps the backend's campaign responses into the existing card and details layouts and converts numeric campaign IDs for browser routes. For the four current Stage 2 seeded campaigns, local presentation metadata supplies the matching image and campaign type when those values are absent from the API response. Values supplied by the API always take precedence.

## Current design decisions

- The shared colours, typography and responsive layout follow the current Stage 2 web design standards.
- `Campaigns` moves to the list on the homepage.
- Each `View campaign` link opens the matching public campaign details route. Search and filters are not provided in the current interface.
- The header shows Login or Logout according to local token presence.
- Campaign images use empty alternative text because the adjacent title and description already provide the campaign meaning. Unknown campaigns without an image still use the local CauseConnect placeholder.
- The seeded presentation fallback is limited to the Stage 2 demo data and can be removed once the API returns image and type values for every campaign.

Image provenance is recorded in [the Stage 2 evidence folder](../docs/evidence/stage-2/campaign-image-provenance.md).
