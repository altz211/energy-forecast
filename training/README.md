# Measured demand

This is separate from the browser's district simulation. Bring at least 90 days of hourly average demand in MW; a full year or more is preferable.

1. Create a CSV with `timestamp,demand_mw`. Timestamps mark the start of an hour and include an offset, e.g. `2025-07-01T00:00:00+04:00`. One series only; no gaps or duplicates.
2. `pip install -r training/requirements.txt`
3. `OMP_NUM_THREADS=2 python training/train.py data/load.csv --timezone Asia/Dubai`
4. Read `runs/latest/metrics.json` and inspect `predictions.csv`. Compare the boosted median with the weekly baseline before making any accuracy claim.

The last 28 complete days are held out. Training ends before the first forecast issue time. Each next-day forecast uses only readings available before 09:00 the previous day: 48-hour and weekly lags, a lagged daily mean, and calendar features. No observed future weather is used. Meter reporting delays are not modelled yet.

Outputs include a model, a data hash, parameters, package versions and split dates. The saved model is the backtested model, not retrained on the holdout. Quantile coverage is measured, not guaranteed; hourly P90 is not a daily-peak P90. No random train/test split or automatic model promotion.

Use Dubai, Riyadh or Phoenix timezones for now; DST calendars need a separate treatment. Weather forecast vintages, rolling summer backtests and scheduled production inference are the next steps. Unit-test data is synthetic and must not be used as portfolio performance evidence.
