# Stage 3 frontend notes for the manual and demonstration

These notes describe the current frontend and remaining integration steps at [CauseConnect on AWS](https://52.62.2.87), application commit `e612d1b448a31cd6639f161740c31a9e22f63ed6`. They provide source material for the developers manual, user manual and video; final submission documents remain separate deliverables. The [current release evidence](../evidence/stage-3/review-hardening/README.md) identifies the tested commit and verification limits.

## Agreed delivery split

Unice owns all remaining frontend work and frontend/backend cloud deployment, using her own AWS account, with a target of **20 October 2026**. Rajita owns the user campaign-posting API; Kim owns the business campaign-posting API; Kim and Rajita share the admin campaign-approval API.

Unice implemented the AWT-175 image, owner-management, participation, enquiry and additional admin APIs. Kim's GET/PUT business-profile work remains open under AWT-141/AWT-173. The [API handoff](stage3-api-handoff.md#agreed-responsibilities) retains the agreed split; these notes do not reassign the finished manuals/video or mark Jira review complete.

## What changed

- Added public-user and business-owner campaign posting, including required-field/date/category validation and optional photo selection, preview/removal and upload requests.
- Added the business profile form and the profile prerequisite before a business owner's first campaign.
- Added My campaigns, with pagination, status filters, submitted details and the latest review feedback.
- Added owner editing/resubmission, photo replacement/removal and soft deletion with saved-version conflict checks.
- Added social-cause join/withdraw/rejoin and My participation history.
- Added contact enquiries on business campaigns and a private business-owner inbox.
- Added the admin queue, approval/rejection, decision history, unpublish/soft-delete confirmation and account suspension/reactivation.
- Added visible/online polling on Home, public details and My campaigns, with manual refresh and clear stale/error states.
- Updated navigation to reflect the session's role and restore it after refresh. The API remains responsible for permission checks.
- Added a shared API client with a configurable API prefix, cancellation/timeouts, JSON errors and separate sample-mode responses.
- Removed live campaign title-based image/type inference. Live data uses the API values and a neutral image placeholder when needed.
- Added an explicitly labelled sample preview for reviewing the full frontend before all backend endpoints exist.
- Included the original team logo in the shared header.
- Prepared frontend release packaging and hosting configuration in [infra](../../infra/README.md).

The [coverage table](stage3-feature-coverage.md) maps the broader Confluence requirements to the implemented frontend and remaining APIs. Frontend/sample tests do not prove backend completion, cloud deployment or final acceptance.

## Pages and expected user journeys

| Person | Journey |
|---|---|
| Visitor | Open `/`, browse approved campaigns, open `/campaigns/:id`, register or log in |
| Public user | Submit/manage an owned campaign; join/withdraw/rejoin an approved cause campaign; send a business enquiry |
| Business owner | Browser business submission is blocked for new and existing owners on Kim's profile GET/PUT. Direct existing-profile campaign APIs and private enquiries are implemented; cause participation is available |
| Administrator | Review campaigns and decision history; remove published content or soft-delete with a reason; suspend/reactivate non-admin accounts |

New or edited submissions show pending review and remain hidden publicly. After approval, the owner can open the public page. After rejection, the owner can read the reason and edit/resubmit. The frontend shows the exact account role's links; admins do not use the ordinary submission forms. Soft deletion removes normal access while retaining records for backend-controlled recovery/audit.

The agreed application setup uses one dedicated admin account. Its `admin` role enables the header's admin panel link. There is no frontend feature for creating administrators or promoting another user. The API still checks the account's current role and session for every protected request.

The account-management page protects the current admin and all other admin accounts. Suspending an ordinary account revokes every active session. Reactivation allows a fresh login, not reuse of an expired token. Scoped suspension/session-rejection/reactivation checks passed in production; use disposable accounts for further testing.

Posting accepts a title (150 characters), description (5,000), a category returned by the API, start/end dates, optional target audience (255) and one optional non-animated JPG/PNG/WebP image up to 5 MB and 16 megapixels. Larger phone photos need resizing or supported-format export. End date cannot be before start date. Business profile fields are business name, optional ABN, website and description. Rejection comments are required and limited to 2,000 characters.

New registrations require at least 15 Unicode characters and at most 72 UTF-8 bytes. Existing accounts retain their original login passwords. Auth errors link to their fields, announce validation and focus the first invalid field. Public/admin search is capped at 150 characters; valid text is not silently clipped. Actual timestamps use the viewer's time zone; date-only start/end values stay unchanged. Non-JSON rate-limit errors explain waiting; photo-quota errors keep their specific message. Each owner is limited to 20 retained photos/50 MiB by default until actual safe cleanup removes old files/rows; replacement, removal or soft deletion does not instantly free this quota.

## How it connects

The page components call service modules in `frontend/src/services/`. `apiClient.js` builds the API URL, sends JSON or multipart data, supplies Bearer authentication where required, checks responses and cancels outdated requests. `authSession.js` restores session/role state and updates navigation.

The browser never chooses the campaign creator, business owner or initial status. It sends editable fields. The backend must resolve ownership from the signed-in account and save pending status. The client uploads an image first, receives an opaque reference, then includes only that reference in the campaign request. Actual file storage and privacy are backend responsibilities.

The exact calls, bodies, response shapes and database mappings are in the [API integration guide](stage3-api-handoff.md) and [API index](../api/api-contract.md). Use those documents when writing the developers manual instead of copying sample data as if it were production configuration.

## Preview versus API testing

`VITE_DEMO_MODE=true` builds the labelled sample preview. Its role selector supplies sample accounts and its changes stay in browser storage. Reset sample data before repeating a walkthrough. Real login/registration are intentionally unavailable in sample mode; use the role selector. It demonstrates interface behaviour, not server permission enforcement or a saved MySQL record.

`VITE_DEMO_MODE=false` is the default and calls the real backend. `VITE_API_BASE_URL=/api` uses the same website origin/local proxy. A separate hosted API needs its full HTTPS prefix, including `/api`, plus matching backend CORS. These values are public build configuration; passwords and cloud/signing credentials must never be included. A changed value needs a new build.

The real backend supports authentication, categories, public/owner/admin reads, public and existing-profile business posting, images, owner management, participation, enquiries and admin actions/history/accounts. These routes are merged and deployed. Existing-profile posting works through direct API calls. The business form first requests GET `/api/business/me`, which still returns `404`, so browser posting is blocked for existing as well as new owners. Local fixture-backed enquiry tests and sample-preview success must not be recorded as a completed hosted business journey.

Automatic updates use the existing read endpoints every 30 seconds while visible/online, plus focus/reconnection and manual refresh. This is polling, not WebSockets. Admin/history/engagement lists refresh through explicit buttons or following actions; do not describe every screen as continuously live.

## Suggested demonstration sequence

1. Identify whether the recording uses sample mode or the tested live release. For final integration evidence, use the real release and agreed test accounts.
2. Show the visitor homepage and one approved campaign.
3. Log in as a public user, submit a campaign and show its pending status in My campaigns. Demonstrate a field validation error before the successful request.
4. Once Kim's profile API is implemented, deployed and tested, show a freshly registered business owner saving a profile and submitting a campaign. Until then, identify this step as blocked; do not substitute sample mode or a seeded profile as evidence that onboarding works.
5. Log in as admin, inspect a pending submission and approve it. Return to the public page to show that it is now visible.
6. Reject a second submission with a reason, then show that reason from its owner's account while the campaign remains absent publicly.
7. Edit and resubmit a rejected campaign; explain that edited approved content also needs another approval.
8. Join, withdraw and rejoin a cause campaign; show My participation. Send a business enquiry and show it in the owning business's inbox.
9. Show admin review history and, using disposable test content, confirmed removal from public view or soft deletion. Show account suspension only with an agreed ordinary test account, never the admin account.
10. Show a status update appearing through refresh, then log out and demonstrate that protected pages require authentication.

Use separate test accounts and harmless sample content. Record real upload, approval and persistence only after the backend/storage flows have passed their integration checks. Keep a note of the release/commit and test date used for the final video.

## Checks before screenshots or final recording

- Direct links and page refreshes work on the hosted SPA, including business/admin routes.
- Guest, public, business-owner and admin navigation match their roles; a role label in the browser does not bypass API protection.
- Registration/login/logout work against the backend; refresh preserves the correct session and logout invalidates it.
- Public and business submissions retain entered values on errors, block duplicate submissions and show success only after confirmed API responses.
- Photos preview/remove correctly; invalid type/size and failed upload are handled; real image privacy and persistence are checked through the backend.
- Owner filters, pagination and review feedback work without exposing another owner's submissions.
- Admin approval/rejection works, including required reasons and a second review conflict.
- Owner edit/version conflict/resubmission and photo replacement/removal work; soft deletion retains audit data while blocking normal access.
- Participation and enquiries are isolated by user/business ownership, and repeated/uncertain writes do not create unintended duplicates.
- Account suspension rejects existing sessions and new logins; admin accounts cannot be changed through the page or API.
- Background refresh reports failures and never reuses another account's private data.
- Approved campaigns become public; pending and rejected campaigns and their images stay restricted.
- Mobile layout, keyboard focus, validation messages, loading, empty, network and expired-session states are usable.
- `npm test` and `npm run build` pass for the release being recorded; distinguish those checks from real browser/API testing.

## Logo and deployment status

The supplied original logo PNG is included at `frontend/public/images/brand/causeconnect-logo.png` and used by the header. This replaces the pending Confluence attachment download; the team logo was referenced in design document section 9.3.

The [AWS sample frontend](https://d10e86f5qx46up.cloudfront.net) was deployed on 1 October using Unice's account, private S3 storage and the CloudFront Free plan. All 15 routes and all 15 deployed files passed hosting checks; the original logo and sample photos load. This historical preview uses **Preview as** to switch roles. Sample changes stay in that browser tab and can be reset; no real accounts or backend submissions are saved.

The real IaaS application is live at [CauseConnect on AWS](https://52.62.2.87), deployed application commit `e612d1b448a31cd6639f161740c31a9e22f63ed6`, release `2026-10-14T08-35-53-193Z-e612d1b448a3`. Exact served identity and eight fresh hosted API acceptance groups passed. Local checks passed 630 frontend tests, 89 backend units, 73 HTTP/MySQL checks, 19 frontend/API/MySQL checks, 41 host checks and 21 runner/routing/argument-guard checks. Fifteen Postman assertion checks passed offline, not against the live API. The current receipt records browser/host checks separately as they finish; earlier photo/approval, paired backup integrity and restart-persistence results remain in the [PR #19 receipt](../evidence/stage-3/additional-apis/README.md). Full restoration and offsite recovery are not claimed. Free-tier eligibility or credits are not a zero-cost guarantee. See [deployment instructions](../../infra/README.md), [current release evidence](../evidence/stage-3/review-hardening/README.md) and the historical [preview evidence](../evidence/stage-3/frontend-preview/README.md).
