# Business profile API

**Status:** Frontend implemented; these backend routes remain proposed. Registration currently creates a `users` row with role `business_owner`, but does not create a `businesses` row.

`/business/profile` uses the two endpoints below. Both require an active session, an active current user and role `business_owner`. Resolve the user from the authenticated session. A client-supplied user/business/owner ID is not accepted.

## Get my profile

`GET /api/business/me` with `Authorization: Bearer <token>`.

Return `200 {"business": null}` when this authenticated owner has not created a profile. A missing profile is not `404`.

Otherwise return `200`:

```json
{
  "business": {
    "id": 3,
    "businessName": "Neighbourhood Repairs",
    "abn": null,
    "website": "https://example.com",
    "description": "We repair and reuse household items."
  }
}
```

## Save my profile

`PUT /api/business/me` with Bearer authentication and JSON. This creates the first profile or updates the existing one for this owner. Return `200` with the same complete `business` object in both cases.

```json
{
  "businessName": "Neighbourhood Repairs",
  "abn": "",
  "website": "https://example.com",
  "description": "We repair and reuse household items."
}
```

| Field | Validation and storage |
|---|---|
| `businessName` | Required string; trim; 1–150 characters |
| `abn` | Optional string, at most 20 characters; empty/omitted/null becomes SQL `NULL` |
| `website` | Optional string, at most 255 characters; full HTTP or HTTPS URL, host required, no embedded username/password; empty/omitted/null becomes `NULL` |
| `description` | Optional string, at most 2,000 characters; empty/omitted/null becomes `NULL` |

The frontend sends all four keys and uses empty strings to clear optional fields. Reject extra keys and non-string types except the documented optional `null`. This stores ABN text; it does not claim external business/ABN verification.

`401`: missing/expired/invalid session. `403`: wrong role or suspended account. `422 VALIDATION_FAILED`: field errors keyed by `businessName`, `abn`, `website` or `description`. Apply the [shared error envelope](shared-conventions.md). Do not expose another owner's profile when an ID is supplied.

## Existing table mapping

| API/server value | Sequelize attribute | Database column |
|---|---|---|
| Response `id` | `Business.businessId` | `businesses.business_id` |
| Authenticated user ID | `Business.ownerId` | `businesses.owner_id` (unique FK to `users.user_id`) |
| `businessName` | `Business.businessName` | `businesses.business_name VARCHAR(150)` |
| `abn` | `Business.abn` | `businesses.abn VARCHAR(20)` |
| `website` | `Business.website` | `businesses.website VARCHAR(255)` |
| `description` | `Business.description` | `businesses.description TEXT` |

The table and unique owner constraint already exist in `20260830103020-create-businesses.js`. Do not add a duplicate table. Use the unique owner constraint for safe concurrent first saves; resolve competing creation requests to the same owner's one row. Never upsert by a browser-provided business ID.

Test a newly registered business owner with no profile, first save, later edit, optional-field clearing, concurrent first saves, role/suspension changes, session expiry and attempts to access another owner's profile. Then test [business campaign posting](campaign-posting-future-proposal.md) with that saved profile.
