# Stage 3 feature coverage

This map connects the frontend to the team's Stage 3 requirements, design/use cases and meeting allocation. It describes merged PR #19 and deployed application commit `ffe3df679e5d8d1dc43c8bd1669b96aed757ad86` at [CauseConnect on AWS](https://52.62.2.87), with status updated on 14 October 2026.

The additional APIs are merged and deployed, with local regression and eight production acceptance groups passed. That does not mean every journey is finished: Kim's business-profile GET/PUT still returns `404`, and fresh business onboarding is blocked. The [API integration guide](stage3-api-handoff.md) maps current work; the [API index](../api/api-contract.md) links exact payloads and the [release evidence](../evidence/stage-3/additional-apis/README.md#aws-release--14-october-2026) states verification limits.

| Requirement/source | Frontend surface | API connection | Current position |
|---|---|---|---|
| Public discovery and campaign details — existing prototype/design | Homepage search/category/pagination; `/campaigns/:id` | Public campaign GETs | Deployed; production acceptance checked approved shape, public photo and restricted visibility |
| User campaign posting — Stage 3/meeting allocation | `/campaigns/new` with validation and optional photo | GET categories; POST campaign; optional POST image | Deployed; production acceptance checked pending submission and private photo access |
| Business campaign posting — Stage 3/meeting allocation | `/business/profile`, `/business/campaigns/new` | GET/PUT business profile; POST campaign | Existing-profile POST works. **Profile GET/PUT and full new-business journey still need Kim's AWT-141/AWT-173 work** |
| Campaign management — design campaign lifecycle | `/my-campaigns`, `/my-campaigns/:id/edit`; review feedback, edit/resubmit, photo replace/remove, soft deletion | Owner list/detail/PATCH/DELETE | Deployed; production acceptance checked edit-to-pending, stale conflict and scoped soft deletion |
| Campaign approval — Stage 3/meeting allocation | Admin queue and review page | Admin reads and PATCH status | Deployed; production acceptance checked approval, history, reapproval and unpublish |
| Campaign participation — Stage 3 functional requirements | Join/withdraw/rejoin on approved cause details; own history and withdrawal at `/my-participation` | GET/PUT campaign participation; GET own participation | Deployed; production join/withdraw/history passed; local regression also checks unavailable-campaign privacy and withdrawal |
| Business enquiries/lead capture — functional requirements/design | Enquiry form on approved business details; `/business/enquiries` | POST campaign enquiry; GET owned business inbox | Implemented using existing Lead fields; owner isolation and receipt/database alignment checked locally |
| Admin accountability/content management — design UC12 | Review history; confirmed unpublish/soft-delete with reason | GET reviews; PATCH publication; DELETE campaign | Implemented with audit events, visibility checks and retained related records |
| Manage users — design UC12 | `/admin/users`; search/status filter, suspend/reactivate | GET admin users; PATCH user status | Deployed; production safe listing, suspension, session rejection and reactivation with fresh login passed |
| Dynamic campaign updates — Stage 3 functional requirements | Visible/online polling on Home, public detail and My campaigns; manual refresh | Repeat current read endpoints | Implemented; repeat cross-user refresh checks on the deployed browser |
| Authentication/security — existing prototype plus Stage 3 integration | Role-aware navigation; validated signup/login destinations; refresh/session expiry | Registration/login/logout and Bearer requests | Local regression includes real sessions and suspension/logout rejection; backend checks current role/status/ownership |
| Team branding — design logo handoff | Original logo in shared header | No API | Included and checked in the hosted sample build; recheck the final live release |
| Cloud deployment — Stage 3/meeting allocation | [Live AWS application](https://52.62.2.87); separate historical [AWS preview](https://d10e86f5qx46up.cloudfront.net) | HTTPS frontend → API → database/storage | PR #19 deployed; eight production groups, hosted photo/approval browser journey, paired backup integrity and restart persistence passed |
| Manuals, testing evidence and video — Stage 3 outputs | [Technical handoff notes](stage3-frontend-notes.md) | Record the tested release, endpoints and migrations | Team-owned final documents, test evidence and recorded demonstration are separate deliverables |

## Boundaries

- The application uses the agreed dedicated admin account. There is no public admin signup, admin promotion/role editor or account-deletion screen.
- Business enquiries are simple lead capture with a private inbox. They do not include a CRM, message threads, automated email delivery, sales stages or payments.
- Dynamic updates use 30-second polling while visible/online, plus focus/reconnection and manual refresh. Admin/history/engagement lists have manual/action refresh; no WebSocket service is claimed.
- Soft deletion retains linked records and audit evidence; restoring deleted content is not a frontend feature. Incomplete legacy enquiries stay in the database but are excluded from inbox results/counts.
- A sample frontend can be hosted while APIs are unfinished, but must remain labelled sample data. It is not final cloud IaaS or end-to-end evidence.

## Handoff and acceptance

The ownership table in the [API integration guide](stage3-api-handoff.md#agreed-responsibilities) separates existing assignments, Unice's AWT-175 additions and Kim's remaining profile work. This reference does not mark Jira tasks done or confirm a review on someone's behalf.

Release verification: **591 frontend tests, 76 backend unit tests, 64 backend HTTP/MySQL checks, 18 real frontend/API/database checks and 15 acceptance-runner stub checks passed**. See the [runner scope](../../infra/real-backend-testing.md). Eight production acceptance groups passed separately; their exact scope and fixture cleanup are in the release evidence. The missing profile API is tested as unavailable; it is not faked into a passing new-business journey.

Before final submission: complete and deploy the profile API/new-business journey, then finalise independent testing, manuals and recording against the tested release. The [14 October closeout](../evidence/stage-3/additional-apis/README.md#hosted-browser-and-backuprestart-closeout--14-october-2026) records the hosted campaign/photo journey, paired backup integrity and restart persistence. Full restoration and offsite recovery were not tested.
