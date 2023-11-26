/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("ied5ffp8b0ejvdi")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "2mlg5si4",
    "name": "spent",
    "type": "number",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "min": null,
      "max": null,
      "noDecimal": false
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("ied5ffp8b0ejvdi")

  // remove
  collection.schema.removeField("2mlg5si4")

  return dao.saveCollection(collection)
})
