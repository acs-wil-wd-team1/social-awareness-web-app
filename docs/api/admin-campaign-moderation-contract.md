# Admin campaign moderation API proposal

**Status:** The admin frontend is implemented against this contract. The status-write backend is still proposed and has not been verified against a real database. Existing admin reads are identified separately below.

**Agreed ownership:** Unice handles the admin frontend; Kim and Rajita share the admin campaign-approval API. Coordinate shared image/read dependencies with the user-posting API (Rajita) and business-posting API (Kim).

## Admin account and navigation

The agreed application setup uses one dedicated account with role `admin`. Login returns that role; the header shows the admin panel link and its review routes. There is no public administrator registration or frontend user-promotion feature in this scope. Provision the dedicated account through the team's controlled backend setup, keep its credentials out of source control, and check current database role/status and active session for every admin request.

The single-account setup does not remove the need for transaction/conflict handling: two browser tabs or repeated requests can still review the same campaign simultaneously.

## Existing admin reads

- `GET /api/campaigns/admin` — authenticated admin; returns `campaigns`, `page` and `pageSize`.
- `GET /api/campaigns/admin/:id` — authenticated admin; returns the campaign object.

The list accepts `page`, `pageSize`, `search`, `category` and `status`. Existing admin reads can include pending, approved or rejected campaigns. These routes do not change a campaign's status.

The frontend pages are `/admin/campaigns` and `/admin/campaigns/:id`. Expand read responses using the [campaign read contract](campaign-read-contract.md), including business information, target audience/dates, latest review, and authorised signed URLs for private images. The existing projection currently omits those extra fields. Keep the direct detail object and the `campaigns` list key.

## Proposed review action

`PATCH /api/campaigns/admin/:id/status` — authenticated user with current admin permission

```json
{
  "status": "rejected",
  "comments": "Please include the event location in the description.",
  "expectedUpdatedAt": "2026-10-01T05:00:00.000Z"
}
```

Proposed rules:

- `status` must be `approved` or `rejected`; only a pending campaign can transition.
- A rejection requires a trimmed, non-empty reason in `comments`. Approval comments may be omitted or `null`. A supplied comment must be a string of at most 2,000 characters after trimming.
- Accept only `status`, `comments` and `expectedUpdatedAt`. The server selects the signed-in admin ID; the browser cannot provide `adminId` or other ownership fields.
- Admin detail must include its current `updatedAt` as canonical UTC `YYYY-MM-DDTHH:mm:ss.sssZ`. Send that value unchanged as required `expectedUpdatedAt`; invalid/missing versions return `422`.
- In one transaction, lock the non-deleted campaign, compare its exact current version with `expectedUpdatedAt`, check pending status, then save the status and review. A version mismatch returns `409 CAMPAIGN_CHANGED`, even if the campaign is still pending. This prevents approving content the owner changed after the admin loaded it. Row locking without the version comparison is not enough.
- Advance the campaign's saved `updatedAt` version when applying the decision, so the [owner edit version check](owned-campaign-management-contract.md#version-checks-and-transactions) detects a review made after the owner loaded their form.
- If another review already won, return `409 CAMPAIGN_ALREADY_REVIEWED` without inserting a second review. If either write fails, roll back both writes.
- Approval allows public campaign/image delivery. Rejection leaves both restricted. Authorised owner views should show the outcome and rejection reason.

Proposed `200` response:

```json
{
  "campaign": {
    "id": 9,
    "status": "rejected",
    "updatedAt": "2026-10-01T06:00:00.000Z"
  },
  "review": {
    "id": 4,
    "campaignId": 9,
    "adminId": 1,
    "action": "rejected",
    "comments": "Please include the event location in the description.",
    "reviewedAt": "2026-10-01T06:00:00.000Z"
  }
}
```

The returned `campaign.updatedAt` must be newer than the submitted version, so a subsequent admin action uses the newly saved state. Preserve millisecond precision and advance the version even for changes in the same millisecond, as specified in [owner management](owned-campaign-management-contract.md#version-checks-and-transactions).

Errors use the [proposed shared envelope](shared-conventions.md): `401` for missing/invalid authentication, `403 FORBIDDEN` for non-admin access, `404 CAMPAIGN_NOT_FOUND`, `409 CAMPAIGN_CHANGED` / `CAMPAIGN_ALREADY_REVIEWED`, or `422 VALIDATION_FAILED` for invalid status/comments/version.

## Database and dependent reads

The existing `campaigns.status` and `campaign_reviews` fields cover the core decision data. Final transaction, review-history and image-access requirements still need implementation and database testing; additional migrations may be needed for the agreed workflow.

The [owner-submissions/read contract](campaign-read-contract.md) defines `GET /api/campaigns/mine` and the latest `review` object. The expanded admin frontend additionally consumes review history and content-management actions from the [admin-management contract](admin-management-contract.md). Owner editing/resubmission and soft deletion are covered separately in the [owner-management contract](owned-campaign-management-contract.md). These supporting APIs remain proposed; the approval endpoint alone does not implement them.

Map the result to the existing schema:

| API/server value | Sequelize attribute | SQL column |
|---|---|---|
| Path `id` / response `campaign.id` | `Campaign.campaignId` | `campaigns.campaign_id` |
| Validated `status` | `Campaign.status` | `campaigns.status` |
| Generated `review.id` | `CampaignReview.reviewId` | `campaign_reviews.review_id` |
| Campaign ID | `CampaignReview.campaignId` | `campaign_reviews.campaign_id` |
| Authenticated admin ID | `CampaignReview.adminId` | `campaign_reviews.admin_id` |
| Validated decision | `CampaignReview.action` | `campaign_reviews.action` |
| Trimmed comment/reason | `CampaignReview.comments` | `campaign_reviews.comments` |
| Server UTC review time | `CampaignReview.reviewedAt` | `campaign_reviews.reviewed_at` |

`campaign_reviews` has no `created_at` or `updated_at`; its Sequelize model already uses `timestamps: false`. The current migration has no unique campaign-review constraint, so the pending-state lock/conditional update is essential. Keep previous rows across later edits/unpublish/reapproval: there can be several valid reviews over a campaign's lifetime, but only one successful decision per pending transition. Within one transaction: verify current admin access, lock/find a non-deleted campaign, check the loaded version and pending status, write status/new version, insert review, commit, then serialize the saved result. A conditional update alternative must match both version and pending status, check the affected-row count and insert a review only when exactly one matching row transitioned.

On a conflict or uncertain network response, the frontend reloads the campaign before another decision. It must never receive a successful response containing the opposite decision or a mismatched campaign/review ID. Restricted image delivery must enforce campaign status when issuing URLs; approval does not make every upload in the storage bucket public.

## Acceptance checks for implementation

- A guest/non-admin cannot access moderation records or submit decisions.
- Admins can see pending submissions and their restricted images.
- Approval makes the campaign public; rejection keeps it private and records its required reason.
- Two concurrent decisions produce one successful transition and one `409`, with one matching review record.
- If an owner edits a pending campaign after the admin loads it, approval/rejection with the older version returns `409` without a decision. The admin must reload, inspect the new content and confirm a new decision.
- Missing/malformed versions return `422`; non-advancing or missing response versions are not treated as confirmed success by the frontend.
- A failed write leaves neither a changed status nor a stray review.
- Owner/admin views show the recorded outcome without exposing another user's private submissions.
