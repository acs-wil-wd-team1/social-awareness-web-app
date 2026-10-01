# CauseConnect Frontend

React frontend for CauseConnect. It includes campaign browsing and posting, business profiles, owner edits, participation, business enquiries, admin campaign/account management and registration/login/logout.

The layout follows the CauseConnect storyboard and web design standards. The Stage 3 frontend calls the [API contracts](../docs/api/api-contract.md). Authentication, categories, text-only public submission and the frontend/API contracts are merged into `main` at `4e24bae`; the remaining endpoint extensions still need backend work. The [API integration guide](../docs/handoff/stage3-api-handoff.md) lists the connections and [feature coverage](../docs/handoff/stage3-feature-coverage.md) records remaining integration work.

## Run locally

```sh
npm ci
npm run dev
```

The development server forwards `/api` requests to `http://127.0.0.1:3000`. Live mode needs the backend and database. Use the explicitly labelled sample mode below to review the frontend before the remaining endpoints are ready.

Use Node.js 22.12 or newer. Backend configuration is in the [backend README](../backend/README.md).

## Live API and sample preview

Copy `.env.example` to your local `.env.local` if you need to change the defaults:

```dotenv
VITE_DEMO_MODE=false
VITE_API_BASE_URL=/api
```

- `VITE_DEMO_MODE=false` (the default): requests use the actual API. Errors from unavailable endpoints are displayed; the app does not silently substitute sample success.
- `VITE_DEMO_MODE=true`: an on-page preview banner provides sample public-user, business-owner and admin roles, plus a sample-data reset. Campaign/profile/review interactions stay in browser storage. Real registration and login are not connected in this mode.
- `VITE_API_BASE_URL=/api`: same-origin API, including Vite's local proxy. For a different backend domain, use its full HTTPS prefix, such as `https://api.example.com/api`. The prefix must include `/api`. Remote HTTP, credentials, query strings and fragments are not accepted. HTTP is allowed for localhost development.

Restart the development server after changing these values. They are compiled into the production bundle, so changing a deployed server's environment alone does not change an existing build: rebuild and deploy it. These variables are public browser configuration. Never put AWS credentials, database passwords or JWT signing secrets in them.

Sample mode is useful for reviewing the interface; real permissions, uploads, sessions and database writes still need API integration tests. Use `VITE_DEMO_MODE=false` for those tests.

## Verify

```sh
npm test
npm run build
```

For the existing API/database flows, use `npm run test:real-backend`. It runs the actual frontend components/services against Express and a fresh disposable MySQL container, then removes its test container. It requires a running Docker engine, a locally cached `mysql:8` image and installed backend dependencies. Read the [runner instructions and limits](../infra/real-backend-testing.md) first. These checks use jsdom, so real-browser navigation, CORS and the missing Stage 3 APIs still need separate testing.

## Routes

| Path | Page | API behaviour |
|---|---|---|
| `/` | Campaign homepage | Loads approved campaigns from `GET /api/campaigns` |
| `/campaigns/:campaignId` | Public campaign details | Loads the selected campaign from `GET /api/campaigns/:id` |
| `/login` | Login | Calls `POST /api/auth/login`, stores the returned token and resumes a validated local `returnTo` destination |
| `/register` | Registration | Calls `POST /api/auth/register` for a public or business-owner account; preserves `returnTo` in the login links |
| `/logout` | Logout | Clears the browser session immediately, calls `PUT /api/auth/logout` and offers retry if server revocation is unconfirmed |
| `/campaigns/new` | Public-user campaign posting | GET categories; optional POST `/api/campaign-images`; POST `/api/campaigns` |
| `/business/profile` | Business profile | GET/PUT `/api/business/me` |
| `/business/campaigns/new` | Business campaign posting | GET profile/categories; optional image upload; POST campaign |
| `/my-campaigns` | Own submissions and review feedback | GET `/api/campaigns/mine`, with pagination and status filter |
| `/my-campaigns/:id/edit` | Edit/resubmit or soft-delete an owned campaign | GET/PATCH/DELETE `/api/campaigns/mine/:id`; optional image upload |
| `/my-participation` | Own participation history and withdrawal, including unavailable campaigns | GET `/api/participations/mine`; GET/PUT `/api/campaigns/:id/participation` for existing own records |
| `/business/enquiries` | Private enquiry inbox | GET `/api/business/me/enquiries` |
| `/admin/campaigns` | Admin review queue | GET `/api/campaigns/admin`, with pagination, search and status filter |
| `/admin/campaigns/:id` | Review, history and content management | GET detail/reviews; PATCH status/publication; DELETE for soft deletion |
| `/admin/users` | Account suspension/reactivation | GET `/api/admin/users`; PATCH `/api/admin/users/:id/status` |
| `/draft/campaigns/new` | Development-only form sample | Uses sample data; makes no API requests and saves nothing |

Both posting forms send title, description, category ID, dates and optional target audience. An optional JPG/PNG/WebP photo can be selected, previewed and removed; files must be non-empty and at most 5 MB. The app uploads a photo first and sends the returned `imageId` only after that request succeeds. An ordinary validation retry reuses an unexpired upload reference. See the [image/backend contract](../docs/api/campaign-posting-future-proposal.md).

The campaign form only confirms a saved pending campaign after a valid `201` response. My campaigns shows pending, approved and rejected submissions and any review feedback. Public links are available only for approved campaigns. Business posting requires the signed-in owner's business profile. Admin rejection requires a reason; a conflicting review prompts a reload.

Campaign owners can edit/resubmit their own campaigns, replace/remove the photo or confirm soft deletion. Saving edited content returns it to pending review; changes use the saved `updatedAt` value to detect stale edits. Admins can inspect previous decisions, return approved content to pending or soft-delete it with a reason. Admin account controls cannot change the current admin or any other admin account.

Approved social-cause details offer join/withdraw/rejoin to signed-in public users and business owners. My participation also allows withdrawal of an existing own record after its campaign becomes unavailable. The API must retain that record, return `campaign:null` for non-public or soft-deleted campaign content, and reject new joins/rejoins until the campaign is approved and available. Approved business details show a valid HTTP(S) business website when supplied and offer a contact enquiry form; messages appear only in the owning business's inbox. Payments, chat and CRM features are outside this scope.

The homepage, public details and My campaigns refresh from their read endpoints every 30 seconds while the page is visible and online, and on window focus/reconnection. They also provide manual refresh. This is polling, not a WebSocket service. A failed background refresh is shown without silently presenting stale data as current; unavailable public details are cleared. Other management/history lists provide explicit refresh or reload after changes.

The shared session state restores role-aware navigation after refresh and updates on login/logout/session expiry. Roles are `public`, `business_owner` and `admin`. Client checks control the interface; the API must independently enforce current role, active session, ownership and account status.

Campaign image and type values come from API responses. The live UI does not infer them from a campaign title. Missing photos use the neutral local placeholder; missing type values are not invented. Sample photographs belong to explicit sample mode. Their provenance is recorded in [the Stage 2 evidence folder](../docs/evidence/stage-2/campaign-image-provenance.md).

## Current design decisions

- The shared colours, typography and responsive layout follow the current Stage 2 web design standards.
- Primary navigation contains **Home**, **Campaigns**, and **Create campaign** for authors or **Review campaigns** for admins. Guests see **Login** and **Register**.
- The **Account** dropdown groups My campaigns, My participation, Business profile, Enquiries, Manage users and Logout according to the current role.
- **Campaigns** moves to the homepage list. The hero offers **Explore campaigns** and an account-appropriate signup, posting or review action. Campaign cards keep equal widths within the responsive grid.
- Each `View campaign` link opens the matching public campaign details route. Admin search and owner/admin status filters are available on their respective pages.
- Login and registration preserve a validated local destination, including its query string and fragment. External and malformed return destinations fall back to the homepage.
- Campaign images use empty alternative text because the adjacent title and description already provide the campaign meaning. Unknown campaigns without an image still use the local CauseConnect placeholder.

## Team logo and deployment

The original team logo PNG is included at `public/images/brand/causeconnect-logo.png` and used by the shared header.

The [AWS sample preview](https://d10e86f5qx46up.cloudfront.net) is hosted using private S3 and CloudFront. **Preview as** switches roles; changes are disposable and stay in the browser tab. Local interface refinements require a separate deployment before they appear there. A live integrated release still needs the real backend/database/image storage, API origin, CORS, HTTPS and full browser integration checks. Deployment instructions are in [infra](../infra/README.md). AWS free-tier eligibility or credits do not guarantee zero charges; review the approved resource plan and actual usage.

Notes for the developers manual and demonstration are in [the frontend handoff](../docs/handoff/stage3-frontend-notes.md).
