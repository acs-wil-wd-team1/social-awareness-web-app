# Current authentication API

**Reference:** Implemented code on main at `0146365c`. Examples describe existing responses; they are not a claim that all invalid-input or security cases have been tested.

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

Registration does not return a token or create a business profile. Controller errors include `409 EMAIL_EXISTS` and `422 VALIDATION_FAILED`, using `status`, `code`, `message` and `fieldErrors`. Comprehensive server-side field/type/length validation remains work to complete.

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

Login normalises email, verifies the password, rejects suspended users and creates an active UserSession. The JWT expires after one day. Missing/blank User-Agent metadata is stored as `Unknown`.

Controller errors include `401 INVALID_CREDENTIALS`, `403 ACCOUNT_SUSPENDED` and `422 VALIDATION_FAILED`. A successful login does not establish that later account-role/status changes are immediately reflected in an existing session.

## Logout

`PUT /api/auth/logout` with `Authorization: Bearer <token>`. No request body is needed.

Success is `204` with no response body. The matching active session becomes expired and receives a logout timestamp. Subsequent protected requests with that session are rejected.

The current main middleware checks JWT validity and an active session. Its errors differ from controller errors: missing/inactive sessions return `401` with an `error` string; token verification failure returns `403` with an `error` string. The [Stage 3 shared conventions](shared-conventions.md) propose normalising these responses, including parser and unknown-route errors.

The frontend should check the HTTP result before presenting logout as confirmed. Local token removal alone does not prove the server session was invalidated.
