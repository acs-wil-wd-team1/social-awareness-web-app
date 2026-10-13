# Stage 3 feature coverage

This map connects the frontend to the team's Stage 3 requirements, design/use cases and meeting allocation. It describes the local `feature/stage3-additional-apis` branch on 13 October 2026, based on `main` at `ec11766`.

The additional APIs are implemented and locally verified. That does not mean every journey is finished or the branch is deployed: Kim's business-profile GET/PUT is still missing, and cloud verification is separate. The [API integration guide](stage3-api-handoff.md) maps current work; the [API index](../api/api-contract.md) links exact payloads.

| Requirement/source | Frontend surface | API connection | Current position |
|---|---|---|---|
| Public discovery and campaign details — existing prototype/design | Homepage search/category/pagination; `/campaigns/:id` | Public campaign GETs | Expanded reads and controlled image URLs implemented; approved/non-deleted visibility checked locally |
| User campaign posting — Stage 3/meeting allocation | `/campaigns/new` with validation and optional photo | GET categories; POST campaign; optional POST image | Core posting already in main; image attachment implemented in this branch |
| Business campaign posting — Stage 3/meeting allocation | `/business/profile`, `/business/campaigns/new` | GET/PUT business profile; POST campaign | Existing-profile POST works. **Profile GET/PUT and full new-business journey still need Kim's AWT-141/AWT-173 work** |
| Campaign management — design campaign lifecycle | `/my-campaigns`, `/my-campaigns/:id/edit`; review feedback, edit/resubmit, photo replace/remove, soft deletion | Owner list/detail/PATCH/DELETE | Existing reads plus branch edits/deletion; ownership, saved-version conflict and pending-after-edit checks included |
| Campaign approval — Stage 3/meeting allocation | Admin queue and review page | Admin reads and PATCH status | Core approval already in main; branch shares image/deletion/version rules with owner management |
| Campaign participation — Stage 3 functional requirements | Join/withdraw/rejoin on approved cause details; own history and withdrawal at `/my-participation` | GET/PUT campaign participation; GET own participation | Implemented; own records stay readable/withdrawable after unpublishing/deletion, with unavailable campaign summaries `null` |
| Business enquiries/lead capture — functional requirements/design | Enquiry form on approved business details; `/business/enquiries` | POST campaign enquiry; GET owned business inbox | Implemented using existing Lead fields; owner isolation and receipt/database alignment checked locally |
| Admin accountability/content management — design UC12 | Review history; confirmed unpublish/soft-delete with reason | GET reviews; PATCH publication; DELETE campaign | Implemented with audit events, visibility checks and retained related records |
| Manage users — design UC12 | `/admin/users`; search/status filter, suspend/reactivate | GET admin users; PATCH user status | Implemented with safe account fields, all-session revocation, audit and admin-account protection |
| Dynamic campaign updates — Stage 3 functional requirements | Visible/online polling on Home, public detail and My campaigns; manual refresh | Repeat current read endpoints | Implemented; repeat cross-user refresh checks on the deployed browser |
| Authentication/security — existing prototype plus Stage 3 integration | Role-aware navigation; validated signup/login destinations; refresh/session expiry | Registration/login/logout and Bearer requests | Local regression includes real sessions and suspension/logout rejection; backend checks current role/status/ownership |
| Team branding — design logo handoff | Original logo in shared header | No API | Included and checked in the hosted sample build; recheck the final live release |
| Cloud deployment — Stage 3/meeting allocation | Configurable API origin, SPA/release preparation; [AWS preview](https://d10e86f5qx46up.cloudfront.net) | HTTPS frontend → API → database/storage | This branch's merge/deployment, persistent upload directory and cloud/browser readback remain separate checks; earlier hosting evidence is not new-feature evidence |
| Manuals, testing evidence and video — Stage 3 outputs | [Technical handoff notes](stage3-frontend-notes.md) | Record the tested release, endpoints and migrations | Team-owned final documents, test evidence and recorded demonstration are separate deliverables |

## Boundaries

- The application uses the agreed dedicated admin account. There is no public admin signup, admin promotion/role editor or account-deletion screen.
- Business enquiries are simple lead capture with a private inbox. They do not include a CRM, message threads, automated email delivery, sales stages or payments.
- Dynamic updates use 30-second polling while visible/online, plus focus/reconnection and manual refresh. Admin/history/engagement lists have manual/action refresh; no WebSocket service is claimed.
- Soft deletion retains linked records and audit evidence; restoring deleted content is not a frontend feature. Incomplete legacy enquiries stay in the database but are excluded from inbox results/counts.
- A sample frontend can be hosted while APIs are unfinished, but must remain labelled sample data. It is not final cloud IaaS or end-to-end evidence.

## Handoff and acceptance

The ownership table in the [API integration guide](stage3-api-handoff.md#agreed-responsibilities) separates existing assignments, Unice's AWT-175 additions and Kim's remaining profile work. This reference does not mark Jira tasks done or confirm a review on someone's behalf.

Local verification on 13 October: **591 frontend tests, 64 backend HTTP/MySQL checks and 18 real frontend/API/database checks passed**. See the [runner scope](../../infra/real-backend-testing.md). These are separate from sample-mode walkthroughs, a production build or deployed-browser testing. The missing profile API is tested as unavailable; it is not faked into a passing new-business journey.

Before final release: complete the profile API and new-business journey, merge/deploy the reviewed code, verify hosted settings and cross-role browser flows, then finish the manuals, testing evidence and recording against that release. Local upload storage is implemented on the existing server filesystem design; deployment must configure its persistent directory, limits and backup.
