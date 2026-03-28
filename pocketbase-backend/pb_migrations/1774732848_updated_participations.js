/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660428159")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX `idx_participation_lookup` ON `participations` (\n  `campus`,\n  `event`,\n  `student`\n)"
    ]
  }, collection)

  // remove field
  collection.fields.removeById("relation3072569139")

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660428159")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX `idx_participation_lookup` ON `participations` (\n  `campus`,\n  `event`,\n  `old_student`\n)"
    ]
  }, collection)

  // add field
  collection.fields.addAt(1, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_3827815851",
    "hidden": false,
    "id": "relation3072569139",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "old_student",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
})
