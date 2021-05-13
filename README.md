# Fast Render

Fast Render can improve the initial load time of your app, giving you 2-10 times faster initial page loads.

> This is a continuation of `meteorhacks:fast-render` by @arunoda

## Table of Contents
<!-- TOC depthFrom:1 depthTo:6 withLinks:1 updateOnSave:1 orderedList:0 -->
- [Table of Contents](#table-of-contents)
- [Usage](#usage)
- [How Fast Render Works](#how-fast-render-works)
- [Client-side timing control](#client-side-timing-control)
- [SSR API](#ssr-api)
  - [View layer specific SSR packages](#view-layer-specific-ssr-packages)
  - [What else can we do?](#what-else-can-we-do)
- [Extra Data API](#extra-data-api)
  - [FastRender.addExtraData('key', data)](#fastrenderaddextradatakey-data)
  - [FastRender.getExtraData('key')](#fastrendergetextradatakey)
- [Route API](#route-api)
  - [FastRender.route(callback)](#fastrenderroutecallback)
  - [FastRender.onAllRoutes(callback)](#fastrenderonallroutescallback)
- [Security](#security)
  - [Side Effects](#side-effects)
  - [CORS Headers](#cors-headers)
  - [Cookie Tossing](#cookie-tossing)
- [Known Issues](#known-issues)
  - [Client Error: "Server sent add for existing id"](#client-error-server-sent-add-for-existing-id)
  - [No data is injected when using "AppCache" package](#no-data-is-injected-when-using-appcache-package)
  - [No data is injected when using Meteor Subscription Cache](#no-data-is-injected-when-using-meteor-subscription-cache)
- [Debugging](#debugging)
  - [Block DDP](#block-ddp)
  - [Get Payload](#get-payload)
  - [Disable Fast Render](#disable-fast-render)
  - [Logs](#logs)
- [Development](#development)
  - [Setup](#setup)
  - [Testing](#testing)
  - [Committing Changes](#committing-changes)
<!-- /TOC -->

## Usage

Add Fast Render to your Meteor app:

```sh
meteor add communitypackages:fast-render
```

After that, either make sure you've moved any code that calls `Meteor.subscribe` to shared code space (client and server), or use the SSR, Route, or Extra Data API's to make data available on the client immediately upon page load.

## How Fast Render Works

Fast render runs on the server and gets the subscription data relavant to the page you are loading. Then it sends that data as part of the initial HTML of the Meteor app as shown below:

![Meteor Subscription Data with Initial HTML](https://cldup.com/RFgMhjv7qR.png)

Then Fast Render parses and loads that data into Meteor collections. This makes your Meteor app code think the data connection has been made, and it renders the page right away.

## Client-side timing control

If your app calls subscriptions before FastRender has loaded it's data, you may get errors such as `Expected to find a document not present for an add` when you page loads on the client. To avoid these errors when not using the SSR API, use the `FastRender.onDataReady` method.

```js
FastRender.onDataReady(() => {
  // It is now safe to render your UI and make subscription calls
});
```

## SSR API

Fast Render comes with helpers for server-side rendering

FastRender will track subscriptions and load their data after your initial HTML render has been sent. The data will be immediately available for hydrating on the client. Use `FastRender.onPageLoad` instead of Meteor's `server-render` `onPageLoad`. You can use `Meteor.subscribe` in your UI code and the data will automatically be appended to the HTML document.

On the server:

```js
FastRender.onPageLoad(sink => {
 sink.renderIntoElementById('app', renderToString(<App />))
})
```

On the client:

```js
FastRender.onPageLoad(async sink => {
 const App = (await import('/imports/components/App/App')).default
 ReactDOM.hydrate(<App />, document.getElementById('app'))
})
```

**Let's talk about hydration:** This is a great opportunity to make fast server-side rendered applications. Your HTML output can be rendered in a stream to the client, and the JS is only loaded and parsed once the HTML has been fully rendered. The data added by this method would not slow down the initial load time (when using streams). By injecting all of the necessary data after the HTML, the page can be rendered by the server and loaded on the client very quickly, and then the client can hydrate the DOM as soon as the JS payload loads, without then waiting for the data to load. Keep an eye on Meteor's support for `renderToNodeStream`.

### View layer specific SSR packages

Sometimes you just want to plug things in and have them work without having to wire them up, and so the following is hopefully an ever growing list of packages that build upon this one to simplify the creation of server rendered app for specific view layers. If you create a package that uses this one to provide SSR for a specific view layer, open a PR and list it here.

- [communitypackages:react-router-ssr](https://packosphere.com/communitypackages/react-router-ssr)

### What else can we do?

- Critical CSS - We can inline the CSS used by components (css-modules, etc.) and defer loading of the main stylesheet
- Support for dynamically loaded components (react-loadable, etc.)

## Extra Data API

In some instances your app may need to fetch data through methods that don't use the pub/sub paradigm. For instance your UI loads data from an external API or through a Meteor method call. In this case FastRender doesn't have an automatic way get an insert this data into your UI, but you can use the following API to add the data to the initial page HTML and retrieve it on the client when the UI loads.

### FastRender.addExtraData('key', data)

On the server, this method allows you to add arbitrary data to the client payload that will be available under the 'key' using `FastRender.getExtraData` after the page loads on the client.

On the client this method is a NOOP and is provided strictly so that you don't have to use client/server checks to avoid errors.

### FastRender.getExtraData('key')

On the client, this method returns the data that was added to the payload under the `key`. Once this has been called for a certain `key`, further calls for that same `key` will return `null`. This is to have server data available when the page first loads, but subsequently load fresh data. For instance when routing and you get data for the page from fast render initially, but the next time the user visits the route in the app without refreshing the page, fresh data should be fetched.

On the server this method is a NOOP and is provided strictly so that you don't have to use client/server checks to avoid errors.

## Route API

If you're doing some custom subscription handling, Fast Render won't be able to identify those subscriptions.

If you want to use Fast Render in these cases, you'll need to map subscriptions manually to routes. It can be done using the following APIs:

> The following APIs are available on the server only.

### FastRender.route(callback)

This declares server side routes using a URL pattern similar to Iron Router's. The callback runs in a context very similar to Meteor and you can use any Meteor APIs inside it (it runs on a Fiber). Inside, you can subscribe to publications using `this.subscribe`.

Use it like this:

```js
FastRender.route('/leaderboard/:date', function(params) {
 this.subscribe('leaderboard', params.date)
})
```

### FastRender.onAllRoutes(callback)

This is very similar to `FastRender.route`, but lets you register a callback which will run on all routes.

Use it like this:

```js
FastRender.onAllRoutes(function(path) {
 this.subscribe('currentUser')
})
```

## Security

Fast Render has the ability to get data related to a user by detecting `loggedIn` status. It does this by sending the same loginToken used by the DDP connection using cookies.

This is not inherently bad, but this might potentially cause some security issues. Those issues are described below along with possible countermeasures. Fortunately, Fast Render has features to prevent some of them.

> These issues were raised by [Emily Stark](https://twitter.com/estark37) from the [meteor-core team](https://groups.google.com/forum/#!msg/meteor-talk/1Fg4rNk9JZM/ELX3672QsrEJ).

### Side Effects

It is possible to send custom HTTP requests to routes handled by Fast Render either using an XHR request or a direct HTTP request.

So if you are doing some DB write operations or saving something to the filesystem, the code sent will be executed. this could be bad if the HTTP request is an XHR request called by a malicious user. They wouldn't be able read anything, but they could cause side effects.

It is wise to avoid side effects from following places:

- publications
- fastRender routes

### CORS Headers

If your app adds [CORS](http://en.wikipedia.org/wiki/Cross-origin_resource_sharing) headers via connect handlers, there is a potential security issue.

Fast Render detects CORS headers with conflicting routes and turns off fast rendering for those routes.

It's okay to add CORS headers to custom server side routes, but if they conflict with the client side routes (which are handled by Fast Render), then there will be a security issue. It would allow malicious XHR requests from other domains to access loggedIn user's subscription data.

### Cookie Tossing

If your app is available under a shared domain like `*.meteor.com` or `*.herokuapp.com`, there is a potential [security issue](https://groups.google.com/forum/#!topic/meteor-talk/Zhy1c6MdOH8).

**We've made some [protection](https://groups.google.com/d/msg/meteor-talk/LTO2n5D1bxY/J5EnVpJo0rAJ) to this issue; so you can still use Fast Render.**

If you host your app under `*.meteor.com` etc. but use a separate domain, then your app will not be vulnerable in this way.

## Known Issues

### Client Error: "Server sent add for existing id"

If you are getting this issue, it seems like you are doing a database write operation inside a `Template.rendered` (Template.yourTemplate.rendered).

To get around with this issue, rather than invoking a DB operation with MiniMongo, try to invoke a method call.

Related Issue & Discussion: <https://github.com/meteorhacks/fast-render/issues/80>

### No data is injected when using "AppCache" package

Currently FastRender does not support simultaneous usage with [appcache package](https://atmospherejs.com/meteor/appcache)

Related Issue & Discussion: <https://github.com/kadirahq/fast-render/issues/136>

### No data is injected when using Meteor Subscription Cache

When using the subscache package (`ccorcos:subs-cache` or `blockrazor:subscache-c4`) the parameters passed to the subscription must the identical on both Fast Render and Subscache or no data will be injected.

## Debugging

Sometimes, you need to test whether Fast Render is working or not. You can do this using the built-in debugger. The debugger works on the client and is safe to run it on a deployed app. It has a few useful features:

### Block DDP

You can block the DDP connection and check whether the page was fast rendered or not. Once blocked, no DDP messages will be accepted. To block, apply following command in the browser console:

```js
FastRender.debugger.blockDDP()
```

You can unblock it with:

```js
FastRender.debugger.unblockDDP()
```

### Get Payload

With the following command you can inspect the data that comes on a Fast Render page load:

```js
FastRender.debugger.getPayload()
```

It will be in this format:

```js
{
  // subscriptions processed
  subscriptions: {
    courses: true,
    leaderBoard: true
  },

  // data grouped by collection name
  data: {
    courses: [
      [...],
    ],
    users: [
      [...]
    ]
  }
}
```

> You can also apply `FastRender.debugger.getPayloadJSON()` to get the logs as a JSON string.

### Disable Fast Render

You can also use a command to disable Fast Render:

```js
FastRender.debugger.disableFR()
```

Re-enable it with:

```js
FastRender.debugger.enableFR()
```

### Logs

Fast Render has robust logging.

You can turn it on using `FastRender.debugger.showLogs()`.

Hide them again using `FastRender.debugger.hideLogs()`.

You can get all of the log messages by using `FastRender.debugger.getLogs()` and `FastRender.debugger.getLogsJSON()`.

## Development

This repo contains various tooling setups to help you keep code well formatted with consistent style, as well as tests to help ensure that your code changes don't break functionality. The following information will help you get started.

### Setup

1. Clone the repository

    ```sh
    git clone https://github.com/Meteor-Community-Packages/meteor-fast-render.git
    ```

    ```sh
    cd meteor-fast-render
    ```

2. Install Dependencies

   ```sh
   npm install
   ```

3. Install Optional Editor Specific Extensions
   - Editor Config - automatically configure spacing and line breaks
   - ESLint - show realtime JavaScript linting errors in editor
   - Markdown Linter - show realtime Markdown linting errors in the editor (markdownlint by *David Anson* for VSCode)
   - Markdown TOC generator - automatically keep Table of Contents up to date in README. (Markdown All in One by *Yu Zhang* for VSCode is a great extension for this.)

These extensions are optional but they will help youto have consistent whitespace when switching projects, to spot issues sooner, and keep the TOC automaticallu up to date when making changes to markdown files.

### Testing

This repo contains tests to help reduce bugs and breakage. Before committing and submitting your changes, you should run the tests and make sure they pass. Follow these steps to run the tests for this repo.

1. From the project directory, move into the testApp directory

    ```sh
    cd testApp
    ```

2. Run Setup

    ```sh
    npm run setup
    ```

3. Run Tests

    ```sh
    npm test
    ```

    ```sh
    npm run test:watch
    ```

### Committing Changes

Upon commit, this repo will run a pre-commit hook to lint your changes. Minor fixable linting errors will be automatically fixed before commit. If the errors are not fixable, a message will be dispalyed and you will need to fix the errors before commiting the changes.
