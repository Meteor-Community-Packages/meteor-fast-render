/* global __fast_render_config */
import { Meteor } from 'meteor/meteor'
import { IDTools } from './id_tools'
import { Accounts } from 'meteor/accounts-base'

export const FastRender = {}
FastRender._dataReceived = false
FastRender._revertedBackToOriginal = false
FastRender.IDTools = IDTools
FastRender._blockDDP =
	Meteor._localStorage.getItem('__frblockddp') === undefined
if (FastRender._blockDDP) {
	console.log(
		"FastRender is blocking DDP messages. apply 'FastRender.debugger.unblockDDP()' to unblock again."
	)
}

FastRender._disable = Meteor._localStorage.getItem('__frdisable') === undefined
if (FastRender._disable) {
	console.log(
		"FastRender is disabled. apply 'FastRender.debugger.enableFR()' to enable it back."
	)
}

FastRender.wait = function() {
	FastRender._wait = true
}

// This allow us to apply DDP message even if Meteor block accepting messages
//  When doing initial login, Meteor sends an login message
//  Then it'll block the accpeting DDP messages from server
//  This is the cure
FastRender.injectDdpMessage = function(conn, message) {
	FastRender['debugger'].log('injecting ddp message:', message)

	// Removed check for conn._bufferedWrites due to https://github.com/kadirahq/fast-render/pull/167/files#r74189260
	// and https://github.com/kadirahq/fast-render/issues/176

	var originalWait = conn._waitingForQuiescence
	conn._waitingForQuiescence = function() {
		return false
	}
	conn._livedata_data(message)
	conn._waitingForQuiescence = originalWait
}

FastRender.init = function(payload) {
	if (FastRender._disable) return

	FastRender._securityCheck(payload)

	FastRender._subscriptions = (payload && payload.subscriptions) || {}
	FastRender._subscriptionIdMap = {}
	FastRender._dataReceived = true
	FastRender._payload = payload

	// merging data from different subscriptions
	//  yes, this is a minimal mergeBox on the client
	var allData = {}
	if (payload) {
		Object.keys(payload.collectionData).forEach(function(collName) {
            const subData = payload.collectionData[collName];
			if (!allData[collName]) {
				allData[collName] = {}
			}
			const collData = allData[collName]

			subData.forEach(function(dataSet) {
				dataSet.forEach(function(item) {
					if (!collData[item._id]) {
						collData[item._id] = item
					} else {
						FastRender._DeepExtend(collData[item._id], item)
					}
				})
			})
		})
	}

	var connection = Meteor.connection

	Object.keys(allData).forEach(function(collName) {
        const collData = allData[collName];
		Object.keys(collData).forEach(function(id) {
            const item = collData[id];
			id = IDTools.idStringify(item._id)
			delete item._id

			var ddpMessage = {
				msg: 'added',
				collection: collName,
				id: id,
				fields: item,
				frGen: true,
			}

			FastRender.injectDdpMessage(connection, ddpMessage)
			try {
				// If the connection supports buffered DDP writes, then flush now.
				if (connection._flushBufferedWrites) connection._flushBufferedWrites()
			} catch (e) {
				console.error(
					'FastRender was unable to simulate the following DDP message: ',
					ddpMessage,
					e
				)
			}
		})
	})

	// let Meteor know, user login process has been completed
	if (typeof Accounts !== 'undefined') {
		Accounts._setLoggingIn(false)
	}
}

FastRender._securityCheck = function(payload) {
	if (payload && payload.loginToken) {
		var localStorageLoginToken = Meteor._localStorage.getItem(
			'Meteor.loginToken'
		)
		if (localStorageLoginToken !== payload.loginToken) {
			throw new Error(
				'seems like cookie tossing is happening. visit here: http://git.io/q4IRHQ'
			)
		}
	}
}

FastRender._AddedToChanged = function(localCopy, added) {
	added.msg = 'changed'
	added.cleared = []
	added.fields = added.fields || {}

	Object.keys(localCopy).forEach(function(key) {
		if (key !== '_id') {
			if (typeof added.fields[key] == 'undefined') {
				added.cleared.push(key)
			}
		}
	})
}

FastRender._ApplyDDP = function(existing, message) {
	var newDoc = !existing ? {} : Object.assign({}, existing)
	if (message.msg === 'added') {
		Object.keys(message.fields).forEach(function(key) {
			newDoc[key] = message.fields[key];
		})
	} else if (message.msg === 'changed') {
		Object.keys(message.fields).forEach(function(key) {
			newDoc[key] = message.fields[key];
		})
		message.cleared.forEach(function(key) {
			delete newDoc[key]
		})
	} else if (message.msg === 'removed') {
		newDoc = null
	}

	return newDoc
}

// source: https://gist.github.com/kurtmilam/1868955
//  modified a bit to not to expose this as an _ api
FastRender._DeepExtend = function deepExtend(obj) {
	var parentRE = /#{\s*?_\s*?}/
	var slice = Array.prototype.slice
	var hasOwnProperty = Object.prototype.hasOwnProperty
	slice.call(arguments, 1).forEach(function(source) {
		for (var prop in source) {
			if (hasOwnProperty.call(source, prop)) {
				if (
					obj[prop] === null ||
					obj[prop] === undefined ||
					typeof obj[prop] === 'function' ||
					source[prop] === null ||
					source[prop] instanceof Date
				) {
					obj[prop] = source[prop]
				} else if (typeof source[prop] === 'string' && parentRE.test(source[prop])) {
					if (typeof obj[prop] === 'string') {
						obj[prop] = source[prop].replace(parentRE, obj[prop])
					}
				} else if (obj[prop] instanceof Array || source[prop] instanceof Array) {
					if (!(obj[prop] instanceof Array) || !(source[prop] instanceof Array)) {
						throw 'Error: Trying to combine an array with a non-array (' +
							prop +
							')'
					} else {
						obj[prop] = FastRender._DeepExtend(obj[prop], source[prop]).filter(
							function(item) {
								return item !== null
							}
						)
					}
				} else if (typeof obj[prop] === 'object' || typeof source[prop] === 'object') {
					if (typeof obj[prop] !== 'object' || typeof source[prop] !== 'object') {
						throw 'Error: Trying to combine an object with a non-object (' +
							prop +
							')'
					} else {
						obj[prop] = FastRender._DeepExtend(obj[prop], source[prop])
					}
				} else {
					obj[prop] = source[prop]
				}
			}
		}
	})
	return obj
}
