# Stage 3 feature coverage

This map connects the frontend to the team's Stage 3 requirements, design/use cases and meeting allocation. It describes deployed application commit `ab1bef2c1b2e55c401a78543d4034cd2e85d0a2c`, release `2026-10-14T10-17-18-153Z-ab1bef2c1b2e`, at [CauseConnect on AWS](https://52.62.2.87), updated on 14 October 2026.

The additional APIs, review fixes, six-character signup setting and [PR #22 profile integration](https://github.com/acs-wil-wd-team1/social-awareness-web-app/pull/22) are merged/deployed. The previous missing-profile blocker is removed. Exact identity, eight supporting-API groups, eight business-API groups and the actual hosted Chrome business journey passed; independent tester acceptance remains separate. The [integration guide](stage3-api-handoff.md) maps routes, the [API index](../api/api-contract.md) links payloads and the [current receipt](../evidence/stage-3/business-profile-integration/README.md) states verification limits.

| Requirement/source | Frontend surface | API connection | Current position |
|---|---|---|---|
| Public discovery and campaign details — existing prototype/design | Homepage search/category/pagination; `/campaigns/:id` | Public campaign GETs | Deployed; production acceptance checked approved shape, public photo and restricted visibility |
| User campaign posting — Stage 3/meeting allocation | `/campaigns/new` with validation and optional photo | GET categories; POST campaign; optional POST image | Deployed; production acceptance checked pending submission and private photo access |
| Business campaign posting — Stage 3/meeting allocation | `/business/profile`, `/business/campaigns/new` | GET/PUT profile; canonical POST campaign; compatibility business-only POST | PR #22 merged/deployed; fresh onboarding passed in real React/API/MySQL, hosted API and actual hosted Chrome; independent tester acceptance remains |
| Campaign management — design campaign lifecycle | `/my-campaigns`, `/my-campaigns/:id/edit`; review feedback, edit/resubmit, photo replace/remove, soft deletion | Owner list/detail/PATCH/DELETE | Deployed; production acceptance checked edit-to-pending, stale conflict and scoped soft deletion |
| Campaign approval — Stage 3/meeting allocation | Admin queue and review page | Admin reads and PATCH status | Deployed; production acceptance checked approval, history, reapproval and unpublish |
| Campaign participation — Stage 3 functional requirements | Join/withdraw/rejoin on approved cause details; own history and withdrawal at `/my-participation` | GET/PUT campaign participation; GET own participation | Deployed; production join/withdraw/history passed; local regression also checks unavailable-campaign privacy and withdrawal |
| Business enquiries/lead capture — functional requirements/design | Enquiry form on approved business details; `/business/enquiries` | POST campaign enquiry; GET owned business inbox | Deployed using existing Lead fields; local and fresh hosted business-API checks cover receipt, owning inbox and second-owner isolation |
| Admin accountability/content management — design UC12 | Review history; confirmed unpublish/soft-delete with reason | GET reviews; PATCH publication; DELETE campaign | Implemented with audit events, visibility checks and retained related records |
| Manage users — design UC12 | `/admin/users`; search/status filter, suspend/reactivate | GET admin users; PATCH user status | Deployed; production safe listing, suspension, session rejection and reactivation with fresh login passed |
| Dynamic campaign updates — Stage 3 functional requirements | Visible/online polling on Home, public detail and My campaigns; manual refresh | Repeat current read endpoints | Implemented; repeat cross-user refresh checks on the deployed browser |
| Authentication/security — existing prototype plus Stage 3 integration | Role-aware navigation; validated signup/login destinations; refresh/session expiry | Registration/login/logout and Bearer requests | Local regression includes real sessions and suspension/logout rejection; backend checks current role/status/ownership |
| Team branding — design logo handoff | Original logo in shared header | No API | Included and checked in the hosted sample build; recheck the final live release |
| Cloud deployment — Stage 3/meeting allocation | [Live AWS application](https://52.62.2.87); separate historical [AWS preview](https://d10e86f5qx46up.cloudfront.net) | HTTPS frontend → API → database/storage | Current `ab1bef2` release deployed on the same server, no new migration/resource; exact identity, eight supporting-API groups, eight business-API groups and actual hosted Chrome business journey passed; independent acceptance remains |
| Manuals, testing evidence and video — Stage 3 outputs | [Technical handoff notes](stage3-frontend-notes.md) | Record the tested release, endpoints and migrations | Team-owned final documents, test evidence and recorded demonstration are separate deliverables |

## Boundaries

- The application uses the agreed dedicated admin account. There is no public admin signup, admin promotion/role editor or account-deletion screen.
- Business enquiries are simple lead capture with a private inbox. They do not include a CRM, message threads, automated email delivery, sales stages or payments.
- Dynamic updates use 30-second polling while visible/online, plus focus/reconnection and manual refresh. Admin/history/engagement lists have manual/action refresh; no WebSocket service is claimed.
- Soft deletion retains linked records and audit evidence; restoring deleted content is not a frontend feature. Incomplete legacy enquiries stay in the database but are excluded from inbox results/counts.
- A sample frontend can be hosted while APIs are unfinished, but must remain labelled sample data. It is not final cloud IaaS or end-to-end evidence.

## Handoff and acceptance

The [ownership table](stage3-api-handoff.md#agreed-responsibilities) preserves agreed assignments and Kim's original PR #22 contribution. Unice performed integration repairs and deployment. This reference does not mark Jira tasks done or confirm Nithya's review.

Current local verification: **631 frontend tests, 106 backend units, 87 HTTP/MySQL and 26 real frontend/API/database checks passed**. Also passed: 41 local host, 35 CLI/stub/routing and 15 offline Postman checks, not live API calls. See the [runner scope](../../infra/real-backend-testing.md). Exact identity, eight supporting-API and eight business-API groups passed separately; scope and fixture cleanup are in the [current receipt](../evidence/stage-3/business-profile-integration/README.md). New-owner local and hosted API journeys use real profile setup, not seeded Business rows.

The actual hosted Chrome journey passed profile save/refresh, photo posting/privacy, approval/public details, enquiry/inbox refresh, owner soft removal with retained enquiries and logout protection. Before submission, finish Meet/Prince's independent browser/device/accessibility testing, manuals and recording against the served release. The historical [PR #19 closeout](../evidence/stage-3/additional-apis/README.md#hosted-browser-and-backuprestart-closeout--14-october-2026) remains dated backup/restart evidence, not a fresh run against later code. Full restoration and offsite recovery are unverified; passing checks are not a zero-defect claim.
