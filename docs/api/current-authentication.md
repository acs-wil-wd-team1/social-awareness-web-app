# Current authentication API

**Reference, 13 October 2026:** The checked-out authentication service/controllers in `feature/stage3-additional-apis`. Examples describe implemented responses, not a claim of deployment or exhaustive security verification.

## Register

`POST /api/auth/register` — JSON, no token required

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "ExamplePassword123!",
  "accountType": "user"
}
```

Accepted fields are `name`, `email`, `password` and `accountType`. `user` maps to the `public` role; `business` maps to `business_owner`. Extra fields, including privilege fields, are rejected. Email is trimmed/lowercased and passwords are hashed.

`201` response:

```json
{
  "message": "Registered!",
  "user": { "id": 3, "name": "Jane Doe", "role": "public" }
}
```

Registration does not return a token or create a business profile. Controller errors include `409 EMAIL_EXISTS` and `422 VALIDATION_FAILED`, using `status`, `code`, `message` and `fieldErrors`. Server validation checks accepted fields, types and lengths; tests are in `backend/test/unit/authValidation.test.js`.

The frontend limits the trimmed name to 100 characters and email to 150, matching the existing user columns. It confirms registration only when the returned role matches the submitted account type. These browser checks do not replace server-side validation.

## Login

`POST /api/auth/login` — JSON, no token required

```json
{
  "email": "jane@example.com",
  "password": "ExamplePassword123!"
}
```

`200` response:

```json
{
  "user": {
    "id": 3,
    "name": "Jane Doe",
    "email": "jane@example.com",
    "role": "public"
  },
  "token": "<JWT>"
}
```

Login normalises email, verifies the password, then locks/rechecks the current account before creating an active UserSession. This prevents a concurrent suspension from being followed by a new active session. Each login receives a unique JWT ID and expires after one day. Missing/blank User-Agent metadata is stored as `Unknown`.

Controller errors include `401 INVALID_CREDENTIALS`, `403 ACCOUNT_SUSPENDED` and `422 VALIDATION_FAILED`. Protected Stage 3 routes independently check the current account and matching active session; suspension expires all active sessions, and reactivation requires a new login.

## Logout

`PUT /api/auth/logout` with `Authorization: Bearer <token>`. No request body is needed.

Success is `204` with no response body. The matching active session becomes expired and receives a logout timestamp. Subsequent protected requests with that session are rejected.

The legacy logout middleware checks JWT validity and an active session. Its errors differ from controller errors: missing/inactive sessions return `401` with an `error` string; token verification failure returns `403` with an `error` string. New campaign/management/engagement routes use the current-account guard and [shared conventions](shared-conventions.md); API parser and unknown-route errors are normalised in this branch.

The frontend should check the HTTP result before presenting logout as confirmed. Local token removal alone does not prove the server session was invalidated.
