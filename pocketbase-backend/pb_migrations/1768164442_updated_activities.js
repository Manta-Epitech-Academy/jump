/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_306231341")

  // remove field
  collection.fields.removeById("select2942972832")

  // add field
  collection.fields.addAt(3, new Field({
    "hidden": false,
    "id": "select1459057056",
    "maxSelect": 0,
    "name": "niveaux",
    "presentable": false,
    "required": true,
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
  const collection = app.findCollectionByNameOrId("pbc_306231341")

  // add field
  collection.fields.addAt(3, new Field({
    "hidden": false,
    "id": "select2942972832",
    "maxSelect": 1,
    "name": "difficulte",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "select",
    "values": [
      "Facile",
      "Moyen",
      "Difficile"
    ]
  }))

  // remove field
  collection.fields.removeById("select1459057056")

  return app.save(collection)
})
