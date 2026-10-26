import argparse
import hashlib
import json
from pathlib import Path
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_pinball_loss

FEATURES = ['hour_sin', 'hour_cos', 'weekday', 'month', 'lag_48', 'lag_168', 'mean_48_71']


def read_load(path, zone):
    data = pd.read_csv(path)
    if not {'timestamp', 'demand_mw'}.issubset(data):
        raise ValueError('CSV needs timestamp and demand_mw columns.')
    if not data.timestamp.astype(str).str.contains(r'(?:Z|[+-]\d\d:\d\d)$').all():
        raise ValueError('Timestamps need an explicit UTC offset or Z.')
    index = pd.DatetimeIndex(pd.to_datetime(data.timestamp, utc=True)).tz_convert(zone)
    if index.has_duplicates or not index.is_monotonic_increasing:
        raise ValueError('Timestamps must be unique and increasing.')
    if len(index) < 90 * 24 or not (index[1:] - index[:-1] == pd.Timedelta(hours=1)).all():
        raise ValueError('Supply at least 90 days of uninterrupted hourly data.')
    if (index.minute != 0).any() or (index.second != 0).any():
        raise ValueError('Each timestamp must mark the start of an hour.')
    values = pd.to_numeric(data.demand_mw, errors='coerce').to_numpy()
    if not np.isfinite(values).all() or (values < 0).any() or values.sum() == 0:
        raise ValueError('Demand must be finite, nonnegative and not all zero.')
    return pd.Series(values, index=index, name='actual')


def features(load):
    x = pd.DataFrame(index=load.index)
    x['hour_sin'] = np.sin(load.index.hour * np.pi / 12)
    x['hour_cos'] = np.cos(load.index.hour * np.pi / 12)
    x['weekday'] = load.index.dayofweek
    x['month'] = load.index.month
    # A 24-hour lag leaks tomorrow's late hours at a 09:00 issue time.
    x['lag_48'] = load.shift(48)
    x['lag_168'] = load.shift(168)
    x['mean_48_71'] = load.shift(48).rolling(24).mean()
    return x


def score(actual, predicted):
    frame = pd.DataFrame({'actual': actual, 'predicted': predicted}, index=actual.index)
    days = frame.groupby(frame.index.date)
    peak_errors, timing_errors = [], []
    for _, day in days:
        peak_errors.append(abs(day.actual.max() - day.predicted.max()))
        timing_errors.append(abs(day.actual.idxmax().hour - day.predicted.idxmax().hour))
    return {
        'mae_mw': float(mean_absolute_error(actual, predicted)),
        'wape_pct': float(100 * np.abs(actual - predicted).sum() / actual.sum()),
        'daily_peak_mae_mw': float(np.mean(peak_errors)),
        'peak_timing_mae_hours': float(np.mean(timing_errors)),
    }


def train(path, output, zone, test_days=28):
    load = read_load(path, zone)
    x = features(load)
    # Exclude the final day if it is incomplete.
    end = load.index[-1].normalize() + (pd.Timedelta(days=1) if load.index[-1].hour == 23 else pd.Timedelta(0))
    start = end - pd.Timedelta(days=test_days)
    issue = start - pd.Timedelta(days=1) + pd.Timedelta(hours=9)
    valid = x.notna().all(axis=1)
    train_mask = valid & (x.index < issue)
    test_mask = valid & (x.index >= start) & (x.index < end)
    if train_mask.sum() < 30 * 24 or test_mask.sum() != test_days * 24:
        raise ValueError('Not enough complete training or holdout days.')
    actual = load[test_mask]
    if actual.sum() == 0:
        raise ValueError('Holdout demand is all zero.')
    predictions = pd.DataFrame({'actual': actual, 'weekly_baseline': x.loc[test_mask, 'lag_168']})
    models = {}
    for quantile, name in [(0.1, 'p10'), (0.5, 'p50'), (0.9, 'p90')]:
        model = HistGradientBoostingRegressor(loss='quantile', quantile=quantile,
            max_iter=150, max_leaf_nodes=15, l2_regularization=1, early_stopping=False, random_state=42)
        model.fit(x.loc[train_mask, FEATURES], load[train_mask])
        models[name] = model
        predictions[name] = np.maximum(0, model.predict(x.loc[test_mask, FEATURES]))
    crossing = ((predictions.p10 > predictions.p50) | (predictions.p50 > predictions.p90)).mean()
    predictions[['p10', 'p50', 'p90']] = np.sort(predictions[['p10', 'p50', 'p90']].values, axis=1)
    metrics = {
        'weekly_baseline': score(actual, predictions.weekly_baseline),
        'boosted_median': score(actual, predictions.p50),
        'hourly_interval_coverage': float(((actual >= predictions.p10) & (actual <= predictions.p90)).mean()),
        'hourly_interval_width_mw': float((predictions.p90 - predictions.p10).mean()),
        'raw_quantile_crossing_rate': float(crossing),
        'pinball_loss': {name: float(mean_pinball_loss(actual, predictions[name], alpha=q))
                         for q, name in [(0.1, 'p10'), (0.5, 'p50'), (0.9, 'p90')]},
    }
    manifest = {
        'created_utc': datetime.now(timezone.utc).isoformat(),
        'data_sha256': hashlib.sha256(Path(path).read_bytes()).hexdigest(),
        'timezone': zone, 'train_last_hour': str(load[train_mask].index[-1]),
        'test_start': str(start), 'test_end_exclusive': str(end),
        'issue_rule': '09:00 previous local day; meter readings assumed available without delay',
        'features': FEATURES, 'training_rows': int(train_mask.sum()), 'test_rows': int(test_mask.sum()),
        'versions': {'pandas': pd.__version__, 'numpy': np.__version__, 'sklearn': sklearn.__version__},
        'parameters': models['p50'].get_params(),
        'notes': 'Fixed model across holdout; lagged readings update daily. Hourly quantiles are uncalibrated; not daily peak quantiles.'
    }
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    predictions.to_csv(output / 'predictions.csv', index_label='timestamp')
    (output / 'metrics.json').write_text(json.dumps(metrics, indent=2) + '\n')
    (output / 'run.json').write_text(json.dumps(manifest, indent=2) + '\n')
    joblib.dump({'models': models, 'features': FEATURES, 'timezone': zone}, output / 'model.joblib')
    return metrics


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Backtest next-day demand against a weekly baseline.')
    parser.add_argument('csv')
    parser.add_argument('--output', default='runs/latest')
    parser.add_argument('--timezone', choices=['Asia/Dubai', 'Asia/Riyadh', 'America/Phoenix'], default='Asia/Dubai')
    args = parser.parse_args()
    print(json.dumps(train(args.csv, args.output, args.timezone), indent=2))
