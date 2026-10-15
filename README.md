# CauseConnect

Team 1 project for the ACS Professional Year Work Integrated Learning — Web Development program.

CauseConnect lets people discover social causes, post campaigns and participate in community initiatives. Small-business owners can create a business profile, post a campaign and receive enquiries. Administrators review submissions before they appear publicly.

## Current stage

**Stage 3 — frontend, backend integration and cloud deployment**

The Stage 2 prototype provided public campaign browsing, registration and login/logout. Its submission deadline was Sunday 20 September 2026.

The frontend covers:

1. Public-user and business campaign posting, business profiles and campaign photos
2. My campaigns, owner edits/resubmission, photo replacement/removal and soft deletion
3. Social-cause participation: join, withdraw, rejoin and personal history
4. Business enquiries and the business owner's private inbox
5. Admin approval/rejection, review history, content removal and user suspension/reactivation
6. Automatic updates on the public campaign list/detail and owner submission status

The frontend, API and database are live at [CauseConnect on AWS](https://52.62.2.87). Its [release manifest](https://52.62.2.87/release.json) identifies the application actually being served; a newer checkout or documentation commit is not proof of deployment. The [15 October repair receipt](docs/evidence/stage-3/final-review-2026-10-15/README.md) records the latest source repairs and local checks, with publication and hosted verification kept separate.

Kim's [PR #22](https://github.com/acs-wil-wd-team1/social-awareness-web-app/pull/22) supplies the integrated business-profile APIs. Its [14 October receipt](docs/evidence/stage-3/business-profile-integration/README.md) records the full hosted business journey; the subsequent [14 October readiness receipt](docs/evidence/stage-3/final-readiness/hosted-2026-10-14.md) records a narrower smoke pass. These are dated results, not automatic acceptance of later changes. Independent team testing, manuals and recording remain separate deliverables. See the [feature coverage](docs/handoff/stage3-feature-coverage.md), [frontend guide](frontend/README.md), [API guide](docs/handoff/stage3-api-handoff.md) and [deployment instructions](infra/ec2/README.md).

## Stage 3 deliverables

Stage 3 is due **Sunday 25 October 2026, 11:59 pm**. The application extends the Stage 2 prototype with:

- Campaign creation for social causes
- Small-business campaign posting
- Campaign participation
- Administrator campaign approval
- Live campaign updates
- Enhanced authentication and security
- Cloud IaaS deployment
- User, developer and testing documentation

The list above is the overall Stage 3 scope. Local implementation and regression evidence do not replace cloud/browser testing, manuals or the final recording. Jira remains the place for team task allocation and review status. There is no public admin signup, role-promotion screen, payment system or full CRM.

## Technology

| Part | Implementation |
|---|---|
| Frontend | React, Vite and CSS |
| API and database | Node.js, Express, MySQL and Sequelize migrations |
| Authentication | JWTs, database-backed sessions and hashed passwords |
| Hosting | One AWS EC2 server in Sydney; Nginx serves HTTPS and forwards API requests |
| Photos | Private persistent server storage, with API checks for public or owner/admin access |
| Collaboration | GitHub, Jira and Confluence |

The database is not publicly exposed. The older S3/CloudFront sample frontend is separate from the integrated EC2 application. Details are in the [tools register](docs/project/tools.md) and [hosting guide](infra/ec2/README.md).

## Repository structure

- `frontend/` — React frontend
- `backend/` — Node.js, Express and database work
- `docs/project/` — scope, roles and tools
- `docs/api/` — frontend and backend API agreement
- `docs/design/` — design links, standards and approved exports
- `docs/testing/` — test planning and test cases
- `docs/deployment/` — Stage 2 cloud deployment model
- `docs/evidence/` — dated Stage 2 and Stage 3 verification receipts
- `docs/development-log/` — records created as development work is completed
- `docs/manuals/` — reserved for the Stage 3 User Manual and Developers Manual
- `infra/` — local regression, deployment, backup and release checks

## Design handoff

The team's design and submission documents are in [Confluence](https://acs-wil-team1.atlassian.net/wiki/spaces/AWT/). The running application and its [technical notes](docs/handoff/stage3-frontend-notes.md) describe the implemented interface. Keep any dated design exports with their source and contributor in `docs/design/`.

## Team roles

The confirmed roles are recorded in [`docs/project/team-roles.md`](docs/project/team-roles.md).

Jira records current task allocation and review status; this repository does not reassign features or documents.

## Working agreements

- Use your own account and Git identity for your contributions.
- Do not add work under another person's name.
- Keep secrets and local environment files out of Git.
- Ask another relevant team member to check important changes before they are added to `main`.
- Jira tracks tasks and ownership; Confluence holds the team submission documents.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) before making changes.

## Project links

- [Jira project](https://acs-wil-team1.atlassian.net/jira/software/projects/AWT/)
- [Confluence space](https://acs-wil-team1.atlassian.net/wiki/spaces/AWT/)
- [Implementation reference for manuals, demo and testers](https://acs-wil-team1.atlassian.net/wiki/spaces/AWT/pages/13598722/Stage+3+-+Implementation+Notes+-+Manuals+and+Demo)
- Submitted Project Charter: stored in the team's approved submission records

## Important documents

- [Stage 2 scope](docs/project/scope.md)
- [Team roles](docs/project/team-roles.md)
- [Tools register](docs/project/tools.md)
- [API contract](docs/api/api-contract.md)
- [Design handoff](docs/design/README.md)
- [Test plan](docs/testing/test-plan.md)
- [Stage 2 evidence](docs/evidence/stage-2/README.md)
- [Cloud deployment model](docs/deployment/cloud-model.md)

## Current status

The [live AWS application](https://52.62.2.87) uses real accounts, API calls and persistent data. The older [AWS preview](https://d10e86f5qx46up.cloudfront.net) uses browser-only sample data and is not backend evidence. The [evidence index](docs/evidence/stage-3/README.md) records exact releases and checks. Independent team acceptance, final manuals and recording remain separate from developer verification. Backup integrity and restart checks are not a full/off-site restoration test.

No feature should be described as complete until its implementation and evidence are present.
