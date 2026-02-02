/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660428159")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX `idx_participation_lookup` ON `participations` (\n  `campus`,\n  `event`,\n  `student`\n)"
    ]
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660428159")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX `idx_npMRjUXOUm` ON `participations` (\n  `student`,\n  `event`\n)"
    ]
  }, collection)

  return app.save(collection)
})
