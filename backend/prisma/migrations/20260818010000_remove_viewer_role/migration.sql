-- Viewer accounts become operators before the enum value is removed.
UPDATE "Membership" SET "role" = 'OPERATOR' WHERE "role" = 'VIEWER';

ALTER TABLE "Membership" ALTER COLUMN "role" DROP DEFAULT;
CREATE TYPE "MembershipRole_new" AS ENUM ('ADMIN', 'OPERATOR', 'DESIGNER');
ALTER TABLE "Membership"
ALTER COLUMN "role" TYPE "MembershipRole_new"
USING ("role"::text::"MembershipRole_new");
ALTER TABLE "Membership" ALTER COLUMN "role" SET DEFAULT 'OPERATOR';
DROP TYPE "MembershipRole";
ALTER TYPE "MembershipRole_new" RENAME TO "MembershipRole";
