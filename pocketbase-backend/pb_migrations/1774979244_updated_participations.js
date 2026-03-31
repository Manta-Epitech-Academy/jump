/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660428159")

  // add field
  collection.fields.addAt(10, new Field({
    "hidden": false,
    "id": "number652526091",
    "max": null,
    "min": null,
    "name": "camper_rating",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  // add field
  collection.fields.addAt(11, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text822608831",
    "max": 0,
    "min": 0,
    "name": "camper_feedback",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660428159")

  // remove field
  collection.fields.removeById("number652526091")

  // remove field
  collection.fields.removeById("text822608831")

  return app.save(collection)
})
