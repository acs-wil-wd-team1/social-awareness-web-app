# Shared API conventions

**Status, 14 October 2026:** Conventions used by the campaign, management, engagement and image routes in deployed application commit `e612d1b448a31cd6639f161740c31a9e22f63ed6` at [CauseConnect on AWS](https://52.62.2.87). The business-profile contract is still unimplemented. See the [current release evidence](../evidence/stage-3/review-hardening/README.md) for the exact revision and bounded verification.

Submission rules are in the [campaign contract](campaign-posting-contract.md). The [Stage 3 API integration guide](../handoff/stage3-api-handoff.md) maps implemented routes and remaining work. Oversized JSON uses `413 REQUEST_TOO_LARGE`; image errors are documented separately.

## Requests and permissions

- Base path: `/api`.
- Use JSON unless an endpoint specifies multipart upload or an empty response.
- Protected routes require `Authorization: Bearer <token>` and an active session.
- User, business, campaign and category IDs are positive JSON integers. Do not coerce booleans, arrays or objects into IDs.
- Upload `imageId` values are opaque strings issued by the server, not database IDs chosen by the browser.
- Date-only values use `YYYY-MM-DD`; timestamps use ISO 8601 UTC.
- Roles are `public`, `business_owner` and `admin`. Check the user's current permissions for protected actions, including suspension and changed roles.

`currentAccountAuthentication.js` checks JWT validity, a session matching token and user ID, and the current account role/status. Campaign authors allow `public` and `business_owner`; admin routes allow `admin`. State-changing services recheck account and session under transaction locks before locking the campaign/upload/participation. New private management/engagement reads also use transactional rechecks. Do not rely on browser roles or stale JWT claims.

The server determines the creator and business ownership. Ordinary campaign submissions cannot set `createdBy`, `businessId`, `status`, `role` or administrator privilege. The admin moderation endpoint is the explicit exception for `status`: an authorised admin may request an allowed transition, which the server validates.

Check JSON types before trimming or converting values. Reject unsupported request fields. Each endpoint defines required fields, nullable fields and limits.

## Error response

Stage 3 API errors use:

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

`fieldErrors` is `null` or an object keyed by the request field. Messages must not include SQL, credentials, tokens or internal stack traces.

| Status | Code | Meaning |
|---:|---|---|
| `400` | `INVALID_CAMPAIGN_ID` / `INVALID_USER_ID` | Invalid path ID |
| `401` | `AUTH_REQUIRED` / `INVALID_TOKEN` | Missing, expired or invalid authentication |
| `403` | `FORBIDDEN` / `ACCOUNT_SUSPENDED` | Current account cannot perform the action |
| `404` | `CAMPAIGN_NOT_FOUND` / `IMAGE_NOT_FOUND` / `NOT_FOUND` | No visible campaign/image or API route matches |
| `409` | Endpoint-specific code | The request conflicts with current state |
| `413` | `IMAGE_TOO_LARGE` | Uploaded file exceeds the documented limit |
| `413` | `REQUEST_TOO_LARGE` | JSON body exceeds the configured limit |
| `415` | `UNSUPPORTED_IMAGE_TYPE` | Uploaded file is not a supported image |
| `422` | `VALIDATION_FAILED` | Invalid fields, malformed JSON or unusable image reference |
| `429` | `IMAGE_OWNER_QUOTA_REACHED` | Retained owner photo count/bytes reached; cleanup must actually remove old files/rows to free space |
| `429` | `IMAGE_UPLOAD_LIMIT` | Earlier release's active-unattached cap; retained for older response compatibility |
| `500` | `INTERNAL_SERVER_ERROR` | Unexpected server failure |
| `503` | `SERVICE_UNAVAILABLE` / `IMAGE_STORAGE_FULL` / `UPLOAD_BUSY` | API/storage dependency temporarily unavailable |

API parser and unknown-route errors are normalised to JSON. The legacy logout middleware still has its older error shape; see [current authentication](current-authentication.md). Use status/code where supplied rather than matching error prose.

The current image decoder distinguishes `422 IMAGE_DIMENSIONS_TOO_LARGE`,
`IMAGE_DECODE_FAILED`, `IMAGE_TYPE_MISMATCH` and `ANIMATED_IMAGE_NOT_SUPPORTED` so
the user can resize or export a still supported photo. These changes are included
in the current deployed source. The dated release receipt separately records
which checks were actually executed; the earlier PR #19 receipt stays historical.

The frontend also handles network failure or cancellation when no API response exists. It must not treat an unreadable response or failed request as a successful save.

## Visibility

Public campaign reads return approved, non-deleted campaigns only. Pending/rejected/deleted detail returns `404`. Owner/admin routes return only records their current authenticated user is allowed to see.

Pending or rejected campaign images must also remain restricted to their owner and authorised reviewers. Hiding a campaign page alone does not protect a publicly accessible image URL.

## Response rules used by the frontend

- Exact success codes matter: category/profile/list/detail reads `200`, profile PUT `200`, campaign/image POST `201`, admin PATCH `200`, logout PUT `204` with no body.
- List envelopes use `campaigns`, `page`, `pageSize` and `total`; details return one object directly. Creation returns `{ "campaign": ... }`. See the [read contract](campaign-read-contract.md).
- Do not return HTML for unknown API paths. Return a JSON error before any frontend SPA fallback.
- Return only strings as error messages/field-error values. The frontend preserves input and focuses known invalid fields on `422`.
- Frontend role checks are navigation aids; every protected read/write must verify the token, matching active session and current database user role/status.
- For hosted builds, the frontend uses `VITE_API_BASE_URL` for the API origin. Enable the actual frontend HTTPS origin in CORS and handle Bearer-header preflights. Do not hardcode localhost for cloud traffic. Return image URLs usable by the browser at its frontend origin (absolute HTTPS or an explicitly routed same-origin path).

The frontend sample mode (`VITE_DEMO_MODE=true`) uses synthetic accounts and browser sample data. Its token values and responses must never be accepted as real authentication or evidence that the backend features are implemented.
