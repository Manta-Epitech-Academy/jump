/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Enable cascade delete on portfolio_items.event
  const portfolioItems = app.findCollectionByNameOrId("pbc_3523882650")
  portfolioItems.fields.addAt(2, new Field({
    "cascadeDelete": true,
    "collectionId": "pbc_3660498186",
    "hidden": false,
    "id": "relation1001261735",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "event",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "relation"
  }))
  app.save(portfolioItems)

  // Enable cascade delete on steps_progress.event
  const stepsProgress = app.findCollectionByNameOrId("pbc_2742442020")
  stepsProgress.fields.addAt(2, new Field({
    "cascadeDelete": true,
    "collectionId": "pbc_3660498186",
    "hidden": false,
    "id": "relation1001261735",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "event",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "relation"
  }))
  app.save(stepsProgress)
}, (app) => {
  // Revert: disable cascade delete on portfolio_items.event
  const portfolioItems = app.findCollectionByNameOrId("pbc_3523882650")
  portfolioItems.fields.addAt(2, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_3660498186",
    "hidden": false,
    "id": "relation1001261735",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "event",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "relation"
  }))
  app.save(portfolioItems)

  // Revert: disable cascade delete on steps_progress.event
  const stepsProgress = app.findCollectionByNameOrId("pbc_2742442020")
  stepsProgress.fields.addAt(2, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_3660498186",
    "hidden": false,
    "id": "relation1001261735",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "event",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "relation"
  }))
  app.save(stepsProgress)
})
