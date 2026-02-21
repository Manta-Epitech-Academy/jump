/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3827815851")

  // add field
  collection.fields.addAt(8, new Field({
    "hidden": false,
    "id": "select4226200941",
    "maxSelect": 1,
    "name": "niveau_difficulte",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "Débutant",
      "Intermédiaire",
      "Avancé"
    ]
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3827815851")

  // remove field
  collection.fields.removeById("select4226200941")

  return app.save(collection)
})
