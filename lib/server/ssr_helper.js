import { Meteor } from 'meteor/meteor'
import { FastRender } from 'meteor/communitypackages:fast-render'
import { InjectData } from 'meteor/communitypackages:inject-data'
import { onPageLoad } from 'meteor/server-render'
import { _ } from 'meteor/underscore'

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

FastRender._mergeFrData = function (req, queryData, extraData) {
	var existingQueryData = InjectData.getData(req, 'fast-render-data')
	var existingExtraData = InjectData.getData(req, 'fast-render-extra-data')
	if (!existingQueryData) {
		InjectData.pushData(req, 'fast-render-data', queryData)
	} else {
		// it's possible to execute this callback twice
		// the we need to merge exisitng data with the new one
		_.extend(existingQueryData.subscriptions, queryData.subscriptions)
		_.each(queryData.collectionData, function (data, pubName) {
			var existingData = existingQueryData.collectionData[pubName]
			if (existingData) {
				data = existingData.concat(data)
			}

			existingQueryData.collectionData[pubName] = data
			InjectData.pushData(req, 'fast-render-data', existingQueryData)
		})
	}

	if (!existingExtraData) {
		InjectData.pushData(req, 'fast-render-extra-data', extraData)
	} else {
		_.extend(existingExtraData, extraData)
		InjectData.pushData(req, 'fast-render-extra-data', existingExtraData)
	}
}

FastRender.onPageLoad = function (callback) {
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
}

FastRender.addExtraData = function (key, data) {
	const frContext = FastRender.frContext.get()
	if (!frContext) {
		throw new Error(
			`Cannot add extra data: ${key} without FastRender Context`
		)
	}
	frContext.addExtraData(key, data)
}
