/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3827815851");

  return app.delete(collection);
}, (app) => {
  const collection = new Collection({
    "createRule": "campus = @request.auth.campus",
    "deleteRule": "campus = @request.auth.campus",
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "hidden": false,
        "id": "text3208210256",
        "max": 15,
        "min": 15,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text1819170229",
        "max": 0,
        "min": 1,
        "name": "nom",
        "pattern": "",
        "presentable": true,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text2787480667",
        "max": 0,
        "min": 1,
        "name": "prenom",
        "pattern": "",
        "presentable": true,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "exceptDomains": null,
        "hidden": false,
        "id": "email3885137012",
        "name": "old_email",
        "onlyDomains": null,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "email"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text1146066909",
        "max": 0,
        "min": 0,
        "name": "phone",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "exceptDomains": null,
        "hidden": false,
        "id": "email732162263",
        "name": "parent_email",
        "onlyDomains": null,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "email"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text2289959806",
        "max": 0,
        "min": 0,
        "name": "parent_phone",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "select1272968043",
        "maxSelect": 1,
        "name": "niveau",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "select",
        "values": [
          "6eme",
          "5eme",
          "4eme",
          "3eme",
          "2nde",
          "1ere",
          "Terminale",
          "Sup"
        ]
      },
      {
        "hidden": false,
        "id": "select4226200941",
        "maxSelect": 1,
        "name": "niveau_difficulte",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "select",
        "values": [
          "Débutant",
          "Intermédiaire",
          "Avancé"
        ]
      },
      {
        "hidden": false,
        "id": "number4131033149",
        "max": null,
        "min": 0,
        "name": "xp",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "hidden": false,
        "id": "number1754788175",
        "max": null,
        "min": 0,
        "name": "events_count",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "cascadeDelete": false,
        "collectionId": "pbc_3231818481",
        "hidden": false,
        "id": "relation2634639377",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "campus",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "hidden": false,
        "id": "autodate2990389176",
        "name": "created",
        "onCreate": true,
        "onUpdate": false,
        "presentable": false,
        "system": false,
        "type": "autodate"
      },
      {
        "hidden": false,
        "id": "autodate3332085495",
        "name": "updated",
        "onCreate": true,
        "onUpdate": true,
        "presentable": false,
        "system": false,
        "type": "autodate"
      }
    ],
    "id": "pbc_3827815851",
    "indexes": [
      "CREATE UNIQUE INDEX `idx_student_identity_unique` ON `old_students` (\n  `campus`,\n  `nom`,\n  `prenom`,\n  `old_email`\n)"
    ],
    "listRule": "campus = @request.auth.campus",
    "name": "old_students",
    "system": false,
    "type": "base",
    "updateRule": "campus = @request.auth.campus",
    "viewRule": "campus = @request.auth.campus"
  });

  return app.save(collection);
})
