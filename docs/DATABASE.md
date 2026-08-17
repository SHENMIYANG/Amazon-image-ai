# Database

The workbench uses PostgreSQL through Prisma when `DATABASE_URL` is set. Without it, the current stateless workflow keeps working.

## What the first release stores

- Organizations, users, and the initial roles: `ADMIN`, `OPERATOR`, `DESIGNER`, `VIEWER`
- Product workspaces and immutable input versions
- Reference assets and their roles
- Strategy runs, image plans, and image plan versions
- Generation runs, generated image assets, request snapshots, costs, and audit events

`strategyContent` and `promptEn` are stored together for every plan version. A generation run records the exact plan version, English execution draft, execution context, and reference asset IDs used at that time.

Feedback tables are included in the first migration. Route-level feedback history will be enabled after user identity is available.

## Enable PostgreSQL

1. Add `POSTGRES_PASSWORD` and `DATABASE_URL` to the root `.env`.
2. Start PostgreSQL with the optional compose overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.db.yml up -d
```

3. Apply the committed migration:

```bash
cd backend
npm run db:migrate:deploy
```

Do not run `db:migrate:dev` on the production server.

## Selection-system integration

The selection system must keep its own business tables. It should pass `sourceSystem` and `externalProductId` to this workbench. The workbench creates its own input snapshot so older strategies and images remain reproducible after product data changes.
