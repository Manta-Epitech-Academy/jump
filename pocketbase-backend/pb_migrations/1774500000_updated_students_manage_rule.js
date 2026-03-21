/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2651147324");

  collection.manageRule = "campus = @request.auth.campus";

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2651147324");

  collection.manageRule = null;

  return app.save(collection);
})
