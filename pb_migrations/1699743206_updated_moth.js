/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("jfqwscbano6sbn8")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "dzhju8yt",
    "name": "userId",
    "type": "relation",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "collectionId": "_pb_users_auth_",
      "cascadeDelete": false,
      "minSelect": null,
      "maxSelect": 1,
      "displayFields": null
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("jfqwscbano6sbn8")

  // remove
  collection.schema.removeField("dzhju8yt")

  return dao.saveCollection(collection)
})
