-- Each member owns a separate workspace for the same external product.
DROP INDEX "ProductWorkspace_organizationId_sourceSystem_externalProduc_key";

CREATE UNIQUE INDEX "product_workspace_owner_external_product_unique"
ON "ProductWorkspace"("organizationId", "createdById", "sourceSystem", "externalProductId");

CREATE INDEX "ProductWorkspace_organizationId_createdById_updatedAt_idx"
ON "ProductWorkspace"("organizationId", "createdById", "updatedAt");
