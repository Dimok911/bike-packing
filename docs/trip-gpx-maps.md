# Trip GPX maps and media tiles

Each trip owns an optional `track` record: name, original filename and separate arrays of `[latitude, longitude]` coordinates. The GPX XML, timestamps, extensions and personal sensor data are not retained. Existing layout JSON persistence, synchronization, history, backup and public publication carry this record without an API migration. New layout copies continue to omit trips.

The trip editor accepts GPX tracks (`trk/trkseg/trkpt`) and routes (`rte/rtept`), including namespace-qualified GPX. Invalid XML, DTD/entity declarations, missing/out-of-range coordinates, files over 20 MiB, more than 100 segments or 200,000 input points are rejected. Failed replacement and discarded edits preserve the previous saved track. Large tracks are simplified to at most 6,000 points, preserving segment endpoints and gaps. Computation has an operation budget to reject pathological files.

Photos and videos use separate horizontal rows, photos above videos, with 4 px gaps and no hidden overflow tiles. Each row scrolls horizontally. Photo fullscreen navigation includes all photographs. Embedded YouTube videos have previous/next controls; other video URLs remain external links. Admin photo strip and hero variants remain available.

## Yandex activation

A real Yandex Maps JavaScript API key is required. The owner reported that no key exists yet. Create one through https://developer.tech.yandex.ru/keys/ for the JavaScript API, configure domain restrictions for `vniipo-help.ru`, and enter the browser key in ignored `.env.local`:

```dotenv
VITE_YANDEX_MAPS_API_KEY=your-browser-key
```

Rebuild, test with the real authorized key, and publish the changed application bundle through the normal incremental FTPS process. Never put server credentials or Strava tokens in this browser build variable. A browser map key is visible to visitors and must be restricted in the provider dashboard.

The mini map and enlarged dialog use Yandex Maps JS API 2.1 and draw GPX coordinates with independent polylines. The preview disables gestures and offers a button to open the large interactive map. Attribution is left visible. Maps initialize only when visible and are destroyed when their trip is replaced or the dialog closes. The external SDK loads only when a track is displayed and a key is configured; there are no requests to Strava.

When there is no key, the network fails, or SDK initialization fails, a locally drawn track outline stays available and is explicitly labelled as a schematic rather than a loaded map. Actual Yandex tiles cannot be verified until the owner supplies a configured key. Adapter tests use a mock SDK and do not claim to verify real Yandex access.

References: https://yandex.com/dev/jsapi-v2-1/doc/en/v2-1/examples/cases/polyline and https://yandex.com/dev/jsapi-v2-1/doc/en/v2-1/dg/concepts/load.
