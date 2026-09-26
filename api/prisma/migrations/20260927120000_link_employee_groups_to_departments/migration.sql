-- Existing groups predate department ownership. Backfill only when all active
-- employees using a group belong to the same non-null department; otherwise
-- keep the group unassigned until an administrator resolves it.
ALTER TABLE "employee_groups" ADD COLUMN "department_id" INTEGER;

UPDATE "employee_groups" AS employee_group
SET "department_id" = group_usage."department_id"
FROM (
    SELECT "group_id", MIN("department_id") AS "department_id"
    FROM "employees"
    WHERE "group_id" IS NOT NULL
      AND "deleted_at" IS NULL
    GROUP BY "group_id"
    HAVING COUNT(*) FILTER (WHERE "department_id" IS NULL) = 0
       AND COUNT(DISTINCT "department_id") = 1
) AS group_usage
WHERE employee_group."id" = group_usage."group_id";

DROP INDEX "employee_groups_name_key";

CREATE UNIQUE INDEX "employee_groups_department_id_name_key"
ON "employee_groups"("department_id", "name");

-- Preserve a natural key for legacy groups whose department cannot be inferred.
CREATE UNIQUE INDEX "employee_groups_unassigned_name_key"
ON "employee_groups"("name")
WHERE "department_id" IS NULL;

ALTER TABLE "employee_groups"
ADD CONSTRAINT "employee_groups_department_id_fkey"
FOREIGN KEY ("department_id") REFERENCES "departments"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
