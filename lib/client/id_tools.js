import { MongoID } from 'meteor/mongo-id'

export const IDTools = {
	idParse: MongoID.idParse,
	idStringify: MongoID.idStringify,
	ObjectID: MongoID.ObjectID,
}
