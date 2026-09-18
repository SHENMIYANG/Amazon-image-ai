CREATE TYPE "LayoutTemplateScope" AS ENUM ('PUBLIC', 'PERSONAL');

ALTER TABLE "LayoutTemplate"
ADD COLUMN "scope" "LayoutTemplateScope" NOT NULL DEFAULT 'PUBLIC';

DROP INDEX IF EXISTS "LayoutTemplate_organizationId_archivedAt_createdAt_idx";
CREATE INDEX "LayoutTemplate_organizationId_scope_archivedAt_createdAt_idx"
ON "LayoutTemplate"("organizationId", "scope", "archivedAt", "createdAt");
CREATE INDEX "LayoutTemplate_createdById_scope_archivedAt_createdAt_idx"
ON "LayoutTemplate"("createdById", "scope", "archivedAt", "createdAt");
