/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2651147324")

  // add field
  collection.fields.addAt(14, new Field({
    "hidden": false,
    "id": "select2599078931",
    "maxSelect": 1,
    "name": "level",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "Novice",
      "Apprentice",
      "Expert"
    ]
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2651147324")

  // remove field
  collection.fields.removeById("select2599078931")

  return app.save(collection)
})
