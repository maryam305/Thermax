# ThermaX Frontend

Next.js frontend for heat-safe navigation, heat-aware meeting planning, and urban cooling recommendations.

## Run locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Mapbox setup

1. Copy `.env.example` to `.env.local`.
2. Add a browser-safe public Mapbox token:

```env
NEXT_PUBLIC_MAPBOX_TOKEN=pk_your_public_token
```

3. Restart the development server.

Without a token, the route page uses the built-in schematic fallback. With a token, it renders an interactive Mapbox map from `lib/demo-geojson.ts`.

## Backend integration points

- Replace `demoRoutes` with candidate route GeoJSON `LineString` features.
- Replace `demoHeatOverlay` with FortyGuard heat polygons.
- Preserve stable route IDs so the selected route and map styling stay synchronized.
- Configure `NEXT_PUBLIC_API_BASE_URL` when backend endpoints are available.

## Current validation

- Required origin and destination.
- Origin and destination cannot match.
- Current prototype coverage is Phoenix, Arizona, within the U.S.-only project scope.
- Meeting time is required, cannot be in the past, and cannot exceed the 12-hour forecast window.
- Intervention location is required.

## Quality checks

```bash
pnpm lint
pnpm build
```
