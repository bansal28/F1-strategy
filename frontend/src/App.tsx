import { useEffect, useMemo, useState, useRef } from "react";
import "./App.css";

type SessionDto = {
  session_key?: number;
  year?: number;
  country_name?: string;
  location?: string;
  circuit_short_name?: string;
  session_name?: string;
  date_start?: string;
};

type DriverDto = {
  driver_number?: number;
  name_acronym?: string;
  team_name?: string;
};

type PitCurvePoint = { laps_ahead: number; p: number };

type PitWindowResponse = {
  k_window: number;
  threshold: number;
  p_pit_within_k: number;
  p_no_pit_within_k: number;
  pit_curve: PitCurvePoint[];
  best_laps_ahead: number;
  decision: string;
};

const API_BASE = "http://localhost:8000";

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
function pct(x: number) { return `${Math.round(clamp01(x) * 100)}%`; }
function f3(x: number) { return Number.isFinite(x) ? x.toFixed(3) : "—"; }

const TEAM_COLORS: Record<string, string> = {
  "Red Bull Racing": "#3671C6",
  Ferrari: "#E10600",
  Mercedes: "#00D2BE",
  McLaren: "#FF8700",
  "Aston Martin": "#006F62",
  Alpine: "#2293D1",
  "Haas F1 Team": "#B6BABD",
  Williams: "#64C4FF",
  Sauber: "#52E252",
  RB: "#2B4562",
  AlphaTauri: "#2B4562",
  "Kick Sauber": "#52E252",
};

const COMPOUND_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  SOFT:         { bg: "#E10600", text: "#fff",    label: "S" },
  MEDIUM:       { bg: "#FFD700", text: "#000",    label: "M" },
  HARD:         { bg: "#e8e8e8", text: "#000",    label: "H" },
  INTERMEDIATE: { bg: "#39B54A", text: "#fff",    label: "I" },
  WET:          { bg: "#0067FF", text: "#fff",    label: "W" },
  UNKNOWN:      { bg: "#555",    text: "#ccc",    label: "?" },
};

function teamColor(team?: string) {
  if (!team) return "#E10600";
  return TEAM_COLORS[team] ?? "#E10600";
}

/* ─── START LIGHTS ─────────────────────────────────────── */
function StartLights({ phase }: { phase: "idle" | "loading" | "pit" | "stay" }) {
  const lights = [0, 1, 2, 3, 4];
  return (
    <div className="startLights">
      {lights.map((i) => (
        <div
          key={i}
          className={`light ${phase === "loading" || phase === "pit" || phase === "stay" ? "on" : ""}`}
          style={{ animationDelay: `${i * 0.18}s` }}
          data-phase={phase}
        />
      ))}
    </div>
  );
}

/* ─── RPM GAUGE ─────────────────────────────────────────── */
function RpmGauge({ p }: { p: number }) {
  const angle = -135 + clamp01(p) * 270;
  const r = 72;
  const cx = 90; const cy = 90;
  const arcPath = (from: number, to: number, color: string) => {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const fx = cx + r * Math.cos(toRad(from - 90));
    const fy = cy + r * Math.sin(toRad(from - 90));
    const tx = cx + r * Math.cos(toRad(to - 90));
    const ty = cy + r * Math.sin(toRad(to - 90));
    const large = to - from > 180 ? 1 : 0;
    return <path d={`M ${fx} ${fy} A ${r} ${r} 0 ${large} 1 ${tx} ${ty}`} stroke={color} strokeWidth="10" fill="none" strokeLinecap="round" />;
  };

  const needleRad = ((angle) * Math.PI) / 180;
  const nx = cx + 60 * Math.sin(needleRad);
  const ny = cy - 60 * Math.cos(needleRad);

  return (
    <svg className="rpmGauge" viewBox="0 0 180 180">
      {/* track */}
      {arcPath(-135, 135, "rgba(255,255,255,0.08)")}
      {/* green zone 0-60% */}
      {p > 0 && arcPath(-135, -135 + Math.min(clamp01(p), 0.6) * 270, "rgba(0,210,120,0.9)")}
      {/* yellow zone 60-80% */}
      {p > 0.6 && arcPath(-135 + 0.6 * 270, -135 + Math.min(clamp01(p), 0.8) * 270, "#FFD700")}
      {/* red zone 80-100% */}
      {p > 0.8 && arcPath(-135 + 0.8 * 270, -135 + clamp01(p) * 270, "#E10600")}
      {/* needle */}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="white" strokeWidth="3" strokeLinecap="round" className="needle" />
      <circle cx={cx} cy={cy} r="6" fill="white" />
      {/* labels */}
      <text x={cx} y={cy + 22} textAnchor="middle" className="gaugeValue">{Math.round(clamp01(p) * 100)}%</text>
      <text x={cx} y={cy + 36} textAnchor="middle" className="gaugeLabel">PIT PROB</text>
      {[0, 25, 50, 75, 100].map((v, i) => {
        const a = (-135 + (v / 100) * 270) * (Math.PI / 180);
        const lx = cx + 84 * Math.sin(a);
        const ly = cy - 84 * Math.cos(a);
        return <text key={i} x={lx} y={ly + 4} textAnchor="middle" className="gaugeTick">{v}</text>;
      })}
    </svg>
  );
}

/* ─── TYRE COMPOUND BADGE ───────────────────────────────── */
function TyreBadge({ compound }: { compound?: string }) {
  const c = COMPOUND_COLORS[compound?.toUpperCase() ?? "UNKNOWN"] ?? COMPOUND_COLORS.UNKNOWN;
  return (
    <span className="tyreBadge" style={{ background: c.bg, color: c.text }}>
      {c.label}
    </span>
  );
}

/* ─── TIMING TOWER ROW ──────────────────────────────────── */
function TimingRow({ rank, label, value, highlight }: { rank: number; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`timingRow ${highlight ? "timingRowHi" : ""}`}>
      <span className="timingRank">{rank}</span>
      <span className="timingLabel">{label}</span>
      <span className="timingValue">{value}</span>
    </div>
  );
}

/* ─── PIT CURVE CHART ───────────────────────────────────── */
function PitCurveChart({ points, highlight, lapNumber }: { points: PitCurvePoint[]; highlight: number; lapNumber: number }) {
  const w = 640; const h = 220; const pad = 28;
  const maxY = Math.max(...points.map((p) => p.p), 1e-9);
  const xs = (i: number) => pad + (i / Math.max(1, points.length - 1)) * (w - 2 * pad);
  const ys = (v: number) => h - pad - (v / maxY) * (h - 2 * pad);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xs(i)} ${ys(p.p)}`).join(" ");
  const area = d + ` L ${xs(points.length - 1)} ${h - pad} L ${xs(0)} ${h - pad} Z`;

  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(120,190,255,0.35)" />
          <stop offset="100%" stopColor="rgba(120,190,255,0.0)" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* grid lines */}
      {Array.from({ length: 5 }).map((_, i) => {
        const y = pad + (i / 4) * (h - 2 * pad);
        return <line key={i} x1={pad} y1={y} x2={w - pad} y2={y} className="grid" />;
      })}

      {/* highlight column */}
      <rect
        x={xs(highlight) - 18}
        y={pad}
        width={36}
        height={h - 2 * pad}
        fill="rgba(225,6,0,0.08)"
        rx={6}
      />

      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} className="axis" />
      <line x1={pad} y1={pad} x2={pad} y2={h - pad} className="axis" />

      {/* area fill */}
      <path d={area} fill="url(#chartGrad)" />
      {/* line */}
      <path d={d} className="line" filter="url(#glow)" />

      {points.map((p, i) => {
        const isHi = p.laps_ahead === highlight;
        return (
          <g key={p.laps_ahead} className="chartDot">
            {isHi && <circle cx={xs(i)} cy={ys(p.p)} r={14} fill="rgba(225,6,0,0.15)" className="dotPulse" />}
            <circle cx={xs(i)} cy={ys(p.p)} r={isHi ? 7 : 4} className={isHi ? "dotHi" : "dot"} />
            <text x={xs(i)} y={h - 8} textAnchor="middle" className="tick">+{p.laps_ahead}</text>
            <text x={xs(i)} y={h - 8 - 14} textAnchor="middle" className="tick" style={{ opacity: 0.5, fontSize: "9px" }}>
              L{lapNumber + p.laps_ahead}
            </text>
          </g>
        );
      })}

      <text x={pad + 4} y={18} className="tick" style={{ fontSize: "10px" }}>p={f3(maxY)}</text>
      <text x={w - pad} y={18} textAnchor="end" className="tick" style={{ fontSize: "10px" }}>laps ahead →</text>
    </svg>
  );
}

/* ─── RADIO DECISION ────────────────────────────────────── */
function RadioDecision({ decision, prob }: { decision: string; prob: number }) {
  const isPit = decision === "PIT_SOON";
  const [displayed, setDisplayed] = useState("");
  const msg = isPit ? "BOX BOX BOX" : "STAY OUT";

  useEffect(() => {
    setDisplayed("");
    let i = 0;
    const timer = setInterval(() => {
      setDisplayed(msg.slice(0, i + 1));
      i++;
      if (i >= msg.length) clearInterval(timer);
    }, 60);
    return () => clearInterval(timer);
  }, [msg]);

  return (
    <div className={`radioDecision ${isPit ? "radioPit" : "radioStay"}`}>
      <div className="radioHeader">
        <span className="radioDot" />
        <span className="radioLabel">TEAM RADIO</span>
        <span className="radioSignal">▋▋▋</span>
      </div>
      <div className="radioMsg">{displayed}<span className="radioCursor">|</span></div>
      <div className="radioSub">{isPit ? `p=${f3(prob)} — pit window open` : `p=${f3(prob)} — tyres acceptable`}</div>
    </div>
  );
}

/* ─── SECTOR MINI BARS ──────────────────────────────────── */
function SectorBar({ label, val, max }: { label: string; val: number; max: number }) {
  const pct = max > 0 ? (val / max) * 100 : 0;
  const color = pct < 40 ? "#39B54A" : pct < 70 ? "#FFD700" : "#E10600";
  return (
    <div className="sectorBar">
      <span className="sectorLabel">{label}</span>
      <div className="sectorTrack">
        <div className="sectorFill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="sectorVal">{val > 0 ? val.toFixed(3) + "s" : "—"}</span>
    </div>
  );
}

/* ─── MAIN APP ──────────────────────────────────────────── */
export default function App() {
  const [health, setHealth] = useState<string>("checking...");
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");

  const [year, setYear] = useState<number>(2024);
  const [sessions, setSessions] = useState<SessionDto[]>([]);
  const [sessionKey, setSessionKey] = useState<number | null>(null);

  const [drivers, setDrivers] = useState<DriverDto[]>([]);
  const [driverNumber, setDriverNumber] = useState<number | null>(null);

  const [lapNumber, setLapNumber] = useState<number>(20);
  const [threshold, setThreshold] = useState<number>(0.6);

  const [result, setResult] = useState<PitWindowResponse | null>(null);
  const [lightPhase, setLightPhase] = useState<"idle" | "loading" | "pit" | "stay">("idle");
  const [animatedProb, setAnimatedProb] = useState(0);

  const selectedSession = useMemo(() => sessions.find((s) => s.session_key === sessionKey) ?? null, [sessions, sessionKey]);
  const selectedDriver = useMemo(() => drivers.find((d) => d.driver_number === driverNumber) ?? null, [drivers, driverNumber]);
  const accent = useMemo(() => teamColor(selectedDriver?.team_name), [selectedDriver?.team_name]);

  // Animate probability counter
  useEffect(() => {
    if (!result) { setAnimatedProb(0); return; }
    const target = result.p_pit_within_k;
    let current = 0;
    const step = target / 40;
    const timer = setInterval(() => {
      current = Math.min(current + step, target);
      setAnimatedProb(current);
      if (current >= target) clearInterval(timer);
    }, 20);
    return () => clearInterval(timer);
  }, [result]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/health`);
        const j = await r.json();
        setHealth(JSON.stringify(j));
      } catch (e: any) {
        setHealth(`offline`);
      }
    })();
  }, []);

  async function loadSessions() {
    setError(""); setResult(null); setDrivers([]); setDriverNumber(null); setSessionKey(null);
    setStatus("Fetching race calendar...");
    try {
      const r = await fetch(`${API_BASE}/sessions?year=${year}&session_name=Race`);
      const j = (await r.json()) as SessionDto[];
      setSessions(j.filter((s) => s.session_key != null));
      setStatus(`${j.length} races loaded for ${year}`);
    } catch (e: any) {
      setError(`Sessions error: ${e?.message ?? e}`); setStatus("");
    }
  }

  async function loadDrivers() {
    if (sessionKey == null) return;
    setError(""); setResult(null); setDrivers([]); setDriverNumber(null);
    setStatus("Loading grid...");
    try {
      const r = await fetch(`${API_BASE}/session/${sessionKey}/drivers`);
      const j = (await r.json()) as DriverDto[];
      setDrivers(j.filter((d) => d.driver_number != null));
      setStatus("Grid loaded");
    } catch (e: any) {
      setError(`Drivers error: ${e?.message ?? e}`); setStatus("");
    }
  }

  async function predict() {
    if (sessionKey == null || driverNumber == null) return;
    setError(""); setResult(null); setLightPhase("loading");
    setStatus("Analysing telemetry...");
    try {
      const r = await fetch(`${API_BASE}/predict/pit-window`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_key: sessionKey, driver_number: driverNumber, lap_number: lapNumber, threshold }),
      });
      if (!r.ok) { const t = await r.text(); throw new Error(`${r.status}: ${t}`); }
      const j = (await r.json()) as PitWindowResponse;

      // lights out animation
      await new Promise(res => setTimeout(res, 1200));
      setLightPhase(j.decision === "PIT_SOON" ? "pit" : "stay");
      await new Promise(res => setTimeout(res, 600));
      setLightPhase("idle");

      setResult(j);
      setStatus("Analysis complete");
    } catch (e: any) {
      setError(`Predict error: ${e?.message ?? e}`); setStatus(""); setLightPhase("idle");
    }
  }

  const top3 = useMemo(() => {
    if (!result) return [];
    return [...result.pit_curve].sort((a, b) => b.p - a.p).slice(0, 3);
  }, [result]);

  const pitLap = result ? lapNumber + result.best_laps_ahead : null;
  const pitWindow = result
    ? { from: lapNumber + Math.max(0, result.best_laps_ahead - 1), to: lapNumber + Math.min(result.k_window - 1, result.best_laps_ahead + 1) }
    : null;

  return (
    <div className="page" style={{ ["--accent" as any]: accent }}>
      {/* Animated background scanlines */}
      <div className="scanlines" aria-hidden="true" />
      <div className="speedLines" aria-hidden="true" />

      {/* ── HEADER ── */}
      <header className="hero">
        <div className="heroFlag" aria-hidden="true" />
        <div className="heroContent">
          <div className="heroLeft">
            <div className="titleRow">
              <div className="f1Logo">F1</div>
              <div>
                <h1>Strategy Advisor</h1>
                <p className="sub">Real-time pit window prediction from live telemetry</p>
              </div>
            </div>
            <div className="heroTags">
              <span className="tag">Two-Stage ML</span>
              <span className="tag">Live Telemetry</span>
              <span className="tag">FastAPI</span>
              <span className="tag tagAccent">K=10 Lap Window</span>
            </div>
          </div>
          <div className="heroRight">
            <div className={`backendStatus ${health.includes("ok") ? "online" : "offline"}`}>
              <span className="statusDot" />
              <span className="statusLabel">BACKEND</span>
              <code>{health}</code>
            </div>
            <StartLights phase={lightPhase} />
          </div>
        </div>
        {/* Animated racing stripe */}
        <div className="heroStripe" aria-hidden="true" />
      </header>

      {/* ── MAIN GRID ── */}
      <div className="mainGrid">

        {/* ── LEFT: SCENARIO PANEL ── */}
        <section className="panel panelScenario">
          <div className="panelHeader">
            <h2>Race Scenario</h2>
            {selectedDriver?.team_name && (
              <span className="teamBadge" style={{ background: accent + "22", borderColor: accent + "55", color: accent }}>
                {selectedDriver.team_name}
              </span>
            )}
          </div>

          {/* Driver card */}
          <div className="driverCard" style={{ borderColor: accent + "44" }}>
            <div className="driverAvatar" style={{ borderColor: accent, background: accent + "18" }}>
              <span>{(selectedDriver?.name_acronym ?? "DRV").slice(0, 3).toUpperCase()}</span>
            </div>
            <div className="driverInfo">
              <div className="driverName">
                {selectedDriver ? `${selectedDriver.name_acronym} #${selectedDriver.driver_number}` : "Select a driver"}
              </div>
              <div className="driverCircuit">
                {selectedSession
                  ? `${selectedSession.circuit_short_name} · ${selectedSession.country_name}`
                  : "Select a race session"}
              </div>
              {selectedDriver && (
                <div className="driverTeamStripe" style={{ background: accent }} />
              )}
            </div>
            <div className="driverNumber" style={{ color: accent + "55" }}>
              {selectedDriver?.driver_number ?? "—"}
            </div>
          </div>

          {/* Controls */}
          <div className="controls">
            <div className="controlRow">
              <div className="controlGroup">
                <label className="controlLabel">SEASON</label>
                <input className="inp" type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value || "2024", 10))} />
              </div>
              <button className="btn" onClick={loadSessions}>Load Calendar</button>
            </div>

            <div className="controlGroup">
              <label className="controlLabel">RACE</label>
              <select className="inp" value={sessionKey ?? ""} onChange={(e) => setSessionKey(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— choose race —</option>
                {sessions.map((s) => (
                  <option key={s.session_key} value={s.session_key}>
                    {s.circuit_short_name} · {s.country_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="controlRow">
              <button className="btn" disabled={sessionKey == null} onClick={loadDrivers}>Load Grid</button>
              {selectedSession && <span className="controlHint">✓ {selectedSession.circuit_short_name}</span>}
            </div>

            <div className="controlGroup">
              <label className="controlLabel">DRIVER</label>
              <select className="inp" value={driverNumber ?? ""} onChange={(e) => setDriverNumber(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— choose driver —</option>
                {drivers.map((d) => (
                  <option key={d.driver_number} value={d.driver_number}>
                    {d.name_acronym} #{d.driver_number} · {d.team_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="controlRow">
              <div className="controlGroup">
                <label className="controlLabel">CURRENT LAP</label>
                <input className="inp inpSmall" type="number" min={1} value={lapNumber}
                  onChange={(e) => setLapNumber(parseInt(e.target.value || "1", 10))} />
              </div>
              <div className="controlGroup" style={{ flex: 2 }}>
                <label className="controlLabel">
                  THRESHOLD <span className="thresholdVal">{threshold.toFixed(2)}</span>
                  <span className="thresholdHint">{threshold < 0.45 ? "aggressive" : threshold > 0.65 ? "conservative" : "balanced"}</span>
                </label>
                <input type="range" className="slider" min={0.2} max={0.9} step={0.05} value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value))} />
              </div>
            </div>

            <button
              className={`btnPredict ${sessionKey != null && driverNumber != null ? "btnPredictReady" : ""}`}
              disabled={sessionKey == null || driverNumber == null}
              onClick={predict}
            >
              <span className="btnPredictDrs">DRS</span>
              ANALYSE PIT WINDOW
            </button>
          </div>

          {status && <div className="statusMsg"><span className="statusBlip" />{status}</div>}
          {error && <div className="errorMsg">{error}</div>}
        </section>

        {/* ── RIGHT: RESULTS PANEL ── */}
        <section className="panel panelResults">
          <div className="panelHeader">
            <h2>Strategy Recommendation</h2>
            {result && <span className="tag">k={result.k_window} lap window</span>}
          </div>

          {!result && (
            <div className="emptyState">
              <div className="emptyTrack">
                <div className="emptyCarDot" />
              </div>
              <p>Select a race, driver, and lap — then click <strong>Analyse Pit Window</strong></p>
            </div>
          )}

          {result && (
            <div className="resultsContent">
              {/* Decision + Gauge row */}
              <div className="decisionRow">
                <RadioDecision decision={result.decision} prob={result.p_pit_within_k} />
                <RpmGauge p={animatedProb} />
              </div>

              {/* Metrics row */}
              <div className="metricsRow">
                <div className="metricBox">
                  <div className="metricLabel">PIT PROBABILITY</div>
                  <div className="metricValue" style={{ color: animatedProb > 0.6 ? "#E10600" : animatedProb > 0.4 ? "#FFD700" : "#39B54A" }}>
                    {pct(animatedProb)}
                  </div>
                  <div className="metricSub">p = {f3(result.p_pit_within_k)}</div>
                </div>
                <div className="metricBox">
                  <div className="metricLabel">RECOMMENDED LAP</div>
                  <div className="metricValue">Lap {pitLap}</div>
                  <div className="metricSub">best guess: +{result.best_laps_ahead} laps</div>
                </div>
                <div className="metricBox">
                  <div className="metricLabel">PIT WINDOW</div>
                  <div className="metricValue" style={{ fontSize: "18px" }}>
                    {pitWindow ? `L${pitWindow.from}–${pitWindow.to}` : "—"}
                  </div>
                  <div className="metricSub">±1 lap around best</div>
                </div>
              </div>

              {/* Timing tower */}
              <div className="block">
                <div className="blockHeader">
                  <h3>Pit Timing Distribution</h3>
                  <span className="blockSub">top 3 windows ranked by probability</span>
                </div>
                <div className="timingTower">
                  <div className="timingHeader">
                    <span>RANK</span><span>WINDOW</span><span>PROBABILITY</span>
                  </div>
                  {top3.map((p, i) => (
                    <TimingRow
                      key={p.laps_ahead}
                      rank={i + 1}
                      label={`+${p.laps_ahead} laps · Lap ${lapNumber + p.laps_ahead}`}
                      value={pct(p.p)}
                      highlight={i === 0}
                    />
                  ))}
                </div>
              </div>

              {/* Chart */}
              <div className="block">
                <div className="blockHeader">
                  <h3>Full Probability Curve</h3>
                  <span className="blockSub"><span style={{ color: "#E10600" }}>●</span> = highest probability lap</span>
                </div>
                <PitCurveChart points={result.pit_curve} highlight={result.best_laps_ahead} lapNumber={lapNumber} />
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ── INFO CARDS ── */}
      <div className="infoGrid">
        <div className="infoCard">
          <h3>Why not "predicting the past"?</h3>
          <p>We train on historical races because that's where labels exist. At inference time we only use information <strong>up to the chosen lap</strong> — pace trends, tyre age, gaps, flags, weather. Same workflow as real forecasting systems.</p>
        </div>
        <div className="infoCard">
          <h3>What does the threshold do?</h3>
          <p>The model outputs <strong>p = P(pit within 10 laps)</strong>. If p ≥ threshold → <span style={{ color: "#E10600" }}>PIT SOON</span>. Lower threshold = more aggressive. Higher = fewer false alarms. Default 0.60.</p>
        </div>
        <div className="infoCard">
          <h3>How it was trained</h3>
          <p>70 races from 2023–2024. Features: tyre compound + age, stint age, lap pace, sector splits, gap to leader, safety car flags, track temp. Test: 2025 season (fully unseen).</p>
        </div>
      </div>

      <footer className="footer">
        Built with OpenF1 telemetry · FastAPI inference · React UI
        <span className="footerFlag" aria-hidden="true" />
      </footer>
    </div>
  );
}