/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_306231341")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX `idx_subject_hybrid` ON `subjects` (`campus`)"
    ]
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_306231341")

  // update collection data
  unmarshal({
    "indexes": []
  }, collection)

  return app.save(collection)
})
