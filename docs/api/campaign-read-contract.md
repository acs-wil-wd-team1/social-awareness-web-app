# Campaign reads and owner submissions

**Status:** Public and admin read routes exist. The owner route and the expanded fields described here are proposed backend work consumed by the completed frontend. Existing `campaignServices.js` currently returns only `id`, `title`, `description`, `category`, `imageUrl`, `createdBy`, `status` and `createdAt`.

## Routes and access

| Request | Status | Access |
|---|---|---|
| `GET /api/campaigns` | Existing route; extend response fields | Public, approved only |
| `GET /api/campaigns/:id` | Existing route; extend response fields | Public, approved only; pending/rejected/missing return `404` |
| `GET /api/campaigns/admin` | Existing route; extend response fields | Current active admin, all statuses |
| `GET /api/campaigns/admin/:id` | Existing route; extend response fields | Current active admin, all statuses |
| `GET /api/campaigns/mine` | New proposed route | Current active `public` or `business_owner`, only rows with `created_by = currentUser.id` |
| `GET /api/campaigns/mine/:id` | New proposed route | Current active owner only; full editable fields and exact `updatedAt` version |

The owner list expands each item to show submitted details. The edit page additionally needs the owner-detail endpoint specified in the [owner-management contract](owned-campaign-management-contract.md). A business owner's rows are still scoped by `created_by`, not a client business ID. Public queries cannot use `status=pending` to escape the approved filter. All these routes exclude soft-deleted campaigns.

## List request and response

The frontend sends `page` and `pageSize` explicitly. Owner/admin screens use `pageSize=10`. For new/updated routes: default page `1`, page size `20`; positive integers only, `pageSize` at most `100`. Preserve compatibility with existing callers that request `100`.

Optional `status` is `pending`, `approved` or `rejected` for owner/admin. Optional `search` is a trimmed title search. Existing `category` is a positive category ID in the URL, not a category name. Public reads remain approved regardless of optional filters. Reject invalid recognised values with `422`; ignore unknown query keys. Apply all ownership/status filters before counting or paginating.

Sort by `createdAt DESC`, then numeric `id DESC`. Return `200` with this envelope:

```json
{
  "campaigns": [],
  "page": 1,
  "pageSize": 10,
  "total": 0
}
```

Use `campaigns`, not `items`. `total` is the filtered count before pagination. Add `total` to updated reads; the frontend tolerates its absence on legacy admin reads. A page after the end returns `200` with an empty array. Detail routes return the campaign object directly, without a `campaign` wrapper; create returns a wrapper as documented separately.

## Campaign object

One complete owner/admin item, also the target shape for the create response:

```json
{
  "id": 9,
  "title": "Local Repair Afternoon",
  "description": "Bring a small household item for a free repair workshop.",
  "categoryId": 1,
  "category": "Environment",
  "type": "business",
  "imageUrl": null,
  "targetAudience": "Local residents",
  "startDate": "2026-10-20",
  "endDate": "2026-10-20",
  "createdBy": 3,
  "businessId": 2,
  "business": { "id": 2, "businessName": "Neighbourhood Repairs", "website": "https://example.com" },
  "status": "pending",
  "createdAt": "2026-09-30T11:00:00.000Z",
  "updatedAt": "2026-09-30T11:00:00.000Z",
  "review": null
}
```

Required core fields: positive integer `id`, non-empty `title`, string `description` (normalise legacy SQL `NULL` to `""`), valid `status`, ISO UTC `createdAt`. Include `categoryId`, the category name, derived `type`, nullable `imageUrl`, audience/dates, ownership IDs and business summary. Owner-detail and admin-detail responses require the saved `updatedAt` ISO UTC timestamp with milliseconds, used as the write-conflict version. The admin detail UI will not accept a versionless response for review/actions; add this field to the existing read projection before connecting those writes. Null business association means `type: "cause"`, non-null means `type: "business"`; never infer type from a campaign title or user input.

For a reviewed owner/admin item, `review` is the latest review ordered by `reviewedAt DESC`, then `reviewId DESC`:

```json
{
  "id": 4,
  "campaignId": 9,
  "adminId": 1,
  "action": "rejected",
  "comments": "Please include an event location.",
  "reviewedAt": "2026-10-01T01:00:00.000Z"
}
```

Expose review feedback to that campaign's owner and authorised admins. Public responses use approved campaign content plus the public business summary; omit internal review records, private user details, session data and upload metadata. Category IDs refer to real database categories and names come from the join. Dates use `YYYY-MM-DD`; a legacy missing date/audience/image is `null`.

The admin review page also loads paginated historical decisions from `GET /api/campaigns/admin/:id/reviews`; keep that separate from the latest `review` summary above. The [admin-management contract](admin-management-contract.md) defines its response and retention rules.

Restricted pending/rejected image URLs must be short-lived signed URLs issued only after owner/admin checks. Approved image URLs must be suitable for public delivery. See the [image contract](campaign-posting-future-proposal.md#upload-one-campaign-image) for storage and approval rules.

## Database mapping

`campaignId -> id`, `categoryId -> categoryId`, `Category.categoryName -> category`, `createdBy -> createdBy`, `businessId -> businessId`, `Business.businessId/businessName/website -> business`, and the existing date/audience/status fields map directly. SQL uses underscored column names. `CampaignReview.reviewId -> review.id`, plus `campaignId`, `adminId`, `action`, `comments` and `reviewedAt`.

Use associations or explicit queries that join the correct keys. Existing model association definitions use snake-case foreign-key names while declared attributes use camelCase; verify generated SQL does not create or select duplicate unintended attributes. Add repository migrations for actual schema changes, not ad-hoc SQL instructions.

## Router order and checks

In `backend/src/router/campaignRoutes.js`, register literal `/categories`, `/mine`, `/mine/:id` and `/admin` routes, including admin action/history paths, before public `/:id`. Otherwise `mine` or `admin` may be parsed as campaign IDs.

Test owner A cannot see owner B's pending/rejected submissions, public pending/rejected/deleted details return `404`, non-admin admin access returns `403`, review feedback is available only to owner/admin, private image URLs require authorised reads, and pagination/counts never include invisible rows.

Home/public details and My campaigns poll these reads every 30 seconds while visible and online and refresh on focus/reconnection. Serve current visibility/status on every request; protect private responses from shared caching. Transient read failures must not change campaign state. This frontend uses polling, not a separate real-time push endpoint.
