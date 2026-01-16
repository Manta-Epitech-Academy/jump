/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660498186")

  // add field
  collection.fields.addAt(4, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_575754128",
    "hidden": false,
    "id": "relation2541086472",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "theme",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660498186")

  // remove field
  collection.fields.removeById("relation2541086472")

  return app.save(collection)
})
