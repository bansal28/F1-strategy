<div align="center">

```
███████╗ ██╗     ███████╗████████╗██████╗  █████╗ ████████╗███████╗ ██████╗██╗   ██╗
██╔════╝ ██║     ██╔════╝╚══██╔══╝██╔══██╗██╔══██╗╚══██╔══╝██╔════╝██╔════╝╚██╗ ██╔╝
█████╗   ██║     ███████╗   ██║   ██████╔╝███████║   ██║   █████╗  ██║  ███╗╚████╔╝
██╔══╝   ██║     ╚════██║   ██║   ██╔══██╗██╔══██║   ██║   ██╔══╝  ██║   ██║ ╚██╔╝
██║      ███████╗███████║   ██║   ██║  ██║██║  ██║   ██║   ███████╗╚██████╔╝  ██║
╚═╝      ╚══════╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝ ╚═════╝   ╚═╝

      ██████╗ ██╗████████╗    ███████╗████████╗ ██████╗ ██████╗
      ██╔══██╗██║╚══██╔══╝    ██╔════╝╚══██╔══╝██╔═══██╗██╔══██╗
      ██████╔╝██║   ██║       ███████╗   ██║   ██║   ██║██████╔╝
      ██╔═══╝ ██║   ██║       ╚════██║   ██║   ██║   ██║██╔═══╝
      ██║     ██║   ██║       ███████║   ██║   ╚██████╔╝██║
      ╚═╝     ╚═╝   ╚═╝       ╚══════╝   ╚═╝    ╚═════╝ ╚═╝
```

# 🏎️ F1 Strategy Advisor

**A real-time pit stop prediction system trained on live F1 telemetry.**  
*Predicts whether a driver will pit within the next 10 laps — and when.*

---

![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=for-the-badge&logo=python&logoColor=white)
![TensorFlow](https://img.shields.io/badge/TensorFlow-2.19-FF6F00?style=for-the-badge&logo=tensorflow&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![OpenF1](https://img.shields.io/badge/OpenF1-API-E10600?style=for-the-badge)

</div>

---

## 📖 Table of Contents

- [What This Project Does](#-what-this-project-does)
- [Architecture Overview](#-architecture-overview)
- [Machine Learning Models](#-machine-learning-models)
  - [Data Pipeline](#data-pipeline)
  - [Feature Engineering](#feature-engineering)
  - [Model 1 — Binary Classifier](#model-1--binary-classifier-will-they-pit)
  - [Model 2 — Regression Model](#model-2--regression-model-how-many-laps)
  - [Training Setup & Results](#training-setup--results)
- [Backend — FastAPI Service](#-backend--fastapi-service)
  - [Project Structure](#project-structure)
  - [API Endpoints](#api-endpoints)
  - [Data Flow](#data-flow)
- [Frontend — React Dashboard](#-frontend--react-dashboard)
  - [Components](#components)
  - [UI Features & Animations](#ui-features--animations)
- [Getting Started](#-getting-started)
- [Key Design Decisions](#-key-design-decisions)

---

## 🏁 What This Project Does

In Formula 1, **pit stop timing is one of the most consequential decisions a team makes during a race.**

Pit one lap too early and you surrender track position for no gain. Pit one lap too late and your degraded tyres have already cost you several seconds per lap. Pit at the same time as your closest rival and you lose out in the pit lane — the so-called "overcut" disaster.

Real F1 teams employ rooms full of strategy engineers running simulations during every single lap. This project automates that with machine learning.

Given a **driver**, a **race session**, and a **current lap number**, the system predicts:

1. **P(pit within 10 laps)** — a probability score from 0 to 100%
2. **Laps until pit stop** — a continuous estimate of how many laps until the stop occurs
3. **A binary decision** — `PIT SOON` or `STAY OUT` based on a configurable threshold

The entire pipeline runs on real telemetry from the [OpenF1 API](https://openf1.org) — the same data broadcast teams and media use during live race weekends.

---

## 🗺️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenF1 REST API                          │
│   /laps  /stints  /intervals  /weather  /race_control  /drivers  │
└─────────────────────────┬───────────────────────────────────────┘
                          │  async HTTP (httpx)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend                              │
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌───────────────────┐   │
│  │  openf1.py   │   │  features.py │   │     main.py       │   │
│  │              │──▶│              │──▶│                   │   │
│  │  Async HTTP  │   │  25-column   │   │  /predict/pit-    │   │
│  │  client +    │   │  feature     │   │  window endpoint  │   │
│  │  retry logic │   │  pipeline    │   │                   │   │
│  └──────────────┘   └──────────────┘   └────────┬──────────┘   │
│                                                  │              │
│  ┌───────────────────────────────────────────┐   │              │
│  │           In-memory session cache         │   │              │
│  │           TTL = 30 minutes                │   │              │
│  └───────────────────────────────────────────┘   │              │
└──────────────────────────────────────────────────┼─────────────┘
                                                   │  JSON
                                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                     React + TypeScript Frontend                  │
│                                                                  │
│   RPM Gauge  •  Start Lights  •  Team Radio  •  Timing Tower    │
│   Pit Curve Chart  •  Driver Card  •  Threshold Slider          │
└─────────────────────────────────────────────────────────────────┘
                                                   ▲
                         ┌─────────────────────────┘
                         │  Trained at: Jupyter Notebook
┌─────────────────────────────────────────────────────────────────┐
│                    TensorFlow Models (.keras)                    │
│                                                                  │
│   pit_within_k.keras          pit_when_regression.keras         │
│   Binary classifier           MAE regression                    │
│   Input: 25 features          Input: same 25 features           │
│   Output: P(pit in K laps)    Output: laps until pit (float)    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🧠 Machine Learning Models

### Data Pipeline

All training data comes from the **OpenF1 API** across 3 seasons:

| Season | Races Used | Rows Generated | Notes |
|--------|-----------|----------------|-------|
| 2023   | 22         | ~25,000        | Training |
| 2024   | 24         | ~28,000        | Training |
| 2025   | 24         | ~26,000        | **Test only** (temporal split) |
| **Total** | **70** | **~77,300** | 25 sessions skipped (missing data) |

> **Temporal validation matters.** Using a random session split (as in v1 of this project) allows 2024 data to appear in training when evaluating 2023 races — the model can implicitly "learn the future." We fix this by training strictly on 2023–2024 and evaluating on 2025 as a completely unseen season.

For each session, 6 endpoints are fetched in parallel:

```python
laps, stints, drivers, intervals, weather, rc = await asyncio.gather(
    openf1.laps(session_key),
    openf1.stints(session_key),
    openf1.drivers(session_key),
    openf1.intervals(session_key),
    openf1.weather(session_key),
    openf1.race_control(session_key),
)
```

These are then merged into a single per-lap feature dataframe.

---

### Feature Engineering

The feature matrix has **3 categorical** and **21 numeric** columns:

#### Categorical Features

| Feature | Description | Cardinality |
|---------|-------------|-------------|
| `compound` | Tyre compound (SOFT/MEDIUM/HARD/INT/WET) | 5 |
| `team_name` | Constructor name | ~10 |
| `circuit_short_name` | Circuit identifier | ~24 |

All categoricals go through `keras.layers.StringLookup` → one-hot encoding.

#### Numeric Features

| Feature | Source | Why It Matters |
|---------|--------|----------------|
| `stint_age` | laps − stint_lap_start | Core degradation signal |
| `tyre_age_at_start` | stints API | How old the tyre was when fitted |
| `lap_duration_prev` | laps (t−1) | Previous lap pace |
| `lap_mean_last3` | rolling mean of laps t−3 to t−1 | Smoothed pace trend |
| `lap_slope_last3` | linear slope of last 3 laps | Is pace degrading? |
| `lap_vs_session` | lap_duration / session_median | ✅ Circuit-normalised pace |
| `sector1_vs_session` | sector_1 / session_median_s1 | ✅ Normalised sector pace |
| `sector2_vs_session` | sector_2 / session_median_s2 | ✅ Normalised sector pace |
| `sector3_vs_session` | sector_3 / session_median_s3 | ✅ Normalised sector pace |
| `gap_to_leader` | intervals API | Track position context |
| `interval_ahead` | intervals API | Undercut opportunity |
| `track_temperature` | weather API | Tyre degradation rate |
| `rainfall` | weather API | Compound strategy shift |
| `wind_speed` | weather API | Aerodynamic load |
| `flag_yellow` | race_control API | Yellow flag disruption |
| `flag_safetycar` | race_control API | Safety car opportunity |
| `laps_since_last_sc` | race_control API | ✅ Decaying SC context |
| `lap_number` | laps API | Race progression |
| `laps_remaining` | max_lap − lap_number | ✅ End-of-race context |
| `pits_taken_so_far` | stint index | ✅ Strategy depth |
| `year` | session metadata | Temporal context |

> ✅ = new feature added vs v1

**Why session-normalised pace?** Raw sector times are circuit-dependent — a 28-second sector at Monaco is totally different from a 28-second sector at Monza. Dividing by the session median makes these values comparable across circuits, which is essential for a model trained on 24 different tracks.

**Why `laps_remaining`?** This is arguably the most important feature missing from v1. A driver on lap 60 of 63 is almost never going to pit regardless of tyre age. Without this context, the binary model was generating false positives near race end.

---

#### The Label Bug (and Fix)

In v1, the labels had a silent but critical bug. The final stint of each race has `stint_lap_end` pointing to the driver's last lap. This was being labelled as an *upcoming pit stop* — but it's actually the race finishing. This inflated the apparent pit-within rate from ~28% to ~44%, corrupted the class weights, and caused both models to train on wrong labels.

**Fix:**

```python
# If stint ends at or after the driver's final lap → it's NOT a pit, it's the race end
is_race_end = (df['stint_lap_end'] >= df['driver_max_lap'])
delta = np.where(is_race_end, K_WINDOW, stint_lap_end - lap_number)
df['y_pit_within'] = (delta < K_WINDOW).astype(int)
```

After the fix: pit-within rate drops to **27.8%** — which matches reality (roughly 1 pit per ~3.6 laps worth of windows, consistent with a 1–2 stop race).

---

### Model 1 — Binary Classifier: "Will they pit?"

**Task:** Given a lap's features, predict P(driver pits within the next K=10 laps).

**Architecture:**

```
Input dict (25 features)
    │
    ├── [compound, team_name, circuit_short_name]
    │       └── StringLookup → one-hot
    │
    └── [21 numeric features]
            └── Per-feature Normalization layer
                   │
                   ▼
             Concatenate
                   │
              Dense(256, ReLU)
                   │
              Dropout(0.25)
                   │
              Dense(128, ReLU)
                   │
              Dropout(0.25)
                   │
              Dense(64, ReLU)
                   │
              Dense(1, sigmoid)
                   │
              P(pit within K)     ← output
```

**Class imbalance handling:** After the label fix, the positive rate is 27.8%, giving a natural 1:2.6 imbalance. We pass corrected class weights:

```python
pos = train_df['y_pit_within'].mean()     # ≈ 0.286
class_weight = {0: 1.0, 1: (1-pos)/pos}  # = {0: 1.0, 1: 2.498}
```

**Training:** Adam (lr=1e-3), EarlyStopping on val PR-AUC (patience=4), ReduceLROnPlateau.

---

### Model 2 — Regression Model: "How many laps?"

**Why regression, not classification?**

V1 used a 10-class softmax classifier to predict which lap (0–9) the pit would occur on. It achieved only **16.6% top-1 accuracy** — essentially random on a 10-class uniform problem.

The root issue: pit timing is *ordinal*. Predicting "3 laps" when the answer is "2 laps" is a minor error. But softmax treats class 2 and class 3 as completely unrelated, so it gets no credit. MAE regression fixes this — it directly optimises for closeness.

**Architecture:** Identical to Model 1, except:
- Trained only on rows where `y_pit_within == 1` (conditional: *given* a pit will happen, when?)
- Output layer: `Dense(1, activation='linear')` — continuous prediction
- Loss: `mae` instead of `binary_crossentropy`
- Output post-processing: `int(np.clip(round(raw), 0, K-1))`

---

### Training Setup & Results

| Metric | v1 (random split) | v2 (temporal split, 2025 test) | Notes |
|--------|-------------------|-------------------------------|-------|
| **Binary ROC-AUC** | 0.828 | 0.753 | Lower = harder eval, not worse model |
| **Binary PR-AUC** | 0.834 | 0.545 | PR-AUC sensitive to class balance shift |
| **Conditional Top-1** | 16.6% | 12.1% | Tradeoff: regression ≠ optimise exact match |
| **Conditional MAE** | 2.79 laps | **2.341 laps** | ✅ Genuine improvement |
| **Within ±2 laps** | — | **57.0%** | ✅ New metric |
| Label bug | ❌ | ✅ Fixed | Pit rate: 44% → 27.8% |

> **On the ROC-AUC drop:** The v1 test set included randomly sampled sessions from the same 2023–2024 years as training. The v2 test set is an entirely different season (2025) the model has never seen — different teams, different car regulations, different circuits at different weather. A drop in raw score is expected and represents a *more honest* evaluation, not a regression.

**Per-circuit performance (selected):**

| Circuit | Accuracy @0.5 | Notes |
|---------|--------------|-------|
| Singapore | ~70% | Low-degradation track, predictable |
| Monaco | ~65% | Short race, few pit windows |
| Spa-Francorchamps | ~48% | Complex strategy, high variance |
| Suzuka | ~49% | Long stints possible |

---

## ⚙️ Backend — FastAPI Service

### Project Structure

```
backend/
├── main.py           # FastAPI app, routes, session cache, inference
├── openf1.py         # Async HTTP client for OpenF1 API
├── features.py       # Feature engineering pipeline (mirrors notebook)
├── models/
│   ├── pit_within_k.keras           # Binary classifier
│   └── pit_when_regression.keras    # Laps-until-pit regressor
└── requirements.txt
```

### API Endpoints

#### `GET /health`
Returns backend status and configured K window.
```json
{ "ok": true, "k_window": 10 }
```

---

#### `GET /sessions?year=2024&session_name=Race`
Returns all race sessions for a given year from OpenF1.

```json
[
  {
    "session_key": 9472,
    "circuit_short_name": "Sakhir",
    "country_name": "Bahrain",
    "date_start": "2024-03-02T15:00:00"
  }
]
```

---

#### `GET /session/{session_key}/drivers`
Returns the list of drivers who competed in that session.

```json
[
  { "driver_number": 1, "name_acronym": "VER", "team_name": "Red Bull Racing" },
  { "driver_number": 16, "name_acronym": "LEC", "team_name": "Ferrari" }
]
```

---

#### `POST /predict/pit-window`
**Main inference endpoint.** Given a session, driver, and lap, fetches all telemetry, engineers features, runs both models, and returns a strategy recommendation.

**Request:**
```json
{
  "session_key": 9472,
  "driver_number": 1,
  "lap_number": 37,
  "threshold": 0.6
}
```

**Response:**
```json
{
  "k_window": 10,
  "threshold": 0.6,
  "p_pit_within_k": 0.721,
  "p_no_pit_within_k": 0.279,
  "pit_curve": [
    { "laps_ahead": 0, "p": 0.068 },
    { "laps_ahead": 1, "p": 0.094 },
    { "laps_ahead": 2, "p": 0.096 },
    ...
  ],
  "best_laps_ahead": 2,
  "decision": "PIT_SOON"
}
```

The `pit_curve` is constructed from the regression output: a Gaussian-like distribution centred on the predicted lap, scaled by `p_pit_within_k`. This gives the frontend something visually meaningful to chart even though the underlying model is a regressor.

---

### Data Flow

A full `/predict/pit-window` request follows this path:

```
POST /predict/pit-window
    │
    ├─ 1. Check session cache (30-min TTL)
    │      └─ HIT → skip to step 3
    │      └─ MISS → step 2
    │
    ├─ 2. Fetch from OpenF1 (6 endpoints in parallel)
    │      laps + stints + drivers + intervals + weather + race_control
    │      └─ Store in SESSION_CACHE[session_key]
    │
    ├─ 3. build_session_df()
    │      └─ Merge laps → stints (per driver, per lap number)
    │      └─ Join intervals (asof merge on timestamp)
    │      └─ Join weather (asof merge on timestamp)
    │      └─ Join race control flags
    │      └─ Compute all derived features
    │
    ├─ 4. Filter to requested driver + lap_number
    │      └─ 404 if no matching row
    │
    ├─ 5. _row_to_input() — convert df row to TF tensors
    │      └─ tf.constant([[str]], dtype=tf.string) for categoricals
    │      └─ np.array([[float]], dtype=float32) for numerics
    │
    ├─ 6. Model 1: pit_within_model(x, training=False)
    │      └─ p_within = float scalar
    │
    ├─ 7. Model 2: pit_when_model(x, training=False)
    │      └─ raw_laps = float scalar
    │      └─ Build pit_curve distribution
    │
    └─ 8. Return JSON response
```

> **On the TF input format:** A hard-won lesson. `keras.Input(shape=(1,))` defines a tensor of shape `(None, 1)` — the `None` is the batch dimension. For single-sample inference, inputs must be shape `(1, 1)`, not `(1,)`. Categorical inputs must be `tf.constant([[...]], dtype=tf.string)` — passing a Python list or numpy string array causes a `str288` / `unknown TensorShape` crash in TF 2.19+. Always use direct model call `model(x, training=False)` rather than `model.predict(x)` for single-row inference, as `.predict()` tries to infer steps from the dataset size and fails on raw dicts.

---

## 🖥️ Frontend — React Dashboard

### Components

#### `<RpmGauge p={probability} />`
An SVG rev counter that sweeps from green (0–60%) through yellow (60–80%) to red (80–100%) as pit probability increases. The needle animates smoothly via a `setInterval` counter that increments toward the target probability over ~800ms. Modelled after real F1 dashboard gauges.

#### `<StartLights phase="loading|pit|stay|idle" />`
Five circular lights that illuminate one-by-one with staggered `animation-delay` (0, 180, 360, 540, 720ms) when Predict is clicked — mimicking the actual F1 race start procedure. When phase transitions to `pit`, the lights go dark (lights out → go). When phase is `stay`, they turn green.

#### `<RadioDecision decision="PIT_SOON|STAY_OUT" prob={p} />`
Renders the decision as a team radio message. The text ("BOX BOX BOX" or "STAY OUT") types out character by character using a `setInterval` with 60ms per character. Includes an animated signal strength indicator and a blinking cursor.

#### `<PitCurveChart points={[...]} highlight={bestLap} lapNumber={lap} />`
A custom SVG line chart with:
- Area fill under the curve with a gradient fade
- A glow filter applied to the line path via SVG `<feGaussianBlur>`
- An animated pulsing ring (`@keyframes pulseRing`) on the highlighted (best) lap dot
- Dual tick labels: relative (`+2`) and absolute (`L39`) for each point

#### `<TimingRow rank={1} label="..." value="72%" highlight />`
F1-broadcast-style timing tower rows with a dark header strip, rank number badge (red for P1), and monospace values.

---

### UI Features & Animations

| Effect | Implementation |
|--------|----------------|
| Speed lines | CSS `::before`/`::after` pseudo-elements with `scaleY` + `translateY` keyframes, looping at different offsets |
| Scanlines | `repeating-linear-gradient` fixed overlay at z-index 0 |
| F1 logo pulse | `@keyframes logoPulse` using `box-shadow` |
| DRS badge glow | `@keyframes drsGlow` on the button badge |
| Team colours | CSS custom property `--accent` set inline from `TEAM_COLORS` map |
| Probability counter | `setInterval` incrementing `animatedProb` state at 20ms intervals |
| Pit window stripe | `@keyframes stripeFlow` on `background-position` of a 3-colour gradient |
| Empty state car | CSS `@keyframes trackLoop` on `left` position, creating a dot orbiting a track oval |
| Online status dot | `@keyframes blink` on opacity |
| Cards reveal | `@keyframes fadeSlideIn` (translateY + opacity) |

**Fonts:**
- `Barlow Condensed` (900 weight) — all headings, labels, buttons — closest free equivalent to the official F1 typeface used in broadcasts
- `Barlow` — body text
- `Share Tech Mono` — telemetry numbers, status messages, API values

**Colour system:** A single CSS variable `--accent` is set on the root `.page` element and updated to the selected driver's team colour. Every coloured element — avatar border, team badge, confidence bar gradient, start lights, DRS glow — inherits from this one variable. Changing driver instantly re-themes the entire UI.

---

## 🚀 Getting Started

### Prerequisites

- Python 3.12+
- Node.js 18+
- A trained model (run the Jupyter notebook to generate `.keras` files)

### 1. Train the Models

Open `F1_PitStop_Improved.ipynb` in Google Colab or JupyterLab and run all cells. The notebook will:

1. Fetch ~70 race sessions from OpenF1 (cached to disk, ~25 min first run)
2. Build the feature matrix and apply the race-end label fix
3. Train both models with early stopping
4. Save `pit_within_k.keras` and `pit_when_regression.keras`

Download both `.keras` files and place them in `backend/models/`.

### 2. Start the Backend

```bash
cd backend
pip install -r requirements.txt

# Set environment variables (optional)
export K_WINDOW=10
export PIT_THRESHOLD=0.6
export CORS_ORIGINS="http://localhost:5173"

uvicorn main:app --reload --port 8000
```

Verify: `curl http://localhost:8000/health` → `{"ok":true,"k_window":10}`

### 3. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

### 4. Make a Prediction

1. Enter a year (2023–2025) and click **Load Calendar**
2. Select a race session
3. Click **Load Grid**
4. Select a driver
5. Set the current lap number
6. Adjust the decision threshold if desired (default 0.60)
7. Click **Analyse Pit Window** — watch the start lights sequence, then see the recommendation

---

## 🔑 Key Design Decisions

### Why two models instead of one?

A single model that outputs a full 10-class distribution conflates two questions: *will* a pit happen, and *when*? Separating them allows:

- **Model 1** to be trained on all laps (positive + negative), learning the general signal for "is a stop coming?"
- **Model 2** to train only on positive examples (laps where a pit *did* happen), learning the finer-grained "how close am I to the stop?" signal without being confused by non-pit noise

### Why regression for the "when" model?

A 10-class softmax gave 16.6% top-1 accuracy — barely above random (10%). The labels are ordinal: predicting lap 3 when the answer is lap 2 is a small error, not a complete miss. MAE regression respects this ordering and dropped the error to 2.341 laps, with 57% of predictions landing within ±2 laps.

### Why K=10?

Ten laps gives a strategy-relevant look-ahead window. Too short (K=3) and the model only predicts near-certain pits, giving no advance warning. Too long (K=20) and the positive class becomes 50%+ of all laps, making the binary problem trivial and the timing problem noisy. K=10 balances useful early warning with label quality.

### Why temporal train/test split?

Random session splits allow future data to contaminate training in subtle ways — car development, tyre specification changes, team strategy evolutions all evolve across a season. A model that sees 2024 Monza data during training and then evaluates on 2023 Monza has had implicit access to post-hoc information. The 2025-only test set is the cleanest possible holdout: different car regulations, different grid order, completely unseen.

### Why not use driver identity as a feature?

`name_acronym` (driver identity) was in v1 but removed in v2. A model that learns "VER always pits on lap 18" is overfitting to specific drivers seen during training. It won't generalise when drivers change teams, retire, or when a new driver joins the grid. Team identity (`team_name`) is retained because team *strategy philosophy* is more stable than individual behaviour.

---

<div align="center">

---

*Built with OpenF1 telemetry · TensorFlow · FastAPI · React*

*Educational / portfolio project — not affiliated with Formula 1, the FIA, or any constructor.*

```
🏁 LIGHTS OUT AND AWAY WE GO 🏁
```

</div>
