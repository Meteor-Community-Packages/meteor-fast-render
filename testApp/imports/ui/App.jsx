import React from 'react';
import { Hello } from './Hello.jsx';
import { Info } from './Info.jsx';
import { FastRender } from 'meteor/communitypackages:fast-render';
import { LinksCollection } from '../api/links.js';

export const App = () => {
    console.log(FastRender.debugger.getPayload());
    console.log(LinksCollection.find().fetch());
    return (
        <div className="max-w-3xl min-h-screen mx-auto sm:pt-10">
            <Hello />
            <Info />
        </div>
    );
};
