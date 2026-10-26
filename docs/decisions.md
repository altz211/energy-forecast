# Decisions

- Start with a hypothetical mixed-use district. We have not verified an accessible hourly Gulf utility dataset, so this release makes no claims about actual DEWA or SEC demand.
- Keep two tracks: a weather-driven planning simulation in the browser, and a measured-data forecasting workflow in Python. A US-grid model is not automatically a validated Gulf model.
- Treat population through occupied homes; business expansion through floor area; industry through utilisation. Avoid counting growth twice.
- Show demand, grid import and daily energy separately. Solar reduces import; a battery shifts energy and incurs losses.
- Keep battery opening and closing SOC equal. Use 81 states over 10–90% of capacity and minimise the daily import peak. This is a discretised, perfect-scenario dispatch, not a network or economic optimiser.
- Use live weather on request, with an explicit fetched timestamp and a generated summer demo when offline. City changes return to demo to avoid mixing weather locations. API failures retain the last displayed source and say so.
- Keep the first site static for GitHub Pages. Computation runs in the visitor's browser. CI tests and deploys the application; this is not yet a production MLOps service.
- Record measured-model runs with data hashes, versions, parameters and holdout metrics. Add scheduled ingestion and model promotion only after choosing a real demand source and validating reporting delays.

## References reviewed

- [pvlib-python](https://github.com/pvlib/pvlib-python): separates weather inputs from PV performance modelling. Our first solar estimate is deliberately simpler; pvlib is not a dependency.
- [oemof-solph storage](https://github.com/oemof/oemof-solph/blob/dev/src/oemof/solph/components/_generic_storage.py): power/energy limits, conversion losses and balanced initial/final storage. Our browser dispatch is an original implementation.
- [Open-Meteo](https://open-meteo.com/en/docs): hourly forecast weather. Preceding-hour radiation means are shifted to hour-start intervals.
- [Scikit-learn](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.HistGradientBoostingRegressor.html): quantile gradient boosting for the measured-data track.
- [Gianluca Boccia](https://www.gianlucaboccia.me/): editorial typography and a story-led structure informed the page direction. No site assets were copied.

Next decision: choose one measured demand source and inspect its quality before adding more model complexity.
