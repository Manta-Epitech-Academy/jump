/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660498186")

  collection.fields.addAt(collection.fields.length, new Field({
    "hidden": false,
    "id": "text_pin",
    "maxSize": 4,
    "min": 4,
    "name": "pin",
    "pattern": "^[0-9]{4}$",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660498186")

  collection.fields.removeByName("pin")

  return app.save(collection)
})
