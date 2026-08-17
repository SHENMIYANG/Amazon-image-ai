-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('ADMIN', 'OPERATOR', 'DESIGNER', 'VIEWER');

-- CreateEnum
CREATE TYPE "AssetRole" AS ENUM ('PRODUCT_REFERENCE', 'GENERATED_IMAGE', 'FEEDBACK_REFERENCE', 'CHAT_ATTACHMENT');

-- CreateEnum
CREATE TYPE "ReferenceRole" AS ENUM ('PRIMARY_PRODUCT', 'SUPPORTING_PRODUCT', 'LAYOUT_STYLE_REFERENCE', 'REGENERATION_REFERENCE');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ModelRequestType" AS ENUM ('STRATEGY', 'STRATEGY_TRANSLATION', 'IMAGE_GENERATION', 'IMAGE_FEEDBACK', 'WORKSPACE_CHAT');

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "passwordHash" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'OPERATOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductWorkspace" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sourceSystem" TEXT,
    "externalProductId" TEXT,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductInputVersion" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "productBlueprint" JSONB,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductInputVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "workspaceId" UUID,
    "storageProvider" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "publicUrl" TEXT,
    "mimeType" TEXT,
    "byteSize" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "sha256" TEXT,
    "role" "AssetRole" NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceReference" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "inputVersionId" UUID,
    "assetId" UUID NOT NULL,
    "role" "ReferenceRole" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyRun" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "inputVersionId" UUID NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "model" TEXT,
    "requestId" TEXT,
    "productBlueprint" JSONB,
    "rawResponse" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImagePlan" (
    "id" UUID NOT NULL,
    "strategyRunId" UUID NOT NULL,
    "taskKey" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImagePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImagePlanVersion" (
    "id" UUID NOT NULL,
    "imagePlanId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "imageRole" TEXT,
    "sellingFocus" TEXT,
    "strategyContent" TEXT NOT NULL,
    "promptEn" TEXT NOT NULL,
    "copy" JSONB,
    "executionRules" JSONB,
    "usage" JSONB,
    "source" TEXT NOT NULL DEFAULT 'AI',
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImagePlanVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationRun" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "imagePlanId" UUID NOT NULL,
    "imagePlanVersionId" UUID NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "model" TEXT,
    "resolution" TEXT,
    "complexity" TEXT,
    "promptEnSnapshot" TEXT NOT NULL,
    "executionSnapshot" JSONB NOT NULL,
    "referenceAssetIds" JSONB NOT NULL,
    "requestId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedImage" (
    "id" UUID NOT NULL,
    "generationRunId" UUID NOT NULL,
    "assetId" UUID,
    "imageUrlSnapshot" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "requestResolution" TEXT,
    "actualResolution" TEXT,
    "isPrimaryResult" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackThread" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "imagePlanId" UUID NOT NULL,
    "generatedImageId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackMessage" (
    "id" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "intent" TEXT,
    "planVersionId" UUID,
    "modelPayload" JSONB,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackAttachment" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelRequest" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "workspaceId" UUID,
    "strategyRunId" UUID,
    "generationRunId" UUID,
    "actorId" UUID,
    "type" "ModelRequestType" NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "requestId" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "imageCount" INTEGER,
    "costUsd" DECIMAL(12,6),
    "durationMs" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "requestSnapshot" JSONB,
    "responseSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "workspaceId" UUID,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_userId_key" ON "Membership"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "ProductWorkspace_organizationId_updatedAt_idx" ON "ProductWorkspace"("organizationId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductWorkspace_organizationId_sourceSystem_externalProduc_key" ON "ProductWorkspace"("organizationId", "sourceSystem", "externalProductId");

-- CreateIndex
CREATE INDEX "ProductInputVersion_workspaceId_createdAt_idx" ON "ProductInputVersion"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductInputVersion_workspaceId_version_key" ON "ProductInputVersion"("workspaceId", "version");

-- CreateIndex
CREATE INDEX "Asset_organizationId_workspaceId_role_idx" ON "Asset"("organizationId", "workspaceId", "role");

-- CreateIndex
CREATE INDEX "Asset_sha256_idx" ON "Asset"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_storageProvider_objectKey_key" ON "Asset"("storageProvider", "objectKey");

-- CreateIndex
CREATE INDEX "WorkspaceReference_workspaceId_sortOrder_idx" ON "WorkspaceReference"("workspaceId", "sortOrder");

-- CreateIndex
CREATE INDEX "WorkspaceReference_assetId_idx" ON "WorkspaceReference"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyRun_requestId_key" ON "StrategyRun"("requestId");

-- CreateIndex
CREATE INDEX "StrategyRun_workspaceId_createdAt_idx" ON "StrategyRun"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ImagePlan_strategyRunId_sortOrder_idx" ON "ImagePlan"("strategyRunId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ImagePlan_strategyRunId_taskKey_key" ON "ImagePlan"("strategyRunId", "taskKey");

-- CreateIndex
CREATE INDEX "ImagePlanVersion_imagePlanId_createdAt_idx" ON "ImagePlanVersion"("imagePlanId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImagePlanVersion_imagePlanId_version_key" ON "ImagePlanVersion"("imagePlanId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationRun_requestId_key" ON "GenerationRun"("requestId");

-- CreateIndex
CREATE INDEX "GenerationRun_workspaceId_createdAt_idx" ON "GenerationRun"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "GenerationRun_imagePlanId_createdAt_idx" ON "GenerationRun"("imagePlanId", "createdAt");

-- CreateIndex
CREATE INDEX "GeneratedImage_generationRunId_idx" ON "GeneratedImage"("generationRunId");

-- CreateIndex
CREATE INDEX "FeedbackThread_workspaceId_updatedAt_idx" ON "FeedbackThread"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "FeedbackMessage_threadId_createdAt_idx" ON "FeedbackMessage"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackAttachment_messageId_assetId_key" ON "FeedbackAttachment"("messageId", "assetId");

-- CreateIndex
CREATE INDEX "ModelRequest_organizationId_createdAt_idx" ON "ModelRequest"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ModelRequest_workspaceId_type_createdAt_idx" ON "ModelRequest"("workspaceId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "ModelRequest_requestId_idx" ON "ModelRequest"("requestId");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_createdAt_idx" ON "AuditEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_workspaceId_createdAt_idx" ON "AuditEvent"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductWorkspace" ADD CONSTRAINT "ProductWorkspace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductWorkspace" ADD CONSTRAINT "ProductWorkspace_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInputVersion" ADD CONSTRAINT "ProductInputVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ProductWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInputVersion" ADD CONSTRAINT "ProductInputVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ProductWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceReference" ADD CONSTRAINT "WorkspaceReference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ProductWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceReference" ADD CONSTRAINT "WorkspaceReference_inputVersionId_fkey" FOREIGN KEY ("inputVersionId") REFERENCES "ProductInputVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceReference" ADD CONSTRAINT "WorkspaceReference_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyRun" ADD CONSTRAINT "StrategyRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ProductWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyRun" ADD CONSTRAINT "StrategyRun_inputVersionId_fkey" FOREIGN KEY ("inputVersionId") REFERENCES "ProductInputVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagePlan" ADD CONSTRAINT "ImagePlan_strategyRunId_fkey" FOREIGN KEY ("strategyRunId") REFERENCES "StrategyRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagePlanVersion" ADD CONSTRAINT "ImagePlanVersion_imagePlanId_fkey" FOREIGN KEY ("imagePlanId") REFERENCES "ImagePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagePlanVersion" ADD CONSTRAINT "ImagePlanVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationRun" ADD CONSTRAINT "GenerationRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ProductWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationRun" ADD CONSTRAINT "GenerationRun_imagePlanId_fkey" FOREIGN KEY ("imagePlanId") REFERENCES "ImagePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationRun" ADD CONSTRAINT "GenerationRun_imagePlanVersionId_fkey" FOREIGN KEY ("imagePlanVersionId") REFERENCES "ImagePlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationRun" ADD CONSTRAINT "GenerationRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedImage" ADD CONSTRAINT "GeneratedImage_generationRunId_fkey" FOREIGN KEY ("generationRunId") REFERENCES "GenerationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedImage" ADD CONSTRAINT "GeneratedImage_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackThread" ADD CONSTRAINT "FeedbackThread_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ProductWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackThread" ADD CONSTRAINT "FeedbackThread_imagePlanId_fkey" FOREIGN KEY ("imagePlanId") REFERENCES "ImagePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackThread" ADD CONSTRAINT "FeedbackThread_generatedImageId_fkey" FOREIGN KEY ("generatedImageId") REFERENCES "GeneratedImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackMessage" ADD CONSTRAINT "FeedbackMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "FeedbackThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackMessage" ADD CONSTRAINT "FeedbackMessage_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "ImagePlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackMessage" ADD CONSTRAINT "FeedbackMessage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackAttachment" ADD CONSTRAINT "FeedbackAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "FeedbackMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackAttachment" ADD CONSTRAINT "FeedbackAttachment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelRequest" ADD CONSTRAINT "ModelRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelRequest" ADD CONSTRAINT "ModelRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ProductWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelRequest" ADD CONSTRAINT "ModelRequest_strategyRunId_fkey" FOREIGN KEY ("strategyRunId") REFERENCES "StrategyRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelRequest" ADD CONSTRAINT "ModelRequest_generationRunId_fkey" FOREIGN KEY ("generationRunId") REFERENCES "GenerationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelRequest" ADD CONSTRAINT "ModelRequest_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ProductWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

