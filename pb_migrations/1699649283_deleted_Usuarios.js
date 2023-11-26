/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("bapmomrth03aato");

  return dao.deleteCollection(collection);
}, (db) => {
  const collection = new Collection({
    "id": "bapmomrth03aato",
    "created": "2023-11-10 20:39:59.013Z",
    "updated": "2023-11-10 20:41:47.577Z",
    "name": "Usuarios",
    "type": "auth",
    "system": false,
    "schema": [],
    "indexes": [],
    "listRule": "",
    "viewRule": "",
    "createRule": "",
    "updateRule": "",
    "deleteRule": "",
    "options": {
      "allowEmailAuth": true,
      "allowOAuth2Auth": true,
      "allowUsernameAuth": true,
      "exceptEmailDomains": null,
      "manageRule": null,
      "minPasswordLength": 5,
      "onlyEmailDomains": null,
      "requireEmail": false
    }
  });

  return Dao(db).saveCollection(collection);
})
