/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_306231341")

  // update collection data
  unmarshal({
    "name": "activities"
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_306231341")

  // update collection data
  unmarshal({
    "name": "activites"
  }, collection)

  return app.save(collection)
})
