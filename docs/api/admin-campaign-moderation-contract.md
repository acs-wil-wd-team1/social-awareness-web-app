# Admin campaign moderation API proposal

**Status:** Approval/rejection is proposed for review and is not implemented on main or verified against a real database. Existing admin reads are identified separately below.

## Existing admin reads

- `GET /api/campaigns/admin` — authenticated admin; returns `campaigns`, `page` and `pageSize`.
- `GET /api/campaigns/admin/:id` — authenticated admin; returns the campaign object.

The list accepts `page`, `pageSize`, `search`, `category` and `status`. Existing admin reads can include pending, approved or rejected campaigns. These routes do not change a campaign's status.

## Proposed review action

`PATCH /api/campaigns/admin/:id/status` — authenticated user with current admin permission

```json
{
  "status": "rejected",
  "comments": "Please include the event location in the description."
}
```

Proposed rules:

- `status` must be `approved` or `rejected`; only a pending campaign can transition.
- A rejection requires a trimmed, non-empty reason in `comments`. Approval comments may be omitted or `null`. A supplied comment must be a string of at most 2,000 characters after trimming.
- Accept only `status` and `comments`. The server selects the signed-in admin ID; the browser cannot provide `adminId` or other ownership fields.
- Read/check the pending status and update the campaign plus its review record within one transaction. Use a row lock or conditional pending-status update so concurrent reviewers cannot both succeed.
- If another review already won, return `409 CAMPAIGN_ALREADY_REVIEWED` without inserting a second review. If either write fails, roll back both writes.
- Approval allows public campaign/image delivery. Rejection leaves both restricted. Authorised owner views should show the outcome and rejection reason.

Proposed `200` response:

```json
{
  "campaign": {
    "id": 9,
    "status": "rejected"
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

Errors use the [proposed shared envelope](shared-conventions.md): `401` for missing/invalid authentication, `403 FORBIDDEN` for non-admin access, `404 CAMPAIGN_NOT_FOUND`, `409 CAMPAIGN_ALREADY_REVIEWED`, or `422 VALIDATION_FAILED` for invalid status/comments.

## Database and dependent reads

The existing `campaigns.status` and `campaign_reviews` fields cover the core decision data. Final transaction, review-history and image-access requirements still need implementation and database testing; additional migrations may be needed for the agreed workflow.

An owner-submissions view and review-history read contract remain to be defined. Saving drafts, editing approved content and resubmitting rejected campaigns are separate workflows; this endpoint does not imply they exist.

## Acceptance checks for implementation

- A guest/non-admin cannot access moderation records or submit decisions.
- Admins can see pending submissions and their restricted images.
- Approval makes the campaign public; rejection keeps it private and records its required reason.
- Two concurrent decisions produce one successful transition and one `409`, with one matching review record.
- A failed write leaves neither a changed status nor a stray review.
- Owner/admin views show the recorded outcome without exposing another user's private submissions.
