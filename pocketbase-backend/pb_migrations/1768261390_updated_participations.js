/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660428159")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX `idx_npMRjUXOUm` ON `participations` (\n  `student`,\n  `event`\n)"
    ]
  }, collection)

  // update field
  collection.fields.addAt(2, new Field({
    "cascadeDelete": true,
    "collectionId": "pbc_3660498186",
    "hidden": false,
    "id": "relation3494172116",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "event",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660428159")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX `idx_npMRjUXOUm` ON `participations` (\n  `student`,\n  `session`\n)"
    ]
  }, collection)

  // update field
  collection.fields.addAt(2, new Field({
    "cascadeDelete": true,
    "collectionId": "pbc_3660498186",
    "hidden": false,
    "id": "relation3494172116",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "session",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
})
