/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_575754128")

  // add field
  collection.fields.addAt(2, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_3231818481",
    "hidden": false,
    "id": "relation2634639377",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "campus",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_575754128")

  // remove field
  collection.fields.removeById("relation2634639377")

  return app.save(collection)
})
