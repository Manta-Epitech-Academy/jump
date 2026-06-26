-- AlterTable: explicit admin gate for dev-workspace visibility, decoupled from
-- the module set. NULL = not yet validated by an admin (hidden in the dev
-- workspace even when the event's modules are pre-configured).
ALTER TABLE "Event" ADD COLUMN "devActivatedAt" TIMESTAMP(3);

-- Non-disruptive cutover. The dev switcher used to show any event with at least
-- one module (`resolveWorkspaceEvents` gated on `modules: { some: {} }`).
-- Activate exactly those events so nothing visible today disappears when the
-- gate moves to "is activated". Every other event (no modules, and all future
-- ones) stays NULL = hidden until an admin validates it.
UPDATE "Event" e
SET "devActivatedAt" = CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1 FROM "EventConfig_Module" m WHERE m."eventId" = e."id"
);
