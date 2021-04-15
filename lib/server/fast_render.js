import Fiber from 'fibers'
import { Meteor } from 'meteor/meteor'
import { InjectData } from 'meteor/communitypackages:inject-data'
import { onPageLoad } from 'meteor/server-render'
import PublishContext from './publish_context'
import { Context } from './context'
import { setQueryDataCallback, handleError } from './utils'
import { fastRenderRoutes } from './routes'

const originalSubscribe = Meteor.subscribe
Meteor.subscribe = function (name, ...args) {
	const frContext = FastRender.frContext.get()
	if (!frContext) {
		throw new Error(
			`Cannot add a subscription: ${name} without FastRender Context`
		)
	}
	frContext.subscribe(name, ...args)

	if (originalSubscribe) {
		originalSubscribe.apply(this, arguments)
	}

	return {
		ready: () => true,
	}
}

export const FastRender = {
	_routes: [],
	_onAllRoutes: [],
	_Context: Context,
	frContext: new Meteor.EnvironmentVariable(),

	// handling specific routes
	route (path, callback) {
		if (path.indexOf('/') !== 0) {
			throw new Error(
				'Error: path (' + path + ') must begin with a leading slash "/"'
			)
		}
		fastRenderRoutes.route(path, FastRender.handleRoute.bind(null, callback))
	},

	handleRoute (processingCallback, params, req, res, next) {
		const afterProcessed = setQueryDataCallback(req, next)
		FastRender._processRoutes(params, req, processingCallback, afterProcessed)
	},

	handleOnAllRoutes (req, res, next) {
		const afterProcessed = setQueryDataCallback(req, next)
		FastRender._processAllRoutes(req, afterProcessed)
	},

	onAllRoutes (callback) {
		FastRender._onAllRoutes.push(callback)
	},

	_processRoutes (
		params,
		req,
		routeCallback,
		callback
	) {
		callback = callback || function () { }

		const path = req.url
		const loginToken = req.cookies['meteor_login_token']
		const headers = req.headers

		const context = new FastRender._Context(loginToken, { headers: headers })

		try {
			FastRender.frContext.withValue(context, function () {
				routeCallback.call(context, params, path)
			})

			if (context.stop) {
				return
			}

			callback(context.getData())
		} catch (err) {
			handleError(err, path, callback)
		}
	},

	_processAllRoutes (req, callback) {
		callback = callback || function () { }

		const path = req.url
		const loginToken = req.cookies['meteor_login_token']
		const headers = req.headers

		new Fiber(function () {
			const context = new FastRender._Context(loginToken, { headers: headers })

			try {
				FastRender._onAllRoutes.forEach(function (callback) {
					callback.call(context, req.url)
				})

				callback(context.getData())
			} catch (err) {
				handleError(err, path, callback)
			}
		}).run()
	},

	_mergeFrData (req, queryData, extraData) {
		const existingQueryData = InjectData.getData(req, 'fast-render-data')
		let existingExtraData = InjectData.getData(req, 'fast-render-extra-data')
		if (!existingQueryData) {
			InjectData.pushData(req, 'fast-render-data', queryData)
		} else {
			// it's possible to execute this callback twice
			// the we need to merge exisitng data with the new one
			existingQueryData.subscriptions = { ...existingQueryData.subscriptions, ...queryData.subscriptions }
			for (let [pubName, data] of Object.entries(queryData.collectionData)) {
				const existingData = existingQueryData.collectionData[pubName]
				if (existingData) {
					data = existingData.concat(data)
				}

				existingQueryData.collectionData[pubName] = data
				InjectData.pushData(req, 'fast-render-data', existingQueryData)
			}
		}

		if (!existingExtraData) {
			InjectData.pushData(req, 'fast-render-extra-data', extraData)
		} else {
			existingExtraData = { ...existingExtraData, ...extraData }
			InjectData.pushData(req, 'fast-render-extra-data', existingExtraData)
		}
	},

	onPageLoad (callback) {
		InjectData.injectToHead = false
		onPageLoad(async sink => {
			const frContext = new FastRender._Context(
				sink.request.cookies.meteor_login_token,
				{
					headers: sink.headers,
				}
			)

			await FastRender.frContext.withValue(frContext, async function () {
				await callback(sink)
				const context = FastRender.frContext.get()
				const data = context.getData()
				const extraData = context.getExtraData()
				FastRender._mergeFrData(
					sink.request,
					data,
					extraData
				)
			})
		})
	},

	addExtraData (key, data) {
		const frContext = FastRender.frContext.get()
		if (!frContext) {
			throw new Error(
				`Cannot add extra data: ${key} without FastRender Context`
			)
		}
		frContext.addExtraData(key, data)
	},

	getExtraData () {
		// we provide this method for symmetry to avoid having to use isClient/isServer checks
	}
}

// adding support for null publications
FastRender.onAllRoutes(function () {
	const context = this
	const nullHandlers = Meteor.default_server.universal_publish_handlers

	if (nullHandlers) {
		nullHandlers.forEach(function (publishHandler) {
			// universal subs have subscription ID, params, and name undefined
			const publishContext = new PublishContext(context, publishHandler)
			context.processPublication(publishContext)
		})
	}
})
