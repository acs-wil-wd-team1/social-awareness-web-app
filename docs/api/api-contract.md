# API contract — frontend and backend

**Status:** Draft — not agreed

**Reviewers:** Developer/Programmer and Database Developer roles

This document records the expected communication between the frontend and backend. It must not be marked agreed until the relevant roles review the decisions below.

Base path: to be agreed

Request and response format: JSON unless a successful response has no body

Timestamps: ISO 8601 UTC

## Decisions to agree

| Decision | Status |
|---|---|
| Bearer token or HttpOnly cookie | Open — blocks final authentication persistence |
| Whether registration automatically logs the user in | Open |
| Identifier format: integer or UUID string | Open |
| `createdBy`: identifier or public summary object | Open |
| Session lifetime and logout invalidation | Open |
| API base path and versioning | Open |
| Allowed frontend origin and credential/CORS behaviour | Open |
| Campaign category values and field limits | Open |
| User response fields and role values | Open |

The authentication mechanism changes Redux state, browser persistence, request credentials, CSRF handling and logout behaviour. A mock implementation must follow the agreed decision rather than silently choosing the production security model.

## Error contracts

### `ApiErrorResponse`

The backend returns this shape for every non-success response:

```json
{
  "status": 401,
  "code": "INVALID_CREDENTIALS",
  "message": "Email or password is incorrect",
  "fieldErrors": null
}
```

`fieldErrors` is `null` or an object keyed by form field. Error responses use `Content-Type: application/json`.

### `AppError`

The frontend normalises API errors and failures for which no server response exists into its application error shape.

| Code | Status | Meaning |
|---|---:|---|
| `NETWORK_ERROR` | 0 | The request did not reach the server |
| `TIMEOUT` | 0 | The request exceeded the client timeout |
| `ABORTED` | 0 | The request was cancelled |
| `INVALID_RESPONSE` | 0 | The response could not be handled as agreed |

The backend implements `ApiErrorResponse`; the frontend owns `AppError` normalisation.

## Registration

`POST /api/auth/register`

Request:

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "example only",
  "accountType": "user"
}
```

Accepted fields are exactly `name`, `email`, `password` and `accountType`. `accountType` is `user` or `business`.

Any request containing `role`, `admin`, `isAdmin` or another privilege field is rejected with `422`. Administrator privilege is assigned only through an authorised server-side process.

Responses:

- `201` — account created; response shape depends on the auto-login and authentication decisions
- `409` — `EMAIL_EXISTS`, with an `email` field error
- `422` — `VALIDATION_FAILED`, with relevant field errors

## Login

`POST /api/auth/login`

Request:

```json
{
  "email": "jane@example.com",
  "password": "example only"
}
```

Responses:

- `200` — authenticated user and the agreed session representation
- `401` — `INVALID_CREDENTIALS`
- `422` — `VALIDATION_FAILED`

If the team retains `401`, HTTP semantics require a `WWW-Authenticate` challenge. A Bearer-token API would normally use `WWW-Authenticate: Bearer realm="api"`. If the team selects cookie sessions and does not use HTTP challenge semantics for login, it should agree on a different failure status and document that choice before implementation.

## Logout

`POST /api/auth/logout`

Authentication headers, cookies and CSRF requirements depend on the agreed authentication mechanism.

- `204` — session invalidated; no response body

## List campaigns

`GET /api/campaigns`

Query parameters:

- `page`, default `1`
- `pageSize`, default `20`, maximum `100`
- `search`, matched case-insensitively against title and description
- `category`, using the category values still to be agreed

Response:

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 0
}
```

Campaign fields:

```text
id, title, description, category, type, imageUrl,
createdBy, status, createdAt
```

Rules:

- `type` is `cause` or `business`.
- Guests receive approved campaigns only.
- Results are sorted by `createdAt` descending and then `id` descending.
- A page beyond the end returns `200` with an empty `items` array.
- Invalid recognised query values return `422`; unknown query parameters are ignored.

## Get one campaign

`GET /api/campaigns/:id`

- `200` — `{ "campaign": { ... } }`
- `404` — `NOT_FOUND`

An unauthenticated request for a pending or rejected campaign returns `404` so the endpoint does not reveal that a hidden record exists.

## Rules applying everywhere

1. Passwords never appear in responses or logs.
2. Emails are trimmed and lower-cased before uniqueness checks.
3. Timestamps use ISO 8601 UTC, for example `2026-09-20T04:00:00Z`.
4. Every server error uses `ApiErrorResponse`.
5. Field limits and category values must be recorded here once agreed.

## Agreement record

| Team member | Role | Agreed | Date |
|---|---|---|---|
| Unice Bondoc | Developer/Programmer | ☐ | |
| Sanjay | Developer/Programmer | ☐ | |
| Rajitha Harshana | Database Developer | ☐ | |
| Kim Lengen Nieto Gesite | Database Developer | ☐ | |
