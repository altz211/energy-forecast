# Energy Forecast

A Gulf district planning lab. Explore heat, growth, solar and battery storage against an assumed grid connection limit.

## Run

1. `python -m http.server 8000`
2. Open `http://localhost:8000`.
3. Choose a city, load live weather or use the summer demo, and adjust the district.
4. Export the hourly results to compare scenarios.

Checks: `npm test`. Build: `npm run build`.

## Deploy

In GitHub: **Settings → Pages → Source → GitHub Actions**. Push to `main`, or run **Test and deploy** from Actions.

## Decisions

- District demand is simulated. Live weather does not turn it into a measured utility forecast.
- Growth, cooling, solar and storage stay separate so their effects can be inspected.
- The site runs in the browser; no server or API key is needed.
- Measured-load training lives in [training/](training/). No accuracy claims until it runs on real data.

[Project decisions and references](docs/decisions.md)
