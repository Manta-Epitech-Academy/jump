/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3827815851")

  // add field
  collection.fields.addAt(2, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text2787480667",
    "max": 0,
    "min": 1,
    "name": "prenom",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(3, new Field({
    "hidden": false,
    "id": "select1272968043",
    "maxSelect": 1,
    "name": "niveau",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "6eme",
      "5eme",
      "4eme",
      "3eme",
      "2nde",
      "1ere",
      "Terminale",
      "Sup"
    ]
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3827815851")

  // remove field
  collection.fields.removeById("text2787480667")

  // remove field
  collection.fields.removeById("select1272968043")

  return app.save(collection)
})
