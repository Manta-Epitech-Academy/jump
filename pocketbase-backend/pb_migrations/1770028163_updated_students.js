/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3827815851")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE UNIQUE INDEX `idx_student_identity_unique` ON `students` (\n  `campus`,\n  `nom`,\n  `prenom`,\n  `email`\n)"
    ]
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3827815851")

  // update collection data
  unmarshal({
    "indexes": []
  }, collection)

  return app.save(collection)
})
