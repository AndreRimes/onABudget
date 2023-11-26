/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("jfqwscbano6sbn8")

  collection.name = "month"

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("jfqwscbano6sbn8")

  collection.name = "moth"

  return dao.saveCollection(collection)
})
