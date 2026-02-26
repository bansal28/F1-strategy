import numpy as np
import pandas as pd

def _to_dt(s):
    return pd.to_datetime(s, utc=True, errors="coerce")

def _gap_to_float(x):
    if x is None:
        return np.nan
    if isinstance(x, (int, float, np.number)):
        return float(x)
    if isinstance(x, str):
        t = x.strip()
        if t == "" or t.lower() == "null":
            return np.nan
        if "LAP" in t.upper():
            return 99.0
        if t.startswith("+"):
            t = t[1:]
        try:
            return float(t)
        except:
            return np.nan
    return np.nan

def build_session_df(laps, stints, drivers, intervals, weather, race_control, meta: dict):
    laps = pd.DataFrame(laps)
    stints_raw = pd.DataFrame(stints)
    drivers = pd.DataFrame(drivers)
    intervals = pd.DataFrame(intervals)
    weather = pd.DataFrame(weather)
    rc = pd.DataFrame(race_control)

    if laps.empty or stints_raw.empty or drivers.empty:
        return pd.DataFrame()

    stints = stints_raw.rename(columns={
        "lap_start": "stint_lap_start",
        "lap_end": "stint_lap_end",
        "compound": "stint_compound",
        "tyre_age_at_start": "stint_tyre_age_at_start"
    })

    must = ["driver_number", "lap_number", "lap_duration", "date_start"]
    for c in must:
        if c not in laps.columns:
            return pd.DataFrame()

    laps["date_start"] = _to_dt(laps["date_start"])
    laps["lap_duration"] = pd.to_numeric(laps["lap_duration"], errors="coerce")
    laps = laps.dropna(subset=["date_start", "lap_duration"])

    for c in ["duration_sector_1","duration_sector_2","duration_sector_3"]:
        if c not in laps.columns:
            laps[c] = np.nan
        laps[c] = pd.to_numeric(laps[c], errors="coerce")

    join_keys = [k for k in ["session_key","meeting_key","driver_number"] if k in laps.columns and k in stints.columns]
    if not join_keys:
        join_keys = ["driver_number"]

    m = laps.merge(stints, on=join_keys, how="left")
    m = m[(m["lap_number"] >= m["stint_lap_start"]) & (m["lap_number"] <= m["stint_lap_end"])].copy()

    m["stint_age"] = m["lap_number"] - m["stint_lap_start"]
    m["compound"] = m.get("stint_compound", "UNKNOWN")
    m["compound"] = m["compound"].fillna("UNKNOWN").astype(str)
    m["tyre_age_at_start"] = pd.to_numeric(m.get("stint_tyre_age_at_start", 0.0), errors="coerce").fillna(0.0)

    m = m.sort_values(["driver_number","lap_number"]).reset_index(drop=True)
    m["lap_duration_prev"] = m.groupby("driver_number")["lap_duration"].shift(1).fillna(m["lap_duration"])
    m["sector1_prev"] = m.groupby("driver_number")["duration_sector_1"].shift(1).fillna(0.0)
    m["sector2_prev"] = m.groupby("driver_number")["duration_sector_2"].shift(1).fillna(0.0)
    m["sector3_prev"] = m.groupby("driver_number")["duration_sector_3"].shift(1).fillna(0.0)

    m["lap_mean_last3"] = m.groupby("driver_number")["lap_duration"].transform(
        lambda s: s.shift(1).rolling(3).mean()
    ).fillna(m["lap_duration_prev"])

    def slope_last3(s):
        def _slope(v):
            if len(v) != 3:
                return np.nan
            return np.polyfit([0,1,2], v, 1)[0]
        return s.shift(1).rolling(3).apply(_slope, raw=False)

    m["lap_slope_last3"] = m.groupby("driver_number")["lap_duration"].transform(slope_last3).fillna(0.0)

    # Drivers
    dcols = ["driver_number"]
    if "team_name" in drivers.columns: dcols.append("team_name")
    if "name_acronym" in drivers.columns: dcols.append("name_acronym")
    dsmall = drivers[dcols].copy()
    if "team_name" not in dsmall.columns: dsmall["team_name"] = "UNKNOWN"
    if "name_acronym" not in dsmall.columns: dsmall["name_acronym"] = "UNK"
    dsmall["team_name"] = dsmall["team_name"].fillna("UNKNOWN").astype(str)
    dsmall["name_acronym"] = dsmall["name_acronym"].fillna("UNK").astype(str)
    m = m.merge(dsmall, on="driver_number", how="left")
    m["team_name"] = m["team_name"].fillna("UNKNOWN").astype(str)
    m["name_acronym"] = m["name_acronym"].fillna("UNK").astype(str)

    # Intervals
    m["gap_to_leader"] = 0.0
    m["interval_ahead"] = 0.0
    if not intervals.empty and "date" in intervals.columns and "driver_number" in intervals.columns:
        intervals["date"] = _to_dt(intervals["date"])
        intervals = intervals.dropna(subset=["date"])
        intervals["driver_number"] = pd.to_numeric(intervals["driver_number"], errors="coerce")
        intervals = intervals.dropna(subset=["driver_number"])
        intervals["driver_number"] = intervals["driver_number"].astype(int)

        if "gap_to_leader" not in intervals.columns: intervals["gap_to_leader"] = np.nan
        if "interval" not in intervals.columns: intervals["interval"] = np.nan

        intervals["gap_to_leader_iv"] = intervals["gap_to_leader"].map(_gap_to_float)
        intervals["interval_ahead_iv"] = intervals["interval"].map(_gap_to_float)

        rhs = intervals[["driver_number","date","gap_to_leader_iv","interval_ahead_iv"]].sort_values(["date","driver_number"]).reset_index(drop=True)

        m = m.sort_values(["date_start","driver_number"]).reset_index(drop=True)
        m["driver_number"] = pd.to_numeric(m["driver_number"], errors="coerce").fillna(-1).astype(int)

        m = pd.merge_asof(
            m, rhs,
            left_on="date_start", right_on="date",
            by="driver_number", direction="backward",
            allow_exact_matches=True
        )
        m["gap_to_leader"] = pd.to_numeric(m["gap_to_leader_iv"], errors="coerce").fillna(0.0)
        m["interval_ahead"] = pd.to_numeric(m["interval_ahead_iv"], errors="coerce").fillna(0.0)
        m = m.drop(columns=["date","gap_to_leader_iv","interval_ahead_iv"], errors="ignore")

    # Weather
    # Weather (robust: avoid _x/_y suffix collisions)
    if not weather.empty and "date" in weather.columns:
        weather["date"] = _to_dt(weather["date"])
        weather = weather.dropna(subset=["date"]).sort_values("date").reset_index(drop=True)

        for c in ["track_temperature", "rainfall", "wind_speed"]:
            if c not in weather.columns:
                weather[c] = 0.0
            weather[c] = pd.to_numeric(weather[c], errors="coerce").fillna(0.0)

        rhsw = weather[["date", "track_temperature", "rainfall", "wind_speed"]].sort_values("date").reset_index(drop=True)

        m = m.sort_values("date_start").reset_index(drop=True)

        # IMPORTANT: drop placeholder cols so merge_asof doesn't create _x/_y
        for c in ["track_temperature", "rainfall", "wind_speed"]:
            if c in m.columns:
                m = m.drop(columns=[c])

        m = pd.merge_asof(
            m, rhsw,
            left_on="date_start", right_on="date",
            direction="backward",
            allow_exact_matches=True
        )

        # ensure columns exist + are numeric
        for c in ["track_temperature", "rainfall", "wind_speed"]:
            if c not in m.columns:
                m[c] = 0.0
            m[c] = pd.to_numeric(m[c], errors="coerce").fillna(0.0)

        m = m.drop(columns=["date"], errors="ignore")

    else:
        # weather unavailable -> default zeros
        for c in ["track_temperature", "rainfall", "wind_speed"]:
            if c not in m.columns:
                m[c] = 0.0

    # Race control flags
    m["flag_yellow"] = 0
    m["flag_safetycar"] = 0
    if not rc.empty and "lap_number" in rc.columns:
        rc["lap_number"] = pd.to_numeric(rc["lap_number"], errors="coerce")
        rc = rc.dropna(subset=["lap_number"])
        rc["lap_number"] = rc["lap_number"].astype(int)
        rc["flag"] = rc.get("flag", "").fillna("").astype(str)
        rc["category"] = rc.get("category", "").fillna("").astype(str)
        yellow = set(rc.loc[rc["flag"].str.contains("YELLOW", case=False, na=False), "lap_number"].tolist())
        sc = set(rc.loc[rc["category"].str.contains("SafetyCar", case=False, na=False), "lap_number"].tolist())
        m["flag_yellow"] = m["lap_number"].astype(int).isin(yellow).astype(int)
        m["flag_safetycar"] = m["lap_number"].astype(int).isin(sc).astype(int)

    # Meta
    m["circuit_short_name"] = str(meta.get("circuit_short_name", "UNKNOWN"))
    m["country_name"] = str(meta.get("country_name", "UNKNOWN"))
    ds = meta.get("date_start", "")
    try:
        m["year"] = int(str(ds)[:4])
    except:
        m["year"] = 0

    return m.reset_index(drop=True)