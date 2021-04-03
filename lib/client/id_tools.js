import { Minimongo } from 'meteor/minimongo'
export const IDTools = {
	idParse: Minimongo.LocalCollection._idParse,
	idStringify: Minimongo.LocalCollection._idStringify,
	ObjectID: Minimongo.LocalCollection._ObjectID
}
