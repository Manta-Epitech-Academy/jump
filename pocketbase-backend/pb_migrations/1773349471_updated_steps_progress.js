/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2742442020")

  // update collection data
  unmarshal({
    "listRule": "student = @request.auth.id || @request.auth.collectionName = \"users\""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2742442020")

  // update collection data
  unmarshal({
    "listRule": "student = @request.auth.id"
  }, collection)

  return app.save(collection)
})
