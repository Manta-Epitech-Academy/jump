/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2742442020")

  collection.indexes = collection.indexes || []

  collection.indexes.push(
    "CREATE INDEX idx_steps_progress_lookup ON steps_progress (student, subject, event)",
    "CREATE INDEX idx_steps_progress_event ON steps_progress (event)"
  )

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2742442020")

  collection.indexes = (collection.indexes || []).filter(
    (idx) => !idx.includes("idx_steps_progress_lookup") && !idx.includes("idx_steps_progress_event")
  )

  return app.save(collection)
})
