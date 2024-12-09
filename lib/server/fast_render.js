import { Meteor } from 'meteor/meteor';
import { InjectData } from 'meteor/communitypackages:inject-data';
import { onPageLoad } from 'meteor/server-render';
import PublishContext from './publish_context';
import { Context } from './context';
import { setQueryDataCallback, handleError } from './utils';
import { fastRenderRoutes } from './routes';

const originalSubscribe = Meteor.subscribe;
Meteor.subscribe = function (name, ...args) {
  Meteor.bindEnvironment(function () {
    const frContext = FastRender.frContext.get();
    if (!frContext) {
      throw new Error(
        `Cannot add a subscription: ${name} without FastRender Context`,
      );
    }
    frContext.subscribe(name, ...args);

    if (originalSubscribe) {
      originalSubscribe.apply(this, arguments);
    }

    return {
      ready: () => true,
    };
  });
};

export const FastRender = {
  _routes: [],
  _onAllRoutes: [],
  _Context: Context,
  frContext: DDP._CurrentInvocation,

  // handling specific routes
  route (path, callback) {
    if (path.indexOf('/') !== 0) {
      throw new Error(
        'Error: path (' + path + ') must begin with a leading slash "/"',
      );
    }
    fastRenderRoutes.route(path, FastRender.handleRoute.bind(null, callback));
  },

  async handleRoute (processingCallback, params, req, _res, next) {
    const afterProcessed = setQueryDataCallback(req, next);
    await FastRender._processRoutes(params, req, processingCallback, afterProcessed);
  },

  async handleOnAllRoutes (req, _res, next) {
    const afterProcessed = setQueryDataCallback(req, next);
    await FastRender._processAllRoutes(req, afterProcessed);
  },

  onAllRoutes (callback) {
    FastRender._onAllRoutes.push(callback);
  },

  async _processRoutes (
    params,
    req,
    routeCallback,
    callback,
  ) {
    callback = callback || async function () { };

    const path = req.url;
    const loginToken = req.cookies.meteor_login_token;
    const headers = req.headers;

    const context = await new FastRender._Context(loginToken, { headers: headers }).init();

    try {
      await FastRender.frContext.withValue(context, async function () {
        await routeCallback.call(context, params, path);
      });

      if (context.stop) {
        return;
      }

      await callback(context.getData());
    } catch (err) {
      await handleError(err, path, callback);
    }
  },

  async _processAllRoutes (req, callback) {
    callback = callback || async function () { };

    const path = req.url;
    const loginToken = req.cookies.meteor_login_token;
    const headers = req.headers;

    const context = await new FastRender._Context(loginToken, { headers: headers }).init();

    try {
      for await (const route of FastRender._onAllRoutes) {
        await route.call(context, req.url);
      }

      await callback(context.getData());
    } catch (err) {
      await handleError(err, path, callback);
    }
  },

  _mergeFrData (req, queryData, extraData) {
    const existingQueryData = InjectData.getData(req, 'fast-render-data');
    let existingExtraData = InjectData.getData(req, 'fast-render-extra-data');
    if (!existingQueryData) {
      InjectData.pushData(req, 'fast-render-data', queryData);
    } else {
      // it's possible to execute this callback twice
      // the we need to merge exisitng data with the new one
      existingQueryData.subscriptions = { ...existingQueryData.subscriptions, ...queryData.subscriptions };
      for (let [pubName, data] of Object.entries(queryData.collectionData)) {
        const existingData = existingQueryData.collectionData[pubName];
        if (existingData) {
          data = existingData.concat(data);
        }

        existingQueryData.collectionData[pubName] = data;
        InjectData.pushData(req, 'fast-render-data', existingQueryData);
      }
    }

    if (!existingExtraData) {
      InjectData.pushData(req, 'fast-render-extra-data', extraData);
    } else {
      existingExtraData = { ...existingExtraData, ...extraData };
      InjectData.pushData(req, 'fast-render-extra-data', existingExtraData);
    }
  },

  async onPageLoad (callback) {
    InjectData.injectToHead = false;
    onPageLoad(async sink => {
      const frContext = await new FastRender._Context(
        sink.request.cookies.meteor_login_token,
        {
          headers: sink.headers,
        },
      ).init();

      await FastRender.frContext.withValue(frContext, async function () {
        const context = FastRender.frContext.get();
        const data = context.getData();
        const extraData = context.getExtraData();
        FastRender._mergeFrData(
          sink.request,
          data,
          extraData,
        );
        await callback(sink);
      });
    });
  },

  addExtraData (key, data) {
    const frContext = FastRender.frContext.get();
    if (!frContext) {
      throw new Error(
        `Cannot add extra data: ${key} without FastRender Context`,
      );
    }
    frContext.addExtraData(key, data);
  },

  getExtraData () {
    // we provide this method for symmetry to avoid having to use isClient/isServer checks
  },
};

// adding support for null publications
FastRender.onAllRoutes(async function () {
  const context = this;
  const nullHandlers = Meteor.server.universal_publish_handlers;

  if (nullHandlers) {
    const processedPublications = nullHandlers.map(async function (publishHandler) {
      // universal subs have subscription ID, params, and name undefined
      const publishContext = new PublishContext(context, publishHandler);
      return await context.processPublication(publishContext);
    });
    await Promise.all(processedPublications);
  }
});
