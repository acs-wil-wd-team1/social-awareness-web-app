# CauseConnect API reference and proposals

This index separates implemented backend routes from the Stage 3 contracts already consumed by the frontend. Branch implementation does not mean the changes have been merged into `main`. Start with the [Kim/Raj implementation handoff](../handoff/stage3-api-handoff.md).

| Document | Status and purpose |
|---|---|
| [Current authentication](current-authentication.md) | Implemented registration, login and logout requests and responses |
| [Shared conventions](shared-conventions.md) | Proposed Stage 3 identifiers, permissions and error handling |
| [Campaign submission](campaign-posting-contract.md) | Category lookup and real text-only public-user submission in this branch |
| [Business posting and images](campaign-posting-future-proposal.md) | Frontend implemented; backend upload/business creation extension pending |
| [Business profile](business-profile-contract.md) | Frontend implemented; proposed profile getter/upsert on existing Business table |
| [Campaign reads and owner submissions](campaign-read-contract.md) | Existing read compatibility, proposed owner route and expanded campaign/review fields |
| [Admin moderation](admin-campaign-moderation-contract.md) | Admin frontend implemented; existing admin reads and proposed transactional approval/rejection |
| [Owner campaign management](owned-campaign-management-contract.md) | Frontend implemented; proposed owner detail/edit/resubmit/soft-delete with version checks |
| [Participation and business enquiries](engagement-contract.md) | Frontend implemented; proposed participation, enquiry submission and owner inbox APIs |
| [Admin management](admin-management-contract.md) | Frontend implemented; proposed account status, review history, unpublish and soft-delete APIs |
| [Postman requests](postman/README.md) | Importable requests and response assertions; use only with an isolated local test database |

The [real-backend regression runner](../../infra/real-backend-testing.md) checks existing frontend pages/services against Express and disposable MySQL. It does not certify endpoints that have not been implemented.

## Existing routes on the reviewed main baseline (`0146365c`)

| Method | Endpoint | Access | Successful response |
|---|---|---|---|
| `POST` | `/api/auth/register` | Guest | `201` with message and user |
| `POST` | `/api/auth/login` | Guest | `200` with user and token |
| `PUT` | `/api/auth/logout` | Authenticated user | `204`, no body |
| `GET` | `/api/campaigns` | Public; approved only | `200` with `campaigns`, `page`, `pageSize` |
| `GET` | `/api/campaigns/:id` | Public; approved only | `200` with the campaign object |
| `GET` | `/api/campaigns/admin` | Admin | `200` with `campaigns`, `page`, `pageSize` |
| `GET` | `/api/campaigns/admin/:id` | Admin | `200` with the campaign object |

## Added in this branch

| Method | Endpoint | Access | Successful response |
|---|---|---|---|
| `GET` | `/api/campaigns/categories` | Public | `200` with `categories: [{ id, name }]` |
| `POST` | `/api/campaigns` | Active authenticated account with current `public` role | `201` with a saved pending `campaign` |

The frontend `/campaigns/new` uses both routes. Text-only public requests can save through this branch's API and database. The optional image field requires the proposed upload/attachment extension.

## Backend work needed for the completed Stage 3 frontend

| Method | Endpoint | Required backend work |
|---|---|---|
| `GET`, `PUT` | `/api/business/me` | Current owner's Business row or `null`; safe create/update |
| `POST` | `/api/campaign-images` | Private image upload, ownership, expiry and opaque reference |
| `POST` | `/api/campaigns` | Extend existing route for optional `imageId` and current `business_owner` |
| `GET` | `/api/campaigns/mine` | Own submissions, pagination, status and latest review feedback |
| `GET`, `PATCH`, `DELETE` | `/api/campaigns/mine/:id` | Owner-only detail/edit/resubmit/soft-delete with `expectedUpdatedAt` on writes |
| `GET` | Existing public/admin campaign routes | Add type/category ID, business, date/audience and appropriate image delivery fields |
| `PATCH` | `/api/campaigns/admin/:id/status` | Transactional pending → approved/rejected, expected-version check and matching review record |
| `GET`, `PUT` | `/api/campaigns/:id/participation` | Current user's join/withdraw/rejoin state for approved cause campaigns |
| `GET` | `/api/participations/mine` | Current user's participation history |
| `POST` | `/api/campaigns/:id/enquiries` | Contact enquiry for an approved business campaign |
| `GET` | `/api/business/me/enquiries` | Private inbox scoped to the signed-in business owner |
| `GET` | `/api/admin/users` | Admin-only safe account list/search/filter |
| `PATCH` | `/api/admin/users/:id/status` | Suspend/reactivate non-admin accounts; revoke suspended users' sessions |
| `GET` | `/api/campaigns/admin/:id/reviews` | Paginated approval/rejection history |
| `PATCH` | `/api/campaigns/admin/:id/publication` | Approved → pending, with expected-version check, required reason and audit record |
| `DELETE` | `/api/campaigns/admin/:id` | Recoverable soft deletion, with expected-version check, required reason and audit record |

These endpoint implementations remain pending in the checked-out backend. The frontend pages and sample preview exercise their intended contract. Account role changes/admin promotion, account deletion and a full CRM are not included.

Public campaign list/detail and My campaigns use their read endpoints for visible/online polling every 30 seconds, plus refresh on focus/reconnection. No WebSocket or separate push API is required by this implementation. Reads must reflect current status/ownership, exclude soft-deleted campaigns and avoid caching private responses publicly.

## Frontend preview

`VITE_DEMO_MODE=true` runs the full frontend journey with explicitly labelled sample accounts and browser data. It does not call a deployed backend or prove database, storage, authentication or permission enforcement. With demo mode disabled, the same pages call the API contracts above. The old `/draft/campaigns/new` development prototype is only a separate historical form preview.

Keep existing callers compatible while reviewing the proposals. Update each accepted contract with its implementation and tests; document any schema changes through migrations.
