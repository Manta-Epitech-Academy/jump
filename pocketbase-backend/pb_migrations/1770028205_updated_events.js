/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660498186")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX `idx_event_campus_date` ON `events` (\n  `campus`,\n  `date`\n)"
    ]
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660498186")

  // update collection data
  unmarshal({
    "indexes": []
  }, collection)

  return app.save(collection)
})
