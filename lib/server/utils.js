import { RoutePolicy } from 'meteor/routepolicy';
import { Log } from 'meteor/logging';
import { InjectData } from 'meteor/communitypackages:inject-data';

// meteor algorithm to check if this is a meteor serving http request or not
export const IsAppUrl = (req) => {
  const url = req.url;
  if (url === '/favicon.ico' || url === '/robots.txt') {
    return false;
  }

  // NOTE: app.manifest is not a web standard like favicon.ico and
  // robots.txt. It is a file name we have chosen to use for HTML5
  // appcache URLs. It is included here to prevent using an appcache
  // then removing it from poisoning an app permanently. Eventually,
  // once we have server side routing, this won't be needed as
  // unknown URLs with return a 404 automatically.
  if (url === '/app.manifest') {
    return false;
  }

  // Avoid serving app HTML for declared routes such as /sockjs/.
  if (RoutePolicy.classify(url)) {
    return false;
  }

  // we only need to support HTML pages only
  // this is a check to do it
  return /html/.test(req.headers.accept);
};

export const setQueryDataCallback = (req, next) => {
  return function (queryData) {
    if (!queryData) return next();

    const existingPayload = InjectData.getData(req, 'fast-render-data');
    if (!existingPayload) {
      InjectData.pushData(req, 'fast-render-data', queryData);
    } else {
      // it's possible to execute this callback twice
      // the we need to merge exisitng data with the new one
      existingPayload.subscriptions = { ...existingPayload.subscriptions, ...queryData.subscriptions };
      for (let [pubName, data] of Object.entries(queryData.collectionData)) {
        const existingData = existingPayload.collectionData[pubName];
        if (existingData) {
          data = existingData.concat(data);
        }

        existingPayload.collectionData[pubName] = data;
        InjectData.pushData(req, 'fast-render-data', existingPayload);
      }
    }
    next();
  };
};

export const handleError = async (err, path, callback) => {
  const message = 'error on fast-rendering path: ' + path + ' ; error: ' + err.stack;
  Log.error(message);
  await callback(null);
};
