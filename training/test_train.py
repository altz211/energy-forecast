import tempfile
import unittest
from pathlib import Path
import numpy as np
import pandas as pd
from training.train import features, read_load, score, train


class TrainingTests(unittest.TestCase):
    def test_features_do_not_use_readings_after_issue(self):
        index = pd.date_range('2025-01-01', periods=24 * 30, freq='h', tz='Asia/Dubai')
        load = pd.Series(np.arange(len(index), dtype=float), index=index)
        issue = pd.Timestamp('2025-01-20T09:00', tz='Asia/Dubai')
        tomorrow = (index >= issue.normalize() + pd.Timedelta(days=1)) & (index < issue.normalize() + pd.Timedelta(days=2))
        before = features(load).loc[tomorrow]
        load.loc[load.index >= issue] = 99999
        pd.testing.assert_frame_equal(before, features(load).loc[tomorrow])

    def test_pipeline_and_data_checks(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'load.csv'
            index = pd.date_range('2025-01-01', periods=24 * 100, freq='h', tz='Asia/Dubai')
            data = pd.DataFrame({'timestamp': index, 'demand_mw': 30 + 10 * np.sin(index.hour * np.pi / 12)})
            data.to_csv(path, index=False)
            metrics = train(path, Path(folder) / 'run', 'Asia/Dubai')
            self.assertAlmostEqual(metrics['weekly_baseline']['mae_mw'], 0)
            self.assertTrue((Path(folder) / 'run/model.joblib').exists())
            data.loc[4, 'demand_mw'] = -1
            data.to_csv(path, index=False)
            with self.assertRaises(ValueError):
                read_load(path, 'Asia/Dubai')

    def test_peak_metrics(self):
        index = pd.date_range('2025-01-01', periods=24, freq='h', tz='Asia/Dubai')
        actual = pd.Series([1] * 23 + [5], index=index)
        predicted = pd.Series([1] * 22 + [4, 1], index=index)
        metrics = score(actual, predicted)
        self.assertEqual(metrics['daily_peak_mae_mw'], 1)
        self.assertEqual(metrics['peak_timing_mae_hours'], 1)


if __name__ == '__main__':
    unittest.main()
