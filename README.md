# CFFG Transformer

**CFFG Transformer code: Coming Soon.**

The CFFG Transformer research code will be released in this repository. This repository currently contains the project website, trajectory comparison videos, and evaluation results.

## About CFFG

CFFG combines a temporal Transformer with factor graph optimization for UWB/IMU localization. It learns corrections to UWB measurements and their uncertainty, allowing the estimator to account for measurement quality when combining UWB and inertial information.

### How it works

1. **Temporal measurement modeling.** A Transformer processes a window of measurement history to estimate a bias correction and a relative standard-deviation scale for each UWB time-difference-of-arrival (TDOA) measurement.
2. **Measurement correction and weighting.** The predicted bias corrects the TDOA measurement, while the predicted uncertainty determines its weight in the optimization. Measurements with larger predicted uncertainty contribute less information.
3. **UWB/IMU fusion.** The corrected UWB factors are combined with IMU preintegration factors in an incremental factor graph to estimate the motion state.

The Transformer provides measurement-level corrections; the factor graph retains the physical measurement models and performs state estimation. Vicon ground truth is used for evaluation and visualization only.

### Demonstrations and evaluation

The project website presents:

- Two trajectory comparison videos: **Const3 / TDOA3** and **Const4 / TDOA2**, showing the conventional factor graph baseline, CFFG, and Vicon ground truth.
- Three-dimensional position error metrics for all six test trajectories, including root mean square error (RMSE) and the 95th-percentile error (P95).
- Downloadable videos and evaluation results, with English and Chinese page content.

The baseline uses the same factor graph estimation core with CFFG measurement corrections disabled. The two demonstration trajectories were selected for their larger absolute RMSE improvements in the prior evaluation; the website also reports the complete six-trajectory test set.

## Repository structure

```text
.
├── website/       # Styles, scripts, videos, posters, and evaluation data
├── index.html    # Website entry point
└── README.md
```

## View the website

Open `index.html` in a browser. Keep the `website/` folder beside it. The website supports English and Chinese and requires no build step.

To publish with GitHub Pages, select the publishing branch and `/(root)` under **Settings → Pages → Deploy from a branch**.
