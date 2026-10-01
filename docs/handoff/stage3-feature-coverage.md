# Stage 3 feature coverage

This is the connection map for the current branch. It follows the team's Stage 3 functional requirements, Confluence design/use cases and latest meeting allocation. The broader requirements include participation, business enquiries/lead capture, dynamic updates and UC12 user/content management—not only the three campaign-posting/approval API tasks.

**Frontend implemented** means the page, validation, request handling and sample interaction are present. It does not mean the proposed API exists, that data has been saved in MySQL, or that a cloud release has passed testing. The [API handoff](stage3-api-handoff.md) has the implementation order; the [API index](../api/api-contract.md) links the exact contracts.

| Requirement/source | Frontend surface | API connection | Backend/integration remaining |
|---|---|---|---|
| Public discovery and campaign details — existing prototype/design | Homepage search/category/pagination; `/campaigns/:id` | Existing public campaign GETs | Expand type/date/business fields and safe images; keep approved-only, non-deleted visibility |
| User campaign posting — Stage 3/meeting allocation | `/campaigns/new` with validation and optional photo | GET categories; POST campaign; optional POST image | Categories/text-only public POST exist in this branch; image attachment still pending |
| Business campaign posting — Stage 3/meeting allocation | `/business/profile`, `/business/campaigns/new` | GET/PUT business profile; POST campaign | Current-owner profile, business posting extension and image storage pending |
| Campaign management — design campaign lifecycle | `/my-campaigns`, `/my-campaigns/:id/edit`; review feedback, edit/resubmit, photo replace/remove, soft deletion | Owner list/detail/PATCH/DELETE | Owner isolation, saved-version conflicts, pending-after-edit and shared soft-deletion migration pending |
| Campaign approval — Stage 3/meeting allocation | Admin queue and review page | Existing admin reads; proposed PATCH status | Transactional decisions, rejection feedback, concurrency checks and visibility changes pending |
| Campaign participation — Stage 3 functional requirements | Join/withdraw/rejoin on approved cause details; `/my-participation` | GET/PUT campaign participation; GET own participation | Participation routes, ownership, campaign eligibility and duplicate-record protection pending |
| Business enquiries/lead capture — functional requirements/design | Enquiry form on approved business details; `/business/enquiries` | POST campaign enquiry; GET owned business inbox | API validation, sender identity and private inbox scoping pending; existing Lead columns cover the fields |
| Admin accountability/content management — design UC12 | Review history; confirmed unpublish/soft-delete with reason | GET reviews; PATCH publication; DELETE campaign | History serialization, audit events, non-deleted scopes and recoverable deletion pending |
| Manage users — design UC12 | `/admin/users`; search/status filter, suspend/reactivate | GET admin users; PATCH user status | Safe account DTO, all-session revocation, audit and protection of every admin account pending |
| Dynamic campaign updates — Stage 3 functional requirements | Visible/online polling on Home, public detail and My campaigns; manual refresh | Repeat existing/proposed read endpoints | Current state on every read, correct cache/privacy behaviour and real cross-user tests pending |
| Authentication/security — existing prototype plus Stage 3 integration | Role-aware navigation; refresh/session expiry; protected-page states | Existing registration/login/logout, Bearer requests | Retest real sessions across new APIs; backend remains the authority for current role/status/ownership |
| Team branding — design logo handoff | Original logo in shared header | No API | Included and checked in the hosted sample build; recheck the final live release |
| Cloud deployment — Stage 3/meeting allocation | Configurable API origin, SPA/release preparation; [AWS sample frontend](https://d10e86f5qx46up.cloudfront.net) deployed | HTTPS frontend → API → database/storage | Sample hosting verified. Real backend/database/image storage, final cloud routing and end-to-end cloud tests still needed |
| Manuals, testing evidence and video — Stage 3 outputs | [Technical handoff notes](stage3-frontend-notes.md) | Record the tested release, endpoints and migrations | Team-owned final documents, test evidence and recorded demonstration are separate deliverables |

## Boundaries

- The application uses the agreed dedicated admin account. There is no public admin signup, admin promotion/role editor or account-deletion screen.
- Business enquiries are simple lead capture with a private inbox. They do not include a CRM, message threads, automated email delivery, sales stages or payments.
- Dynamic updates use 30-second polling while visible/online, plus focus/reconnection and manual refresh. Admin/history/engagement lists have manual/action refresh; no WebSocket service is claimed.
- Soft deletion is not permanent destruction. The backend must retain linked records and audit evidence; restoring deleted content is not a frontend feature.
- A sample frontend can be hosted while APIs are unfinished, but must remain labelled sample data. It is not final cloud IaaS or end-to-end evidence.

## Handoff and acceptance

Unice handles the frontend and frontend/backend cloud deployment. The meeting assigned user posting to Rajita, business posting to Kim and campaign approval to both. Supporting endpoints and migrations need coordination between them; this table does not silently allocate new work.

For each API group, implement the contract, run database/permission tests, then retest the matching real browser journey with `VITE_DEMO_MODE=false`. Record the tested commit and result. Frontend tests, a successful production build, sample-mode walkthroughs and a live API test are different evidence and should be reported separately.

Before final release, the team still needs real upload storage, complete API integration, hosted configuration, cross-role testing, final manuals/testing documentation and the recording. See the API contracts for concrete checks rather than treating every frontend screen as a completed backend feature.
