# Persistence Layer

`schema.prisma` defines the long-lived data for the image workbench.

The first release keeps current API behavior when `DATABASE_URL` is unset. When a database is configured, the persistence services store product workspaces, input versions, strategy versions, generation snapshots, assets, costs, and audit events. The schema already includes feedback tables; route-level feedback history will be enabled with user accounts.

Do not store image bytes, API keys, passwords, or authorization headers in PostgreSQL. `Asset` stores the storage provider and object key so local files can later move to MinIO or S3 without changing business records.

## Local database setup

1. Add `DATABASE_URL` and `POSTGRES_PASSWORD` to the root `.env`.
2. Start the optional database stack with `docker compose -f docker-compose.yml -f docker-compose.db.yml up -d`.
3. Run `npm run db:migrate:deploy` from `backend`.

The base `docker-compose.yml` stays database-free. Existing deployments keep working until the database overlay is intentionally enabled.
