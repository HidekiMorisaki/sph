ALTER TABLE "work_calendars"
ADD COLUMN "scheduled_work_minutes_per_day" INTEGER NOT NULL DEFAULT 465;

ALTER TABLE "work_calendars"
ADD CONSTRAINT "work_calendars_scheduled_work_minutes_per_day_check"
CHECK (
    "scheduled_work_minutes_per_day" BETWEEN 15 AND 1440
    AND "scheduled_work_minutes_per_day" % 15 = 0
);
