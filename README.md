# Social Awareness Web Application

Team 1 project for the ACS Professional Year Work Integrated Learning — Web Development program.

The application will help people discover campaigns supporting social causes and allow small-business owners to promote their businesses.

## Current stage

**Stage 3 — campaign frontend and API integration work**

The Stage 2 prototype provided public campaign browsing, registration and login/logout. Its submission deadline was Sunday 20 September 2026.

This branch adds frontend screens for:

1. Public-user and business campaign posting, business profiles and campaign photos
2. My campaigns, owner edits/resubmission, photo replacement/removal and soft deletion
3. Social-cause participation: join, withdraw, rejoin and personal history
4. Business enquiries and the business owner's private inbox
5. Admin approval/rejection, review history, content removal and user suspension/reactivation
6. Automatic updates on the public campaign list/detail and owner submission status

These are frontend implementations, not a claim that all their backend APIs are ready. Category lookup and text-only public submission are implemented in this branch's backend. Other new endpoints, image storage and the final integrated cloud deployment remain pending; the AWS sample frontend is already available. See the [feature coverage](docs/handoff/stage3-feature-coverage.md), [frontend README](frontend/README.md), [API handoff](docs/handoff/stage3-api-handoff.md) and [deployment preparation](infra/README.md).

## Looking ahead to Stage 3

Stage 3 is due **Sunday 25 October 2026, 11:59 pm**. It extends the running Stage 2 prototype with:

- Campaign creation for social causes
- Small-business campaign posting
- Campaign participation
- Administrator campaign approval
- Live campaign updates
- Enhanced authentication and security
- Cloud IaaS deployment
- User, developer and testing documentation

The list above is the overall Stage 3 scope. This branch provides the application frontend and API handoff; real backend integration, cloud testing, manuals and the final recording remain separate deliverables. Jira remains the place for team task allocation. There is no public admin signup, role-promotion screen, payment system or full CRM.

## Why this repository was created

This repository was prepared as a head start for the development work. The structure is open for the team to review and change.

It gives the frontend, backend, designs, API agreement, tests and submission evidence one organised place without deciding individual ownership before the team agrees.

## Initial project direction

Meeting 1 recorded the following initial choices:

- React
- Node.js and Express
- MySQL
- AWS
- GitHub
- Jira and Confluence
- draw.io
- Selenium and Cypress

Additional implementation tools are listed in [`docs/project/tools.md`](docs/project/tools.md). Some are course-aligned suggestions and still need team confirmation.

## Repository structure

- `frontend/` — React frontend
- `backend/` — Node.js, Express and database work
- `docs/project/` — scope, roles and tools
- `docs/api/` — frontend and backend API agreement
- `docs/design/` — design links, standards and approved exports
- `docs/testing/` — test planning and test cases
- `docs/deployment/` — Stage 2 cloud deployment model
- `docs/evidence/` — Stage 2 submission-evidence checklist
- `docs/development-log/` — records created as development work is completed
- `docs/manuals/` — reserved for the Stage 3 User Manual and Developers Manual
- `infra/` — Stage 3 deployment preparation and release checks

## Design handoff

The Front-end Designers can choose the design tool they are most comfortable using. Figma is one suggestion, while Canva can also be used for wireframes and storyboards.

The editable design remains in the chosen tool. Once the team selects a version, dated exports can be uploaded to `docs/design/` using the contributor's own GitHub account.

## Team roles

The confirmed roles are recorded in [`docs/project/team-roles.md`](docs/project/team-roles.md).

The repository does not assign individual features or documents. Nithya and the team will confirm those allocations.

## Suggested working agreements

- Use your own account and Git identity for your contributions.
- Do not add work under another person's name.
- Keep secrets and local environment files out of Git.
- Ask another relevant team member to check important changes before they are added to `main`.
- Jira tracks tasks and ownership; Confluence holds the team submission documents.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) before making changes.

## Project links

- [Jira project](https://acs-wil-team1.atlassian.net/jira/software/projects/AWT/)
- [Confluence space](https://acs-wil-team1.atlassian.net/wiki/spaces/AWT/)
- Design source: to be added after the Front-end Designers choose their tool
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

The Stage 3 frontend and API handoff are prepared in this branch, including the original team logo. The [AWS sample preview](https://d10e86f5qx46up.cloudfront.net) is available for interface review; use **Preview as** to explore the roles. It uses disposable browser data, not the real backend. New backend features, final backend/cloud deployment and real integration testing remain open. Technical notes for the manual/demo owner are in [the frontend handoff](docs/handoff/stage3-frontend-notes.md).

No feature should be described as complete until its implementation and evidence are present.
