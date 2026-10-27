-- Admin sub-roles. Every existing admin keeps full access as SUPER_ADMIN; new admins are created with a narrower role.
-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'OPERATIONS', 'FINANCE', 'SUPPORT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "adminRole" "AdminRole";

UPDATE "User" SET "adminRole" = 'SUPER_ADMIN' WHERE "role" = 'ADMIN';

-- An admin always has an admin role, and nobody else has one.
ALTER TABLE "User" ADD CONSTRAINT "user_admin_role_matches_role" CHECK (("role" = 'ADMIN') = ("adminRole" IS NOT NULL));
