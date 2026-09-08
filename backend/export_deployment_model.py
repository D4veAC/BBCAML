import json
import pickle
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def export(source=ROOT / 'xgboost_ohlcv_bundle.pkl', destination=ROOT / 'api' / 'model.json'):
    with Path(source).open('rb') as handle:
        bundle = pickle.load(handle)
    booster = bundle['model'].get_booster()
    raw = json.loads(booster.save_raw(raw_format='json'))['learner']
    tree_model = raw['gradient_booster']['model']
    output = {
        'bundleVersion': bundle['bundle_version'],
        'ticker': bundle['ticker'],
        'features': bundle['features'],
        'timestep': int(bundle['timestep']),
        'targetMode': bundle['target_mode'],
        'targetScale': float(bundle['target_scale']),
        'baseScore': float(raw['learner_model_param']['base_score'].strip('[]')),
        'scalerMin': bundle['scaler_X'].min_.tolist(),
        'scalerScale': bundle['scaler_X'].scale_.tolist(),
        'trees': [{
            'left': tree['left_children'],
            'right': tree['right_children'],
            'feature': tree['split_indices'],
            'threshold': tree['split_conditions'],
            'defaultLeft': tree['default_left'],
        } for tree in tree_model['trees']],
    }
    Path(destination).write_text(json.dumps(output, separators=(',', ':')), encoding='utf-8')
    print(f'Wrote deployment model: {Path(destination).resolve()}')
    return output


if __name__ == '__main__':
    export()
