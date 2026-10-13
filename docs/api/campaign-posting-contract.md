# Campaign submission API

Category lookup and campaign submission are implemented for signed-in `public` users (cause campaigns) and `business_owner` users (business campaigns). Optional uploaded-image attachment is merged through PR #19 and deployed at [CauseConnect on AWS](https://52.62.2.87). See the [release evidence](../evidence/stage-3/additional-apis/README.md#aws-release--14-october-2026) for verification scope and remaining gaps.

**Business owners:** the server links the campaign to the owner's own `businesses` row, returning `type: "business"` and that `businessId`. An owner without a business profile receives `409 BUSINESS_PROFILE_REQUIRED` and no row is created. The client still cannot send `businessId`, `createdBy`, `type` or `status`. Admins cannot use this route (`403`). Optional `imageId` must belong to the authenticated user, be unexpired and not already attached.

**Owner reads:** `GET /api/campaigns/mine` and `GET /api/campaigns/mine/:id` return only the signed-in creator's campaigns in every status, using the [campaign read contract](campaign-read-contract.md) object including `updatedAt` and the latest `review` feedback.

The frontend uses `/campaigns/new` for public submission and `/business/campaigns/new` for business submission. The latter still needs Kim's GET/PUT `/api/business/me` to complete the profile step for a new owner; supporting an existing Business row is not the whole new-business journey.

Related rules are in the [business posting and image extension](campaign-posting-future-proposal.md), [business profile contract](business-profile-contract.md), [campaign read contract](campaign-read-contract.md) and [admin contract](admin-campaign-moderation-contract.md). The [API integration guide](../handoff/stage3-api-handoff.md) separates implemented work from remaining integration and deployment checks.

## Category choices

`GET /api/campaigns/categories` — public, no token required

`200` response:

```json
{
  "categories": [
    { "id": 4, "name": "Education" },
    { "id": 1, "name": "Environment" }
  ]
}
```

Values come from the `categories` table, ordered by name and then ID. Send a returned numeric `id` as `categoryId`; do not send the category name. An empty database returns an empty `categories` array, so reference categories must exist before a user can submit.

## Submit a public-user campaign

`POST /api/campaigns`

Required headers:

```http
Authorization: Bearer <token returned by login>
Content-Type: application/json
```

The session must be active and match the signed-in account. The account must currently be active with role `public` or `business_owner`; an old role/status in a token alone does not grant access. Guests and admins cannot use this creation route. Business owners must have their own Business row.

Request:

```json
{
  "title": "Community Garden Day",
  "description": "Help prepare a shared neighbourhood garden.",
  "categoryId": 1,
  "targetAudience": "Local residents",
  "startDate": "2026-10-10",
  "endDate": "2026-10-11"
}
```

| Field | Rule |
|---|---|
| `title` | String, trimmed, 1–150 characters |
| `description` | String, trimmed, 1–5,000 characters |
| `categoryId` | JSON integer from 1 to 2,147,483,647 for an existing category; strings, booleans and arrays are invalid |
| `targetAudience` | Optional string of at most 255 characters after trimming; omitted, `null` or blank becomes `null` |
| `startDate` | Real date in `YYYY-MM-DD` format, with a year from 1000 through 9999 |
| `endDate` | Same date rules; on or after `startDate` |
| `imageId` | Optional non-empty opaque reference from a successful image upload; checked server-side before attachment |

All fields except `targetAudience` and `imageId` are required. Every additional field is rejected, including `imageUrl`, `createdBy`, `businessId`, `type`, `status` and `role`.

The server selects the signed-in creator, sets `businessId` to `null` for a public user or to the business owner's own profile, and stores `status: "pending"`. It does not create a review. When `imageId` is supplied, the existing upload is attached in the campaign transaction; validation/transaction failure does not consume the reference.

`201` response example:

```json
{
  "campaign": {
    "id": 9,
    "title": "Community Garden Day",
    "description": "Help prepare a shared neighbourhood garden.",
    "categoryId": 1,
    "category": "Environment",
    "type": "cause",
    "imageUrl": null,
    "targetAudience": "Local residents",
    "startDate": "2026-10-10",
    "endDate": "2026-10-11",
    "createdBy": 3,
    "businessId": null,
    "status": "pending",
    "createdAt": "2026-10-01T04:10:00.000Z"
  }
}
```

The ID and timestamp are generated when the database saves the row. Use the returned ID and status for the confirmation. Do not require the sample ID or date above.

## Errors for these new routes

```json
{
  "status": 422,
  "code": "VALIDATION_FAILED",
  "message": "Campaign data is invalid",
  "fieldErrors": {
    "title": "Title is required"
  }
}
```

`fieldErrors` is an object for invalid fields or `null` when no field applies. Error wording can vary; use the status/code and relevant field to decide what to display.

| Status | Meaning |
|---|---|
| `401` | Missing, invalid or expired token; missing/logged-out/nonmatching session |
| `403` | Inactive account or current role is neither `public` nor `business_owner` |
| `409` | Business owner has no profile (`BUSINESS_PROFILE_REQUIRED`) |
| `413` | JSON body exceeds the request-size limit |
| `422` | Invalid body/types/dates, unknown category or unsupported fields |
| `500` | Unexpected failure; response must not expose database details |

These new-route responses do not imply that every older authentication/read route already uses the same envelope. See [current authentication](current-authentication.md) and [shared conventions](shared-conventions.md).

## Request fields and database columns

| API input or server value | `campaigns` column |
|---|---|
| `title` | `title` |
| `description` | `description` |
| `categoryId` | `category_id` |
| `targetAudience` | `target_audience` |
| `startDate` | `start_date` |
| `endDate` | `end_date` |
| Authenticated user's ID | `created_by` |
| Server selects own business for a business owner, otherwise `null` | `business_id` |
| Server sets `pending` | `status` |

The existing model and migrations already have these campaign columns. Image metadata is added by `20261013221000-create-campaign-images.js`; see the [image contract](campaign-posting-future-proposal.md). Use repository migrations to prepare the database, not manual table creation.

## Visibility after saving

The response confirms a database save, but a pending campaign is not public:

- `GET /api/campaigns` must not include it.
- `GET /api/campaigns/:id` returns `404` for that pending ID.
- Existing authenticated admin reads can inspect it.

Do not change its status manually to make the public page look successful. The implemented `/my-campaigns` reads show only the current creator's submissions and their review feedback; admin approval is the publication step.

## Integration checks

- Categories come from the database.
- An active public user creates a row with their own `created_by`, no business and pending status.
- Guests, expired/logged-out sessions, inactive users and wrong current roles cannot create a row.
- Wrong JSON types, invalid dates, nonexistent categories and extra fields cannot create a row.
- The new pending row stays out of public list/detail responses.
- Validation and server/network errors remain visible in the form; they do not show a successful save.

The backend integration suite checks these rules against a separate MySQL test database. Test requirements are in the [backend README](../../backend/README.md#tests).
