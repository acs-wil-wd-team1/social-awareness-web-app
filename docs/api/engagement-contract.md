# Campaign participation and business enquiries

**Status:** The frontend is implemented against this proposed contract. The repository already has `Participation` and `Lead` models and migrations, but does not yet have these API routes. Sample-mode responses are not evidence that the backend is connected.

This covers joining or supporting a social-cause campaign and sending a business an expression of interest. It does not add payments, donations, bookings, email delivery or a lead-management workflow. Backend ownership for these additional dependencies still needs coordination; the existing posting/approval assignments do not by themselves assign these endpoints.

Follow the [shared conventions](shared-conventions.md), [campaign read contract](campaign-read-contract.md) and [business profile contract](business-profile-contract.md). IDs below are positive JSON integers, not numeric strings. Timestamps are ISO 8601 UTC strings.

## Endpoints used by the frontend

| Request | Access | Success |
|---|---|---|
| `GET /api/campaigns/:id/participation` | Active `public` or `business_owner`; own existing record regardless of campaign visibility, or approved cause when no record exists | `200 {participation: record or null}` |
| `PUT /api/campaigns/:id/participation` | Same active roles; `joined` requires an approved cause; `withdrawn` requires the current user's existing record regardless of campaign visibility | `200 {participation: record}` |
| `GET /api/participations/mine?page=1&pageSize=10` | Active `public` or `business_owner`; own history only | `200 {participations, page, pageSize, total}` |
| `POST /api/campaigns/:id/enquiries` | Active `public` or `business_owner`; approved business campaign | `201 {enquiry: record}` |
| `GET /api/business/me/enquiries?page=1&pageSize=10` | Active `business_owner`; their own business only | `200 {enquiries, page, pageSize, total}` |

All require `Authorization: Bearer <token>`. Recheck the active session and current database user role/status. An admin cannot use these participant/contact forms or the business-owner inbox. Do not accept a client-supplied user, owner or business ID.

New joins, rejoins and enquiries require a current approved, non-deleted campaign. The server derives `cause` from a null business association and `business` from a non-null association; a submitted type is not authoritative. Missing, pending, rejected or soft-deleted campaigns return `404 CAMPAIGN_NOT_FOUND` for these actions. A visible campaign of the wrong type returns `409 CAMPAIGN_TYPE_MISMATCH`.

Reading or withdrawing an existing participation has a different authority: the record must belong to the active authenticated user. Both remain available after owner edits, rejection, unpublishing or soft deletion. These responses expose only the user's participation fields, never private campaign content. Without an own record, a private or missing campaign produces the same `404 CAMPAIGN_NOT_FOUND` response; another user's participation cannot establish access or reveal whether a private campaign exists.

Register these campaign subroutes explicitly, with literal campaign routes such as `/categories`, `/mine` and `/admin` ahead of `/:id`. Keep API routes before any frontend SPA fallback.

## Join or withdraw from a cause

`GET /api/campaigns/4/participation` first resolves the authenticated user's own record by campaign ID. An existing record returns the wrapper below even when the campaign is no longer public. If no record exists, an approved cause returns `200 {"participation": null}`; a private, deleted or missing campaign returns `404 CAMPAIGN_NOT_FOUND` with no participation or campaign details.

```json
{
  "participation": {
    "id": 12,
    "campaignId": 4,
    "status": "joined",
    "participatedAt": "2026-10-01T01:00:00.000Z"
  }
}
```

`PUT /api/campaigns/4/participation` accepts only:

```json
{ "status": "joined" }
```

`status` is exactly `joined` or `withdrawn`. Reject extra fields and non-string/unknown values with `422 VALIDATION_FAILED`, using `fieldErrors.status` where applicable.

Implementation rules:

1. The server resolves the active user from the verified session and validates the path ID and body.
2. It finds and locks the one row for this user and campaign. The existing unique constraint on `(user_id, campaign_id)` is the authority; a different user's row never grants permission.
3. For `joined`, the current approved, non-deleted cause is required, including when the user's row already exists. The server creates the row when absent or changes an existing withdrawn row back to joined. Repeating `joined` on a joined row returns that same row only while the campaign remains eligible.
4. For `withdrawn`, an existing own row is sufficient: the server updates it without requiring public campaign access. Repeating `withdrawn` returns the same row. With no previous participation, an approved cause returns `409 PARTICIPATION_NOT_FOUND`; a private, deleted or missing campaign returns the same `404 CAMPAIGN_NOT_FOUND`. No withdrawal request creates a row or first-join date.
5. Return the persisted row after the write commits. The response status must match the requested status.

Transactions and the unique constraint handle concurrent first joins without duplicate records. For join/rejoin, the campaign's approved and non-deleted state must still hold when committing; this shares moderation's transaction/locking approach. Withdrawal locks and changes only the authenticated user's existing participation and remains valid during a campaign visibility change. `participatedAt` records the first join and stays unchanged on withdrawal or rejoining. The table has no `updated_at` column.

The browser blocks duplicate clicks. If a write times out, returns an unreadable response or fails with a server error, it does not assume success or failure: further changes remain blocked until GET successfully checks the current participation. This reconciliation GET must work for an existing own record even when the campaign has become private. PUT is idempotent; a browser timeout does not prove that the write failed.

## My participation history

`GET /api/participations/mine?page=1&pageSize=10` returns:

```json
{
  "participations": [
    {
      "id": 12,
      "campaignId": 4,
      "status": "joined",
      "participatedAt": "2026-10-01T01:00:00.000Z",
      "campaign": {
        "id": 4,
        "title": "Books for Kids",
        "status": "approved",
        "type": "cause"
      }
    }
  ],
  "page": 1,
  "pageSize": 10,
  "total": 1
}
```

Include both joined and withdrawn records, scoped by the authenticated `user_id` before counting/pagination. Sort by `participated_at DESC`, then `participation_id DESC`. The campaign ID in a non-null summary must match the participation's campaign ID.

Historical records remain when a campaign is no longer publicly accessible. A pending, rejected, soft-deleted or otherwise unavailable campaign has `campaign: null`; its current title may contain an unapproved owner edit and must not be disclosed. Only approved, non-deleted campaigns have public summaries and links. Participation ownership grants access to the user's own record, not to private campaign details or review notes.

My participation provides withdrawal for each joined record, including rows with a null campaign summary. The action uses that record's `campaignId` with the existing PUT route and sends only `{"status":"withdrawn"}`. The page does not offer direct join/rejoin actions: an approved public campaign detail supplies those controls. A confirmed response updates the row; uncertain writes require a successful status check or history reload. Refresh and pagination are disabled while an action is in flight, and a session or role change cancels pending requests and removes the previous account's rows.

## Send an enquiry to a business

`POST /api/campaigns/9/enquiries` accepts JSON:

```json
{
  "name": "Alex Example",
  "email": "alex@example.com",
  "phone": "0400000000",
  "message": "I would like to know more about the repair afternoon."
}
```

| Field | Validation and normalisation |
|---|---|
| `name` | Required string; trim; 1–100 characters |
| `email` | Required valid email string; trim and lowercase; at most 150 characters |
| `phone` | Optional string; trim; at most 20 characters; omitted, empty or null stores SQL `NULL` |
| `message` | Required string; trim; 1–2,000 characters |

The frontend omits a blank phone. Return it explicitly as `null` in the response. Reject unsupported keys, including `campaignId`, `businessId`, `userId` and `status`. Validate before saving and return `422 VALIDATION_FAILED` with field errors keyed by `name`, `email`, `phone` or `message`.

The server obtains `campaign_id` from the path, `business_id` from that approved campaign and `user_id` from the session. It never accepts the recipient business from the browser. Contact details are supplied explicitly by the sender; do not silently substitute their account email.

After saving, return `201`:

```json
{
  "enquiry": {
    "id": 6,
    "campaignId": 9,
    "businessId": 3,
    "name": "Alex Example",
    "email": "alex@example.com",
    "phone": "0400000000",
    "message": "I would like to know more about the repair afternoon.",
    "createdAt": "2026-10-01T02:00:00.000Z"
  }
}
```

Echo the persisted, normalised name/email/phone/message and the matching campaign ID. Do not return a successful receipt before the database write commits. Recheck the campaign's approval and business association during the write so a concurrent moderation change cannot bypass eligibility.

The form explains before submission that the business owner receives the contact details and message, and that this is an expression of interest rather than a booking or purchase. A successful receipt confirms a stored enquiry, not an email or notification being delivered.

POST is not idempotent in this contract. The existing leads table has no request-id uniqueness constraint. The browser prevents concurrent clicks and, after an uncertain write, requires explicit acknowledgement that retrying may create a duplicate. Do not add invisible automatic retries. A future idempotency-key design needs a documented server implementation before the frontend relies on it.

## Business enquiry inbox

`GET /api/business/me/enquiries?page=1&pageSize=10` returns:

```json
{
  "enquiries": [
    {
      "id": 6,
      "campaignId": 9,
      "businessId": 3,
      "name": "Alex Example",
      "email": "alex@example.com",
      "phone": null,
      "message": "I would like to know more about the repair afternoon.",
      "createdAt": "2026-10-01T02:00:00.000Z",
      "campaign": {
        "id": 9,
        "title": "Local Repair Afternoon",
        "status": "approved"
      }
    }
  ],
  "page": 1,
  "pageSize": 10,
  "total": 1
}
```

Find `Business` by `owner_id = currentUser.id`, then filter leads to that business before counting/pagination. If the owner has no business profile, return `409 BUSINESS_PROFILE_REQUIRED`; the page links to `/business/profile`. An existing profile with no enquiries returns an empty successful list.

Sort by `created_at DESC`, then `lead_id DESC`. Include historical enquiries for that business even if a campaign is later rejected. A minimal summary may show its current status; a missing/unavailable summary is `campaign: null`. The frontend never links pending/rejected campaigns to a public detail route.

This inbox is read-only. There is no lead status in the existing schema, and no endpoint here to mark a lead contacted, delete it or assign it to someone. Contact data and message contents must never appear in public campaign responses, another business's inbox or public logs. Do not use browser-supplied query fields to widen owner scope. Use private/no-store caching for authenticated contact-data responses.

## Pagination and common errors

For both lists, default `page=1`, `pageSize=10`; positive integers only, maximum page size `100`. Invalid recognised values return `422`. Ignore unknown query keys, but never use them as ownership overrides. Return the requested page and page size, a mandatory non-negative integer `total`, and an array no longer than the page size. `total` is the filtered count before pagination; a page beyond the end is a successful empty list. Do not duplicate IDs within a page.

Use the shared error envelope. Relevant codes are `401 AUTH_REQUIRED`/`INVALID_TOKEN`, `403 FORBIDDEN`/`ACCOUNT_SUSPENDED`, `404 CAMPAIGN_NOT_FOUND`, `409 CAMPAIGN_TYPE_MISMATCH`/`PARTICIPATION_NOT_FOUND`/`BUSINESS_PROFILE_REQUIRED`, and `422 VALIDATION_FAILED`. API routes must return JSON rather than the frontend HTML document.

## Existing database mapping

| API or authenticated value | Model attribute | Existing column |
|---|---|---|
| Participation `id` | `Participation.participationId` | `participations.participation_id` |
| Session user ID | `Participation.userId` | `participations.user_id` |
| Participation `campaignId` | `Participation.campaignId` | `participations.campaign_id` |
| Participation `status` | `Participation.status` | `participations.status ENUM('joined','withdrawn')` |
| Participation `participatedAt` | `Participation.participatedAt` | `participations.participated_at` |
| Enquiry `id` | `Lead.leadId` | `leads.lead_id` |
| Enquiry `campaignId` | `Lead.campaignId` | `leads.campaign_id` |
| Campaign's business ID | `Lead.businessId` | `leads.business_id` |
| Session user ID | `Lead.userId` | `leads.user_id` |
| Enquiry contact fields | `Lead.name/email/phone/message` | `leads.name/email/phone/message` |
| Enquiry `createdAt` | `Lead.createdAt` | `leads.created_at` |

`20260830103040-create-participations.js` already creates the participation table and unique user/campaign index. `20260830103100-create-leads.js` already creates the leads table. Do not create duplicate tables or ask teammates to create them manually. No new columns are required for the contract above. Although the leads table permits a null `message` and `user_id`, these new API writes require a message and an authenticated user. Decide how legacy incomplete rows are handled before exposing them: the frontend validates complete contact records.

The existing association definitions use snake-case foreign-key names while model attributes use camelCase. Verify generated joins use the real mapped columns and do not add unintended attributes. Use explicit response mapping; do not send a complete Sequelize user/business model or session data to the browser.

## Build order and checks

1. Add protected service/controller/router methods using the existing models and shared error format.
2. Implement GET/PUT participation and prove one-record concurrency/idempotency before connecting the cause-page controls.
3. Implement own participation history with counts and visibility-safe campaign summaries.
4. Implement enquiry creation and the profile-scoped inbox together, so a received message has a private destination.
5. Run the backend checks below, then test the real browser with sample mode disabled. The sample preview alone is not integration evidence.

Required checks:

- Guest, expired session, suspended user and admin restrictions on every route; business inbox rejects a public user.
- User A cannot read/change user B's participation; business A cannot read business B's enquiries, including forged IDs and query parameters.
- Pending/rejected/missing campaign cannot receive joins or enquiries. Wrong campaign type is rejected. Check concurrent campaign-status changes.
- First join, repeated join, withdrawal, repeated withdrawal, rejoin and concurrent first joins reuse one record and preserve its first timestamp.
- A joined user can read and withdraw the same own record after owner editing, admin unpublishing/rejection or soft deletion. Join/rejoin still fails while unavailable. A different user receives the same private/missing-campaign error and cannot read or withdraw that record.
- GET after an uncertain participation write returns the real state; the browser does not claim success prematurely.
- Enquiry required fields, invalid email, exact length boundaries, optional phone, unexpected JSON types and forged ownership fields are checked server-side.
- A confirmed enquiry is stored in `leads` and appears only in its business owner's inbox, with matching receipt fields.
- No successful booking, payment, notification or email-delivery claim is made by creating an enquiry.
- Lists cover empty results, multiple pages, past-end pages, deterministic ordering and mandatory filtered totals.
- Non-approved historical campaigns return null summaries, have no public link and disclose no changed title, description or review detail. Existing participation still permits withdrawal.
- Error/retry states preserve appropriate form input, require acknowledgement for uncertain enquiry retries, and clear private data after an account change/logout.

Frontend test entry points: `engagementService.test.js`, `CampaignParticipation.test.jsx`, `CampaignEnquiryForm.test.jsx`, `MyParticipationPage.test.jsx` and `BusinessEnquiriesPage.test.jsx`.
