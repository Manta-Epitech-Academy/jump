/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660498186")

  // remove field
  collection.fields.removeById("select3848597695")

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660498186")

  // add field
  collection.fields.addAt(3, new Field({
    "hidden": false,
    "id": "select3848597695",
    "maxSelect": 1,
    "name": "statut",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "planifiee",
      "en_cours",
      "terminee"
    ]
  }))

  return app.save(collection)
})
