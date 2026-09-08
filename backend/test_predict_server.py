import unittest
from datetime import datetime
from zoneinfo import ZoneInfo
import backend.predict_server as server
class PredictionValidationTests(unittest.TestCase):
    valid = dict(open=100, high=110, low=90, close=105, volume=1000)
    history = [[95, 105, 85, 100, 900] for _ in range(server.TIMESTEP - 1)]

    def test_missing_features(self):
        with self.assertRaises(ValueError): server.predict({})
    def test_inconsistent_prices(self):
        with self.assertRaises(ValueError): server.predict(dict(open=100,high=80,low=90,close=105,volume=0))
    def test_nonfinite_values(self):
        with self.assertRaises(ValueError): server.predict(dict(open=100,high=110,low=90,close=float('nan'),volume=0))
    def test_incompatible_bundle(self):
        from unittest.mock import patch
        with patch.object(server.MODEL.get_booster(), 'num_features', return_value=len(server.FEATURES) + 1):
            with self.assertRaises(server.ModelInputMismatch): server.predict(self.valid, self.history)

    def test_rejects_non_agentic_bundle(self):
        from unittest.mock import patch
        with patch.dict(server.model_bundle, {'bundle_version': 2}):
            with self.assertRaises(server.ModelInputMismatch): server.predict(self.valid, self.history)

    def test_retraining_state_is_fail_closed(self):
        from unittest.mock import patch
        with patch.object(server, 'MODEL_READY', False):
            with self.assertRaises(server.ModelUnavailable): server.predict(self.valid, self.history)

    def test_daily_schedule_rolls_to_next_day(self):
        timezone = ZoneInfo('Asia/Jakarta')
        now = datetime(2026, 9, 8, 19, 0, tzinfo=timezone)
        scheduled = server.next_retrain_time(now, '18:00')
        self.assertEqual(scheduled, datetime(2026, 9, 9, 18, 0, tzinfo=timezone))

    def test_builds_configured_session_model_input(self):
        result = server.predict(self.valid, self.history)
        self.assertGreater(result['prediction_price'], 0)

    def test_rejects_short_history(self):
        with self.assertRaises(server.MarketHistoryUnavailable):
            server.predict(self.valid, self.history[:-1])
if __name__ == '__main__': unittest.main()
