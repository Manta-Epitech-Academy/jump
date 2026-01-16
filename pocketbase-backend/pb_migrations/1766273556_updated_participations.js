/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660428159")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX `idx_npMRjUXOUm` ON `participations` (\n  `student`,\n  `session`\n)"
    ]
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660428159")

  // update collection data
  unmarshal({
    "indexes": []
  }, collection)

  return app.save(collection)
})
