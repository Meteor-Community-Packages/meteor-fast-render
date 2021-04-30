/* global Package Npm */
Package.describe({
  summary: 'Render your app before the DDP connection even comes alive - magic?',
  version: '4.0.0',
  git: 'https://github.com/Meteor-Community-Packages/meteor-fast-render',
  name: 'communitypackages:fast-render',
});

Npm.depends({
  'cookie-parser': '1.4.5',
});

Package.onUse(function (api) {
  api.versionsFrom('METEOR@1.6.1');

  api.use(['communitypackages:picker@1.1.0', 'lamhieu:meteorx@2.0.1'], 'server');
  api.use('communitypackages:inject-data@2.3.2', ['client', 'server']);
  api.use(['livedata', 'webapp', 'routepolicy', 'random'], 'server');
  api.use(['ecmascript', 'server-render', 'accounts-base', 'ejson', 'minimongo'], ['client', 'server']);

  api.mainModule('lib/client/fast_render.js', 'client');
  api.mainModule('lib/server/fast_render.js', 'server');
});

Package.onTest(function (api) {
  api.use(['ecmascript'], ['client', 'server']);
  api.use('communitypackages:fast-render', ['client', 'server']);
  api.use('tinytest', ['client', 'server']);
  api.use('http', 'server');
  api.use('random', ['server', 'client']);
  api.use('mongo', ['server', 'client']);
  api.use('server-render', ['server', 'client']);

  api.addFiles(
    [
      'tests/utils.js',
      'tests/client/fast_render.js',
      'tests/client/ddp_update.js',
    ],
    'client',
  );

  api.addFiles(
    ['tests/server/context.js', 'tests/server/integration.js'],
    'server',
  );
});
