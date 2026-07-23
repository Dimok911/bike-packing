# Bike Packing

Web app for planning bikepacking gear: packing lists, bags, storage locations, weights, categories, photos, and trip-ready checklists.

Production site: https://vniipo-help.ru/bike-packing/

GitHub Pages mirror: https://dimok911.github.io/bike-packing/

## Features

- Create multiple packing layouts for different trips.
- Manage a gear catalog with weight, quantity, category, and storage location.
- Organize bags and nested pouches with drag-and-drop packing.
- Add item and bag photos with gallery and fullscreen viewing.
- Track packed items in collection mode.
- Search and filter by category or storage location.
- Print or export a PDF version of the packing list.
- Work locally, use offline mode, and sync after sign-in.
- Start quickly from demo and shared templates.
- Inspect a 3D bike packing view.

## Development

```bash
npm install
npm run dev
```

Checks and production build:

```bash
npm run check
npm run build
```

Production publishing uses both FTP and GitHub Pages. See
[`docs/production-deployment.md`](docs/production-deployment.md).
