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

## Run the development server

```bash
npm run dev
```