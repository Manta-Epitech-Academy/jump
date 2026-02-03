/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_575754128")

  // update collection data
  unmarshal({
    "createRule": "campus = @request.auth.campus",
    "deleteRule": "campus = @request.auth.campus",
    "updateRule": "campus = @request.auth.campus"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_575754128")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\"",
    "deleteRule": null,
    "updateRule": "@request.auth.id != \"\""
  }, collection)

  return app.save(collection)
})
