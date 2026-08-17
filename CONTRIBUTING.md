# Contributing

This is a shared student-team repository. The workflow can be adjusted after the team discusses it.

## Before starting

1. Check that the task is within the current project stage.
2. Check Jira for the task and owner.
3. Read the related scope, design or API document.
4. Tell the relevant team members what you are working on.

## Branches

Use a short descriptive branch name, for example:

- `feature/campaign-homepage`
- `feature/registration`
- `fix/login-validation`
- `docs/design-handoff`
- `docs/api-contract`

## Commits

- Use your own GitHub account and configured Git identity.
- Commit only work you contributed.
- Keep commits focused and describe the result clearly.
- Keep unrelated changes in separate commits.
- Never commit passwords, tokens, API keys or private information.

Example commit message: `Add registration form validation`

## Review

Important changes should be checked by at least one other relevant team member before they are added to `main`.

The team can decide whether reviews happen through pull requests or another agreed process.

## Documents and designs

- Upload your own contribution using your own account.
- Keep editable design files in the tool selected by the designers.
- Upload dated exports to `docs/design/` after the team selects a version.
- Do not replace someone else's contribution without discussing it with them.
- Update the related documentation when a change affects scope, design, API behaviour, testing or deployment.

## Environment files

Commit `.env.example` only.

Do not commit `.env`, private keys, real passwords or live server credentials.
