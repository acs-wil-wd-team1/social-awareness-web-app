# CauseConnect backend

Node.js, Express, Sequelize and MySQL. This branch adds category lookup and text-only campaign submission for active public users alongside the existing authentication and campaign reads.

## Prerequisites

- Node.js 22.12+ and npm
- MySQL 8
- Git

## Initial setup

```bash
git pull
cd backend
npm install
```

## Environment file

If you do not already have a local `.env`, copy the example:

```bash
cp .env.example .env
```

Update the values with your local database configuration. Never commit database passwords, tokens or private keys.

## Running the database locally

The `docker-compose.yml` in this folder runs MySQL 8 for local development, not Stage 3 deployment. An existing local MySQL Server works too.

```bash
docker compose up -d
```

This reads `DB_NAME`, `DB_NAME_TEST`, `DB_USER`, `DB_PORT` and `DB_PASSWORD` from `.env`. On first initialization it creates the configured databases. Data persists in a named volume across restarts.

Check the container is healthy before running migrations or starting the server:

```bash
docker compose ps
```

## Run the development server

```bash
npm run dev
```

## Tests

```sh
npm test
npm run test:integration
```

Unit tests do not need MySQL. The integration suite requires an already-migrated, separate local test database: set `RUN_DB_INTEGRATION=1`, `NODE_ENV=test`, a local `DB_HOST`, and `DB_NAME_TEST` ending in `_test` and different from `DB_NAME`. It also needs your local database credentials and `JWT_SECRET`. It creates and removes only its own test records; do not point it at a shared or production database.

## Campaign submission

The [campaign submission contract](../docs/api/campaign-posting-contract.md) lists the endpoints, validation rules and API-to-database field mapping. This flow uses the existing tables and needs no new migration. Images, business posting and admin approval writes are separate work.
