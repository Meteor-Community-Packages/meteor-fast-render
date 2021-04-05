import { Meteor } from 'meteor/meteor'
import Fibers from 'fibers'
import Future from 'fibers/future'
import { Accounts } from 'meteor/accounts-base'
import { DDP } from 'meteor/ddp'
import { Random } from 'meteor/random'
import PublishContext from './publish_context'
import { EJSON } from 'meteor/ejson'

export class Context {
	constructor (loginToken, otherParams) {
		this._collectionData = {}
		this._subscriptions = {}
		this._extraData = {}
		this._loginToken = loginToken

		Object.assign(this, otherParams)

		// get the user
		if (Meteor.users) {
			let user
			// check to make sure, we've the loginToken,
			// otherwise a random user will fetched from the db
			if (loginToken) {
				const hashedToken = loginToken && Accounts._hashLoginToken(loginToken)
				const query = { 'services.resume.loginTokens.hashedToken': hashedToken }
				const options = { fields: { _id: 1 } }
				user = Meteor.users.findOne(query, options)
			}

			// support for Meteor.user
			Fibers.current._meteor_dynamics = []
			Fibers.current._meteor_dynamics[DDP._CurrentInvocation.slot] = this

			if (user) {
				this.userId = user._id
			}
		}
	}

	subscribe (subName /*, params */) {
		const publishHandler = Meteor.default_server.publish_handlers[subName]
		if (publishHandler) {
			const params = Array.prototype.slice.call(arguments, 1)
			// non-universal subs have subscription id
			const subscriptionId = Random.id()
			const publishContext = new PublishContext(
				this,
				publishHandler,
				subscriptionId,
				params,
				subName
			)

			return this.processPublication(publishContext)
		} else {
			console.warn('There is no such publish handler named:', subName)
			return {}
		}
	}

	processPublication (publishContext) {
		const data = {}
		const ensureCollection = (collectionName) => {
			this._ensureCollection(collectionName)
			if (!data[collectionName]) {
				data[collectionName] = []
			}
		}

		const future = new Future()
		// detect when the context is ready to be sent to the client
		publishContext.onStop(function () {
			if (!future.isResolved()) {
				future.return()
			}
		})

		publishContext._runHandler()

		if (!publishContext._subscriptionId) {
			// universal subscription, we stop it (same as marking it as ready) ourselves
			// they otherwise do not have ready or stopped state, but in our case they do
			publishContext.stop()
		}

		if (!future.isResolved()) {
			// don't wait forever for handler to fire ready()
			Meteor.setTimeout(() => {
				if (!future.isResolved()) {
					// publish handler failed to send ready signal in time
					// maybe your non-universal publish handler is not calling this.ready()?
					// or maybe it is returning null to signal empty publish?
					// it should still call this.ready() or return an empty array []
					const message =
						'Publish handler for ' +
						publishContext._name +
						' sent no ready signal\n' +
						' This could be because this publication `return null`.\n' +
						' Use `return this.ready()` instead.'
					console.warn(message)
					future.return()
				}
			}, 500) // arbitrarially set timeout to 500ms, should probably be configurable

			//  wait for the subscription became ready.
			future.wait()
		}

		// stop any runaway subscription
		// this can happen if a publish handler never calls ready or stop, for example
		// it does not hurt to call it multiple times
		publishContext.stop()

		// get the data
		for (let [collectionName, collData] of Object.entries(publishContext._collectionData)) {
			// making an array from a map
			collData = Object.values(collData)

			ensureCollection(collectionName)
			data[collectionName].push(collData)

			// copy the collection data in publish context into the FR context
			this._collectionData[collectionName].push(collData)
		}

		return data
	}

	completeSubscriptions (name, params) {
		let subs = this._subscriptions[name]
		if (!subs) {
			subs = this._subscriptions[name] = {}
		}

		if (params && params.length) {
			const lastParam = params[params.length - 1]
			if (
				lastParam &&
				(lastParam.hasOwnProperty('onStop') ||
					lastParam.hasOwnProperty('onReady'))
			) {
				params.pop()
			}
		}

		subs[EJSON.stringify(params)] = true
	}

	_ensureCollection (collectionName) {
		if (!this._collectionData[collectionName]) {
			this._collectionData[collectionName] = []
		}
	}

	getData () {
		return {
			collectionData: this._collectionData,
			subscriptions: this._subscriptions,
			loginToken: this._loginToken,
		}
	}

	addExtraData (key, data) {
		this._extraData[key] = data
	}

	getExtraData () {
		return this._extraData
	}
}
