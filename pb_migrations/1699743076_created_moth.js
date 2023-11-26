/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const collection = new Collection({
    "id": "jfqwscbano6sbn8",
    "created": "2023-11-11 22:51:16.414Z",
    "updated": "2023-11-11 22:51:16.414Z",
    "name": "moth",
    "type": "base",
    "system": false,
    "schema": [
      {
        "system": false,
        "id": "nf4at0xv",
        "name": "date",
        "type": "text",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "pattern": ""
        }
      },
      {
        "system": false,
        "id": "ydfnpv6f",
        "name": "budget",
        "type": "number",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {
          "min": null,
          "max": null,
          "noDecimal": false
        }
      },
      {
        "system": false,
        "id": "jdvxnpfw",
        "name": "compras",
        "type": "json",
        "required": false,
        "presentable": false,
        "unique": false,
        "options": {}
      }
    ],
    "indexes": [],
    "listRule": null,
    "viewRule": null,
    "createRule": null,
    "updateRule": null,
    "deleteRule": null,
    "options": {}
  });

  return Dao(db).saveCollection(collection);
}, (db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("jfqwscbano6sbn8");

  return dao.deleteCollection(collection);
})
