import { Meteor } from 'meteor/meteor';

// getting tokens for the first time
//  Meteor calls Meteor._localStorage.setItem() on the boot
//  But we can do it ourselves also with this
Meteor.startup(function () {
  resetToken();
});

// override Meteor._localStorage methods and resetToken accordingly
const originalSetItem = Meteor._localStorage.setItem;
Meteor._localStorage.setItem = function (key, value) {
  if (key === 'Meteor.loginToken') {
    Meteor.defer(resetToken);
  }
  originalSetItem.call(Meteor._localStorage, key, value);
};

const originalRemoveItem = Meteor._localStorage.removeItem;
Meteor._localStorage.removeItem = function (key) {
  if (key === 'Meteor.loginToken') {
    Meteor.defer(resetToken);
  }
  originalRemoveItem.call(Meteor._localStorage, key);
};

function resetToken () {
  const loginToken = Meteor._localStorage.getItem('Meteor.loginToken');
  const loginTokenExpires = new Date(
    Meteor._localStorage.getItem('Meteor.loginTokenExpires'),
  );

  if (loginToken) {
    setToken(loginToken, loginTokenExpires);
  } else {
    setToken(null, -1);
  }
}

function setToken (loginToken, expires) {
  let cookieString = `meteor_login_token=${encodeURIComponent(loginToken ?? '')}`;
  let date;

  if (typeof expires === 'number') {
    date = new Date();
    date.setDate(date.getDate() + expires);
  } else {
    date = expires;
  }
  cookieString += `; expires=${date.toUTCString()}; path=/`;

  document.cookie = cookieString;
}
