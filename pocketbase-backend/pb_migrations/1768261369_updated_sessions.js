/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660498186")

  // update collection data
  unmarshal({
    "name": "events"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3660498186")

  // update collection data
  unmarshal({
    "name": "sessions"
  }, collection)

  return app.save(collection)
})
