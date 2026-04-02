/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2651147324")

  collection.fields.add(new Field({
    "hidden": false,
    "id": "date3917482650",
    "max": "",
    "min": "",
    "name": "charter_accepted_at",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2651147324")

  collection.fields.removeById("date3917482650")

  return app.save(collection)
})
