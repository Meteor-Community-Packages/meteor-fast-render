/* global Package Npm */
Package.describe({
  summary: 'Render your app before the DDP connection even comes alive - magic?',
  version: '4.0.7',
  git: 'https://github.com/Meteor-Community-Packages/meteor-fast-render',
  name: 'communitypackages:fast-render',
});

Npm.depends({
  'cookie-parser': '1.4.6',
});

Package.onUse(function (api) {
  api.versionsFrom(['1.6.1', '2.3']);

  api.use(['communitypackages:picker@1.1.1', 'montiapm:meteorx@2.3.1'], 'server');
  api.use('communitypackages:inject-data@2.3.2');
  api.use(['livedata', 'webapp', 'routepolicy', 'random', 'logging'], 'server');
  api.use(['ecmascript', 'server-render', 'accounts-base', 'ejson', 'minimongo']);

  api.mainModule('lib/client/fast_render.js', 'client');
  api.mainModule('lib/server/fast_render.js', 'server');
});

Package.onTest(function (api) {
  api.use(['meteortesting:browser-tests', 'meteortesting:mocha']);
  api.use(['ecmascript', 'random', 'mongo', 'server-render', 'communitypackages:fast-render']);
  api.use('http', 'server');

  api.mainModule('tests/client/index.js', 'client');
  api.mainModule('tests/server/index.js', 'server');
});
