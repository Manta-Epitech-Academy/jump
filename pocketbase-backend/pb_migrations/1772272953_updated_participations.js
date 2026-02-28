/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660428159")

  // add field
  collection.fields.addAt(2, new Field({
    "cascadeDelete": true,
    "collectionId": "pbc_2651147324",
    "hidden": false,
    "id": "relation2545797546",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "student_migrated",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660428159")

  // remove field
  collection.fields.removeById("relation2545797546")

  return app.save(collection)
})
