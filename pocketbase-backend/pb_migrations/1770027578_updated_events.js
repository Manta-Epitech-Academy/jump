/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660498186")

  // update collection data
  unmarshal({
    "createRule": "campus = @request.auth.campus",
    "deleteRule": "campus = @request.auth.campus",
    "listRule": "campus = @request.auth.campus",
    "updateRule": "campus = @request.auth.campus",
    "viewRule": "campus = @request.auth.campus"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660498186")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\"",
    "deleteRule": "@request.auth.id != \"\"",
    "listRule": "@request.auth.id != \"\"",
    "updateRule": "@request.auth.id != \"\"",
    "viewRule": "@request.auth.id != \"\""
  }, collection)

  return app.save(collection)
})
