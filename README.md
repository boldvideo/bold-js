<div align="center">
    <a href="https://boldvideo.com?utm_source=github.com&utm_medium=readme&utm_campaign=bold-js" align="center">
		<img src="https://boldvideo.com/bold-js-github-header.svg"  alt="Bold Logo">
	</a>
	<h1 align="center rainbow">@boldvideo/bold-js</h1>
    <p align="center">
        The JavaScript SDK for interacting with the <a href="https://boldvideo.com?utm_source=github.com&utm_medium=readme&utm_campaign=bold-js" target="_blank">Bold API</a>, to power your own business video platform.
    </p>
</div>

<p align="center">
  <a href="https://npmjs.com/package/@boldvideo/bold-js">
    <img src="https://img.shields.io/npm/v/@boldvideo/bold-js/latest.svg?style=flat-square" alt="Bold JS" />
  </a>
  <a href="https://npmjs.com/package/@boldvideo/bold-js" rel="nofollow">
    <img src="https://img.shields.io/npm/dt/@boldvideo/bold-js.svg?style=flat-square" alt="npm">
  </a>
</p>

<p align="center">
  <a href="https://twitter.com/intent/follow?screen_name=veryboldvideo">
    <img src="https://img.shields.io/badge/Follow-%40veryboldvideo-09b3af?style=appveyor&logo=twitter" alt="Follow @veryboldvideo" />
  </a>
  <a href="https://https://app.boldvideo.io/register?utm_source=github.com&utm_medium=readme&utm_campaign=bold-js">
    <img src="https://img.shields.io/badge/Try%20Bold-Free-09b3af?style=appveyor&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAmCAYAAADTGStiAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAGFSURBVHgBxZg9SwNBEIZ34xUpVLCwEQQRtRARxV+g4M8QLO0sBPtgZS129gr+AbEWWyshOUSCkipBjB8cBHPrM4GVQ84qZuaFJTebj+feyczu3fmxEIIbXjnjjZEy7hm3feeunfdPf33B/xO4TBk/fMoZHXMCHU1wVBP3m8Cb2mDRI/AN4K9xouJ0NA9ovzih5Vj0jutZXHcl0HIsmkicW4uBJtiR2kUr8KQJGPVMwJ62sgJ//hxrtROQNsvnDO30JbGaY9xeROggVnLcY/FYAPwcJ7Qc7xahKmAAe33vz0vmRysK6rASQs2FUC3Oq1U1xZVSWVukvCWxWlXjbgnYFc6nVMEiXK+wQx0MjhX346gPWmtOe5MQjQPdsQBLylctUi3gholjnE6bgFHVCpxZgR+s/uOGVTvdWLTTCyvXurpj3J7IfbOqY0BpLrcx3mea22Id6LZAJdYA56T3COhy8dFE4kYkHN7xcgnwDGD79/sJH6i54SQ1ItfLXZx1GC2CehmsqG96m37o1gSKagAAAABJRU5ErkJggg==" alt="Try Bold Video" />
  </a>
</p>

## Usage

First, install the library:

```sh
npm install @boldvideo/bold-js
```

Next, instantiate the client to establish a connection to your Bold Channel:
```js
import { createClient } from "@boldvideo/bold-js";

const bold = createClient('YOUR_API_KEY');
```

Now you're able to query any of your resources from Bold. For exmaple:
```js
// fetches your channel settings, menus and featured playlists
const settings = await bold.settings();

// fetches the latest videos
const videos = await bold.videos.list();

// fetches the latest playlists
const playlists = await bold.playlists.list();

```

## Related Links

- **[Bold API Documentation](https://docs.boldvideo.io/docs/api)**

## More Resources

### Support

- Bugs or Feature Requests? [Submit an issue](/../../issues/new).


