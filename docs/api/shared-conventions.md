# Shared API conventions

**Status:** Proposed for Stage 3. These rules are not a claim that every current route already implements them.

The implemented public-user submission backend has its request and error rules in the [campaign contract](campaign-posting-contract.md). The [Stage 3 API integration guide](../handoff/stage3-api-handoff.md) maps the remaining extensions. Oversized JSON uses `413 REQUEST_TOO_LARGE`; upload codes and the other new endpoints remain backend proposals.

## Requests and permissions

- Base path: `/api`.
- Use JSON unless an endpoint specifies multipart upload or an empty response.
- Protected routes require `Authorization: Bearer <token>` and an active session.
- User, business, campaign and category IDs are positive JSON integers. Do not coerce booleans, arrays or objects into IDs.
- Upload `imageId` values are opaque strings issued by the server, not database IDs chosen by the browser.
- Date-only values use `YYYY-MM-DD`; timestamps use ISO 8601 UTC.
- Roles are `public`, `business_owner` and `admin`. Check the user's current permissions for protected actions, including suspension and changed roles.

The current `campaignAuthorAuthentication.js` already looks up a session matching both token and user ID and loads the current account; its role allowance is still public-only. Older `authentication.js` / `adminAuthentication.js` do not yet perform all those current-account checks. Reuse or consolidate the stronger pattern for each protected Stage 3 route, including existing admin reads. Merely adding `requireAdmin` after the older middleware does not implement suspension/current-role enforcement.

The server determines the creator and business ownership. Ordinary campaign submissions cannot set `createdBy`, `businessId`, `status`, `role` or administrator privilege. The admin moderation endpoint is the explicit exception for `status`: an authorised admin may request an allowed transition, which the server validates.

Check JSON types before trimming or converting values. Reject unsupported request fields. Each endpoint defines required fields, nullable fields and limits.

## Proposed error response

Stage 3 API errors should use:

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
| `400` | `INVALID_JSON` / `INVALID_CAMPAIGN_ID` | Malformed JSON or an invalid path ID |
| `401` | `AUTH_REQUIRED` / `INVALID_TOKEN` | Missing, expired or invalid authentication |
| `403` | `FORBIDDEN` / `ACCOUNT_SUSPENDED` | Current account cannot perform the action |
| `404` | `CAMPAIGN_NOT_FOUND` / `ROUTE_NOT_FOUND` | No visible campaign or API route matches |
| `409` | Endpoint-specific code | The request conflicts with current state |
| `413` | `IMAGE_TOO_LARGE` | Uploaded file exceeds the documented limit |
| `413` | `REQUEST_TOO_LARGE` | JSON body exceeds the configured limit |
| `415` | `UNSUPPORTED_IMAGE_TYPE` | Uploaded file is not a supported image |
| `422` | `VALIDATION_FAILED` | Invalid fields or unusable image reference |
| `500` | `INTERNAL_SERVER_ERROR` | Unexpected server failure |
| `503` | `SERVICE_UNAVAILABLE` | API/storage dependency temporarily unavailable |

Current controllers use this envelope for many errors, but main's authentication middleware and Express parser/unknown-route errors do not consistently follow it. Common error handling must be implemented and tested before relying on it everywhere. See [current authentication](current-authentication.md) for the existing responses.

The frontend also handles network failure or cancellation when no API response exists. It must not treat an unreadable response or failed request as a successful save.

## Visibility

Public campaign reads return approved campaigns only. A public request for a pending or rejected campaign returns `404`. Proposed owner/admin routes may return records their authenticated user is allowed to see.

Pending or rejected campaign images must also remain restricted to their owner and authorised reviewers. Hiding a campaign page alone does not protect a publicly accessible image URL.

## Response rules used by the frontend

- Exact success codes matter: category/profile/list/detail reads `200`, profile PUT `200`, campaign/image POST `201`, admin PATCH `200`, logout PUT `204` with no body.
- List envelopes use `campaigns`, `page`, `pageSize` and proposed `total`; details return one object directly. Creation returns `{ "campaign": ... }`. See the [read contract](campaign-read-contract.md).
- Do not return HTML for unknown API paths. Return a JSON error before any frontend SPA fallback.
- Return only strings as error messages/field-error values. The frontend preserves input and focuses known invalid fields on `422`.
- Frontend role checks are navigation aids; every protected read/write must verify the token, matching active session and current database user role/status.
- For hosted builds, the frontend uses `VITE_API_BASE_URL` for the API origin. Enable the actual frontend HTTPS origin in CORS and handle Bearer-header preflights. Do not hardcode localhost for cloud traffic. Return image URLs usable by the browser at its frontend origin (absolute HTTPS or an explicitly routed same-origin path).

The frontend sample mode (`VITE_DEMO_MODE=true`) uses synthetic accounts and browser sample data. Its token values and responses must never be accepted as real authentication or evidence that the backend features are implemented.
