# Backend

Owner lane: Database Developer

This area is reserved for the team's Node.js, Express and MySQL implementation. Unice's frontend work will not create or claim the backend implementation.

Before development begins, the Database Developers and Developer/Programmers should review and sign `docs/api/api-contract.md`.

Backend documentation should include:

- local setup and start commands
- required environment-variable names using `.env.example`
- schema and migration instructions
- endpoint implementation notes
- validation and authentication decisions
- tests and evidence
- Stage 3 process/deployment requirements

Never commit real database passwords, tokens or private keys.

# Backend Setup

Current dependencies

- Express
- Sequelize
- MySQL2
- dotenv
- bcrypt
- jsonwebtoken
- cors

## Prerequisites

- Node.js (v22 or later)
- MySQL
- Git

## Initial Setup

```bash
git pull
cd backend
npm install
```

## Create your environment file

Copy:

```bash
cp .env.example .env
```

Update the values in `.env` with your local database configuration.

## Running the database locally

A `docker-compose.yml` in this folder runs MySQL 8 for local development
(not used for Stage 3 deployment — see `infra/`).

```bash
docker compose up -d
```

This reads `DB_NAME`, `DB_NAME_TEST`, `DB_USER`, `DB_PORT` and `DB_PASSWORD`
from your `.env`, and on first boot creates both the `CauseConnect` and
`CauseConnect_test` databases. Data persists in a named volume across
restarts. To wipe it and start over:

```bash
docker compose down -v
```

Check the container is healthy before running migrations or starting the
server:

```bash
docker compose ps
```

## Run the development server

```bash
npm run dev
```