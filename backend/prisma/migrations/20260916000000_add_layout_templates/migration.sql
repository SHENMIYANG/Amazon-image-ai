ALTER TYPE "AssetRole" ADD VALUE IF NOT EXISTS 'LAYOUT_TEMPLATE';

CREATE TABLE "LayoutTemplate" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LayoutTemplate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ImagePlanVersion" ADD COLUMN "layoutTemplateId" UUID;

CREATE UNIQUE INDEX "LayoutTemplate_assetId_key" ON "LayoutTemplate"("assetId");
CREATE INDEX "LayoutTemplate_organizationId_archivedAt_createdAt_idx" ON "LayoutTemplate"("organizationId", "archivedAt", "createdAt");
CREATE INDEX "ImagePlanVersion_layoutTemplateId_idx" ON "ImagePlanVersion"("layoutTemplateId");

ALTER TABLE "LayoutTemplate" ADD CONSTRAINT "LayoutTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LayoutTemplate" ADD CONSTRAINT "LayoutTemplate_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LayoutTemplate" ADD CONSTRAINT "LayoutTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImagePlanVersion" ADD CONSTRAINT "ImagePlanVersion_layoutTemplateId_fkey" FOREIGN KEY ("layoutTemplateId") REFERENCES "LayoutTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
