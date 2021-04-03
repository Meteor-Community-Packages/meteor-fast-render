import { Meteor } from 'meteor/meteor'
import { FastRender } from './fast_render'
import { InjectData } from 'meteor/communitypackages:inject-data'

FastRender.onDataReady = function (callback) {
	FastRender.wait()
	InjectData.getData('fast-render-data', function (data) {
		FastRender.init(data)
		InjectData.getData('fast-render-extra-data', function (payload) {
			FastRender._setExtraData(payload)
			callback()
		})
	})
}

Meteor.startup(function () {
	if (!FastRender._wait) {
		InjectData.getData('fast-render-data', function (payload) {
			FastRender.init(payload)
		})

		InjectData.getData('fast-render-extra-data', function (payload) {
			FastRender._setExtraData(payload)
		})
	}
})
