import { FastRender } from 'meteor/staringatlights:fast-render'
import { InjectData } from 'meteor/staringatlights:inject-data'
import { onPageLoad } from 'meteor/server-render'
import { Tracker } from 'meteor/tracker'

FastRender.onPageLoad = function(callback) {
	FastRender.wait()
	onPageLoad(sink => {
		InjectData.getData('fast-render-data', function(data) {
			// Wait for FastRender to set the user's login state before rendering
			Tracker.autorun(function(c) {
				if (Meteor.loggingIn()) {
					return
				} else {
					c.stop()
				}
				FastRender.init(data)
				callback(sink)
			})
		})
	})
}
