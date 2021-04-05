import { FastRender } from './fast_render'
import { Picker } from 'meteor/communitypackages:picker'
import { IsAppUrl } from './utils'
import cookieParser from 'cookie-parser'

export const fastRenderRoutes = Picker.filter(function (req, res) {
	return IsAppUrl(req)
})

fastRenderRoutes.middleware(cookieParser())
fastRenderRoutes.middleware(function (req, res, next) {
	FastRender.handleOnAllRoutes(req, res, next)
})
