-- A preset is archived rather than deleted (write_event_template), as a
-- category is: every preset name is readable over the admin API, so a delete
-- would be one a model could aim on its own.
ALTER TABLE "EventConfig_Template" ADD COLUMN "archivedAt" TIMESTAMP(3);
