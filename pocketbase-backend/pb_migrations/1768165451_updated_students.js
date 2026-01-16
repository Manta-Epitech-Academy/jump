/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3827815851")

  // add field
  collection.fields.addAt(5, new Field({
    "hidden": false,
    "id": "number1754788175",
    "max": null,
    "min": 0,
    "name": "sessions_count",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3827815851")

  // remove field
  collection.fields.removeById("number1754788175")

  return app.save(collection)
})
