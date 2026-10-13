# CauseConnect API contracts

This index describes the code in `feature/stage3-additional-apis` on 13 October 2026. The branch starts from `main` at `ec11766`, which already includes public/business campaign submission, owner/admin reads and core approval. The AWT-175 additions below are implemented in this branch; merge, deployment and cloud verification are separate steps. The [Stage 3 API integration guide](../handoff/stage3-api-handoff.md) maps the remaining work.

| Document | Status and purpose |
|---|---|
| [Current authentication](current-authentication.md) | Implemented registration, login and logout requests and responses |
| [Shared conventions](shared-conventions.md) | Identifiers, current-account permissions and error handling |
| [Campaign submission](campaign-posting-contract.md) | Public submission and business submission linked to an existing owner profile; optional image attachment added in this branch |
| [Business posting and images](campaign-posting-future-proposal.md) | Private filesystem upload, expiring references and controlled delivery implemented in this branch |
| [Business profile](business-profile-contract.md) | GET/PUT still missing; Kim's AWT-141/AWT-173 work |
| [Campaign reads and owner submissions](campaign-read-contract.md) | Expanded public/owner/admin reads; image delivery and deleted-record filtering added in this branch |
| [Admin moderation](admin-campaign-moderation-contract.md) | Transactional approval/rejection and expected-version checks |
| [Owner campaign management](owned-campaign-management-contract.md) | Edit/resubmit/soft-delete implemented in this branch |
| [Participation and business enquiries](engagement-contract.md) | Participation, enquiry submission and private owner inbox implemented in this branch |
| [Admin management](admin-management-contract.md) | Account status, review history, unpublish and soft-delete implemented in this branch |
| [Postman requests](postman/README.md) | Importable requests and response assertions; use only with an isolated local test database |

The [real-backend regression runner](../../infra/real-backend-testing.md) checks existing frontend pages/services against Express and disposable MySQL. It does not certify endpoints that have not been implemented.

## Existing routes carried forward

| Method | Endpoint | Access | Successful response |
|---|---|---|---|
| `POST` | `/api/auth/register` | Guest | `201` with message and user |
| `POST` | `/api/auth/login` | Guest | `200` with user and token |
| `PUT` | `/api/auth/logout` | Authenticated user | `204`, no body |
| `GET` | `/api/campaigns` | Public; approved only | `200` with `campaigns`, `page`, `pageSize`, `total` |
| `GET` | `/api/campaigns/:id` | Public; approved only | `200` with the campaign object |
| `GET` | `/api/campaigns/admin` | Admin | `200` with `campaigns`, `page`, `pageSize`, `total` |
| `GET` | `/api/campaigns/admin/:id` | Admin | `200` with the campaign object |
| `GET` | `/api/campaigns/categories` | Public | `200` with `categories: [{ id, name }]` |
| `POST` | `/api/campaigns` | Active `public`, or `business_owner` with their own existing profile | `201` with a saved pending `campaign` |

The frontend `/campaigns/new` uses category lookup and campaign POST. This branch accepts an optional server-issued `imageId`. Business POST works with an existing profile, but the new-business browser journey remains blocked until GET/PUT `/api/business/me` is implemented.

## Stage 3 route reference

All rows below are implemented in this branch except GET/PUT `/api/business/me`. Existing owner reads and core approval were already in the base `main`; they are not new AWT-175 features.

| Method | Endpoint | Behaviour |
|---|---|---|
| `GET`, `PUT` | `/api/business/me` | **Not implemented:** current owner's Business row or `null`; safe create/update |
| `POST` | `/api/campaign-images` | Private image upload, ownership, expiry and opaque reference |
| `POST` | `/api/campaigns` | Extend existing route for optional `imageId` and current `business_owner` |
| `GET` | `/api/campaigns/mine` | Own submissions, pagination, status and latest review feedback |
| `GET`, `PATCH`, `DELETE` | `/api/campaigns/mine/:id` | Owner-only detail/edit/resubmit/soft-delete with `expectedUpdatedAt` on writes |
| `GET` | Existing public/admin campaign routes | Add type/category ID, business, date/audience and appropriate image delivery fields |
| `PATCH` | `/api/campaigns/admin/:id/status` | Transactional pending → approved/rejected, expected-version check and matching review record |
| `GET`, `PUT` | `/api/campaigns/:id/participation` | Current user's participation state; join/rejoin require an approved cause campaign; reads and withdrawal of an existing own record remain available after unpublishing or soft deletion |
| `GET` | `/api/participations/mine` | Current user's participation history; retain records with `campaign:null` when the campaign is no longer public |
| `POST` | `/api/campaigns/:id/enquiries` | Contact enquiry for an approved business campaign |
| `GET` | `/api/business/me/enquiries` | Private inbox scoped to the signed-in business owner |
| `GET` | `/api/admin/users` | Admin-only safe account list/search/filter |
| `PATCH` | `/api/admin/users/:id/status` | Suspend/reactivate non-admin accounts; revoke suspended users' sessions |
| `GET` | `/api/campaigns/admin/:id/reviews` | Paginated approval/rejection history |
| `PATCH` | `/api/campaigns/admin/:id/publication` | Approved → pending, with expected-version check, required reason and audit record |
| `DELETE` | `/api/campaigns/admin/:id` | Recoverable soft deletion, with expected-version check, required reason and audit record |

The isolated regression suite exercises implemented routes against Express/MySQL. Passing local checks does not mean this branch has been merged or deployed; record cloud/browser checks separately. Account role changes/admin promotion, account deletion and a full CRM are not included.

Public campaign list/detail and My campaigns use their read endpoints for visible/online polling every 30 seconds, plus refresh on focus/reconnection. No WebSocket or separate push API is required by this implementation. Campaign reads must reflect current status/ownership and exclude soft-deleted campaigns. Private participation history retains the user's records without exposing unavailable campaign content. Private responses must not be cached publicly.

## Frontend preview

`VITE_DEMO_MODE=true` runs the full frontend journey with explicitly labelled sample accounts and browser data. It does not call a deployed backend or prove database, storage, authentication or permission enforcement. With demo mode disabled, the same pages call the API contracts above. The old `/draft/campaigns/new` development prototype is only a separate historical form preview.

Keep existing callers compatible and apply the repository migrations before running the new routes. Historical evidence stays in its dated records; use the current PR/run results for this branch's verification status.
