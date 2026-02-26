import os, time
from typing import Optional
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from app.openf1 import OpenF1
from app.local_models import load_models_local
from app.features import build_session_df


K_WINDOW = int(os.environ.get("K_WINDOW", "10"))
DEFAULT_THRESHOLD = float(os.environ.get("PIT_THRESHOLD", "0.6"))

CAT_COLS = ["compound","team_name","name_acronym","circuit_short_name","country_name"]
NUM_COLS = [
    "tyre_age_at_start","stint_age",
    "lap_duration_prev","lap_mean_last3","lap_slope_last3",
    "sector1_prev","sector2_prev","sector3_prev",
    "gap_to_leader","interval_ahead",
    "track_temperature","rainfall","wind_speed",
    "flag_yellow","flag_safetycar",
    "lap_number","year"
]

app = FastAPI(title="F1 Strategy Advisor API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
openf1 = OpenF1()

PIT_WITHIN_MODEL = None
PIT_WHEN_MODEL = None

SESSION_CACHE = {}  # session_key -> {"ts":..., "df":...}
CACHE_TTL_S = 30 * 60

class PitWindowRequest(BaseModel):
    session_key: int
    driver_number: int
    lap_number: int
    threshold: Optional[float] = None

@app.on_event("startup")
async def startup():
    global PIT_WITHIN_MODEL, PIT_WHEN_MODEL
    PIT_WITHIN_MODEL, PIT_WHEN_MODEL = load_models_local()

@app.get("/health")
def health():
    return {"ok": True, "k_window": K_WINDOW}

@app.get("/sessions")
async def sessions(year: int, session_name: str = "Race"):
    return await openf1.sessions_by_year(year, session_name=session_name)

@app.get("/session/{session_key}/drivers")
async def session_drivers(session_key: int):
    dr = await openf1.drivers(session_key)
    return [
        {"driver_number": d.get("driver_number"), "name_acronym": d.get("name_acronym"), "team_name": d.get("team_name")}
        for d in dr
    ]

async def get_session_df(session_key: int):
    now = time.time()
    cached = SESSION_CACHE.get(session_key)
    if cached and (now - cached["ts"] < CACHE_TTL_S):
        return cached["df"]

    meta = await openf1.session_meta(session_key)
    laps = await openf1.laps(session_key)
    stints = await openf1.stints(session_key)
    drivers = await openf1.drivers(session_key)
    intervals = await openf1.intervals(session_key)
    weather = await openf1.weather(session_key)
    rc = await openf1.race_control(session_key)

    df = build_session_df(laps, stints, drivers, intervals, weather, rc, meta)
    if df.empty:
        raise HTTPException(status_code=404, detail="Could not build features for that session.")

    SESSION_CACHE[session_key] = {"ts": now, "df": df}
    return df

def _row_to_input(row_df):
    x = {}
    for c in CAT_COLS:
        x[c] = row_df[c].astype(str).values
    for n in NUM_COLS:
        x[n] = row_df[n].astype("float32").values
    return x

@app.post("/predict/pit-window")
async def predict_pit_window(req: PitWindowRequest):
    threshold = req.threshold if req.threshold is not None else DEFAULT_THRESHOLD

    df = await get_session_df(req.session_key)

    row = df[
        (df["driver_number"].astype(int) == int(req.driver_number)) &
        (df["lap_number"].astype(int) == int(req.lap_number))
    ]
    if row.empty:
        raise HTTPException(status_code=404, detail="No feature row for that driver/lap.")

    for c in CAT_COLS:
        if c not in row.columns:
            row[c] = "UNKNOWN"
    for n in NUM_COLS:
        if n not in row.columns:
            row[n] = 0.0

    x = _row_to_input(row)

    p_within = float(PIT_WITHIN_MODEL.predict(x, verbose=0)[0][0])
    p_no = 1.0 - p_within

    p_when = PIT_WHEN_MODEL.predict(x, verbose=0)[0].astype(float).tolist()
    curve = [p_within * pk for pk in p_when]

    best_k = int(max(range(len(curve)), key=lambda i: curve[i]))
    decision = "PIT_SOON" if p_within >= threshold else "STAY_OUT"

    return {
        "k_window": K_WINDOW,
        "threshold": threshold,
        "p_pit_within_k": p_within,
        "p_no_pit_within_k": p_no,
        "pit_curve": [{"laps_ahead": i, "p": curve[i]} for i in range(K_WINDOW)],
        "best_laps_ahead": best_k,
        "decision": decision
    }