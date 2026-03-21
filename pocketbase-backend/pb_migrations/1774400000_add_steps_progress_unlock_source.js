/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2742442020")

  collection.fields.add(new Field({
    "hidden": false,
    "id": "select1948503210",
    "maxSelect": 1,
    "name": "last_unlock_source",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "student",
      "staff"
    ]
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2742442020")

  collection.fields.removeById("select1948503210")

  return app.save(collection)
})
