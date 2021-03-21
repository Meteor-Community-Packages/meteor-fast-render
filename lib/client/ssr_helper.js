import { FastRender } from 'meteor/communitypackages:fast-render'
import { InjectData } from 'meteor/communitypackages:inject-data'
import { onPageLoad } from 'meteor/server-render'

FastRender.onPageLoad = function (callback) {
	FastRender.wait()
	onPageLoad(sink => {
		InjectData.getData('fast-render-data', function (data) {
			FastRender.init(data)
			callback(sink)
		})
	})
}
