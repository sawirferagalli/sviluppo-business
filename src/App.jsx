import { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";

// Apple-inspired system palette: one neutral canvas, category colors used
// the way iOS Health badges each metric — kept off everything except icons,
// charts and the one primary action.
const C_INK = "#1D1D1F";
const C_GRAY = "#6E6E73";
const C_GRAY_LIGHT = "#F5F5F7";
const C_LINE = "#E5E5EA";
const C_GREEN = "#30B463";
const C_BLUE = "#0A84FF";
const C_PURPLE = "#BF5AF2";
const C_ORANGE = "#FF9F0A";
const C_PINK = "#FF375F";

const PIE_COLORS = [C_GREEN, C_BLUE, C_ORANGE, C_PURPLE, C_PINK];

const SECTOR_OPTIONS = [
  "SaaS / Tech",
  "Fintech",
  "Healthtech",
  "E-commerce",
  "Marketplace",
  "Consumer / App",
  "Altro",
];

const MODEL_OPTIONS = [
  "Abbonamento (SaaS)",
  "Commissioni (Marketplace)",
  "Vendita diretta (E-commerce)",
  "Licensing / B2B",
  "Altro",
];

const STAGE_OPTIONS = [
  "Idea / Pre-seed",
  "MVP costruito",
  "Early revenue",
  "Scaling",
];

const EMPTY_FORM = {
  name: "",
  idea: "",
  sector: SECTOR_OPTIONS[0],
  market: "",
  businessModel: MODEL_OPTIONS[0],
  stage: STAGE_OPTIONS[0],
  fundingAsk: "",
  edge: "",
};

function parseEuroAmount(str) {
  if (!str) return null;
  const lower = String(str).toLowerCase();
  let multiplier = 1;
  if (/mln|milioni/.test(lower)) multiplier = 1_000_000;
  else if (/k\b/.test(lower)) multiplier = 1_000;
  const digits = lower.replace(/[^\d]/g, "");
  if (!digits) return null;
  return Math.round(parseInt(digits, 10) * multiplier);
}

function formatEUR(num) {
  if (num === null || num === undefined || Number.isNaN(num)) return "—";
  try {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(num);
  } catch {
    return `€${num}`;
  }
}

function buildPrompt(form, parsedBudget) {
  return [
    `Startup: ${form.name || "Senza nome"}`,
    `Idea di business: ${form.idea}`,
    `Settore: ${form.sector}`,
    `Mercato geografico target: ${form.market || "non specificato"}`,
    `Modello di business: ${form.businessModel}`,
    `Fase attuale: ${form.stage}`,
    `Budget/capitale disponibile: ${
      parsedBudget ? `${parsedBudget} euro` : form.fundingAsk || "non specificato, stimalo tu"
    }`,
    form.edge ? `Vantaggio competitivo dichiarato: ${form.edge}` : null,
    "",
    "Scrivi un piano di investimento per questa startup seed-stage, pensato per convincere investitori.",
    "Ancora tutte le proiezioni finanziarie e l'allocazione del capitale al budget indicato sopra: i costi, i ricavi e le percentuali di allocazione devono essere coerenti con quella cifra, non generici.",
  ]
    .filter(Boolean)
    .join("\n");
}

const SYSTEM_PROMPT = `Sei un analista che costruisce piani di investimento concisi per startup seed-stage, in italiano, per convincere investitori a finanziarle.
Rispondi SOLO con un oggetto JSON valido, senza markdown, senza backtick, senza testo introduttivo o finale.
Usa esattamente questo schema, con questi tipi di dato:
{
  "executive_summary": "stringa, massimo 3 frasi",
  "market": {"tam_eur": numero, "sam_eur": numero, "som_eur": numero, "target": "stringa breve", "competitors": "stringa breve"},
  "business_model": {"revenue_streams": "stringa breve", "pricing": "stringa breve"},
  "financials": {
    "assumptions": "stringa, massimo 2 frasi",
    "projections": [{"year":1,"revenue_eur":numero,"costs_eur":numero},{"year":2,"revenue_eur":numero,"costs_eur":numero},{"year":3,"revenue_eur":numero,"costs_eur":numero}],
    "breakeven_month": numero (mese 1-36),
    "use_of_funds": [{"category":"stringa breve","percent":numero}, ... tra 3 e 5 categorie, i percent devono sommare esattamente a 100]
  },
  "pitch": {"problem":"stringa breve","solution":"stringa breve","why_now":"stringa breve","ask_eur": numero}
}
Regole importanti:
- Tutti i valori monetari (tam_eur, sam_eur, som_eur, revenue_eur, costs_eur, ask_eur) sono NUMERI interi in euro, senza simboli, punti, virgole o testo.
- ask_eur deve corrispondere al budget indicato dall'utente, se fornito.
- I costi annui devono essere coerenti con un budget di quella entità (non sparare numeri arbitrari).
- use_of_funds: i "percent" devono sommare esattamente a 100.
- Ogni campo di testo è una singola riga, senza interruzioni di riga reali, massimo 2-3 frasi.
- SOM <= SAM <= TAM.`;

function extractJsonCandidate(rawText) {
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1) cleaned = cleaned.slice(start, end + 1);
  return cleaned;
}

function parsePlan(rawText) {
  const candidate = extractJsonCandidate(rawText);
  try {
    return JSON.parse(candidate);
  } catch (_) {
    // fall through
  }
  const sanitized = candidate.replace(/[\r\n\t]+/g, " ");
  return JSON.parse(sanitized);
}

function computeRunwayLabel(budget, projections) {
  if (!budget || !projections || !projections.length) return "Non calcolabile";
  let cumulative = budget;
  for (const p of projections) {
    cumulative += (p.revenue_eur || 0) - (p.costs_eur || 0);
    if (cumulative < 0) return `Entro l'anno ${p.year}`;
  }
  return "Sostenibile nei 3 anni";
}

// Counts up from 0 to `value` with an ease-out curve — the small piece of
// motion that gives the summary tiles the "Health app filling in" feeling.
function AnimatedNumber({ value, format, duration = 900 }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      setDisplay(0);
      return;
    }
    let start = null;
    let raf;
    function step(ts) {
      if (start === null) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(value * eased);
      if (progress < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span>{format(display)}</span>;
}

function IconBadge({ color, path, viewBox = "0 0 24 24" }) {
  return (
    <span className="bpg-icon-badge" style={{ background: color }}>
      <svg width="16" height="16" viewBox={viewBox} fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </span>
  );
}

const ICONS = {
  market: "M4 19V9m6 10V5m6 14v-7m6 7V3",
  funds: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  growth: "M3 17l5-5 4 4 8-8M15 8h5v5",
  wave: "M2 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0",
  flag: "M5 21V4m0 0h11l-2.5 3.5L16 11H5",
};

function Field({ label, children, hint }) {
  return (
    <label className="bpg-field">
      <span className="bpg-field-label">{label}</span>
      {children}
      {hint ? <span className="bpg-field-hint">{hint}</span> : null}
    </label>
  );
}

function StatTile({ label, color, children, delay = 0 }) {
  return (
    <div className="bpg-stat-tile bpg-enter" style={{ animationDelay: `${delay}ms` }}>
      <span className="bpg-stat-dot" style={{ background: color }} />
      <span className="bpg-stat-label">{label}</span>
      <span className="bpg-stat-value">{children}</span>
    </div>
  );
}

function Section({ icon, color, title, children, caption, delay = 0 }) {
  return (
    <section className="bpg-section bpg-enter" style={{ animationDelay: `${delay}ms` }}>
      <div className="bpg-section-head">
        <IconBadge color={color} path={icon} />
        <h3 className="bpg-section-title">{title}</h3>
      </div>
      <div className="bpg-section-body">{children}</div>
      {caption ? <p className="bpg-caption">{caption}</p> : null}
    </section>
  );
}

function ChartTooltipEUR({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bpg-chart-tooltip">
      <div className="bpg-chart-tooltip-label">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="bpg-chart-tooltip-row">
          <span style={{ color: p.color }}>●</span> {p.name}: {formatEUR(p.value)}
        </div>
      ))}
    </div>
  );
}

function MarketFunnelChart({ tam, sam, som }) {
  const data = [
    { name: "TAM", value: tam || 0 },
    { name: "SAM", value: sam || 0 },
    { name: "SOM", value: som || 0 },
  ];
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
        <CartesianGrid stroke={C_LINE} horizontal={false} />
        <XAxis type="number" tickFormatter={(v) => formatEUR(v)} tick={{ fontSize: 11, fill: C_GRAY }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={48} tick={{ fontSize: 13, fill: C_INK, fontWeight: 600 }} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltipEUR />} />
        <Bar dataKey="value" name="Valore" radius={[8, 8, 8, 8]} animationDuration={900} animationEasing="ease-out">
          {data.map((_, i) => (
            <Cell key={i} fill={[C_BLUE, "#4DA3FF", "#9AC9FF"][i]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function FinancialsChart({ projections }) {
  const data = (projections || []).map((p) => ({
    year: `Anno ${p.year}`,
    Ricavi: p.revenue_eur || 0,
    Costi: p.costs_eur || 0,
  }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }} barGap={6}>
        <CartesianGrid stroke={C_LINE} vertical={false} />
        <XAxis dataKey="year" tick={{ fontSize: 12, fill: C_INK }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={(v) => formatEUR(v)} tick={{ fontSize: 11, fill: C_GRAY }} width={70} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltipEUR />} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
        <Bar dataKey="Ricavi" fill={C_GREEN} radius={[8, 8, 0, 0]} animationDuration={900} animationEasing="ease-out" />
        <Bar dataKey="Costi" fill={C_ORANGE} radius={[8, 8, 0, 0]} animationDuration={900} animationEasing="ease-out" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CashBalanceChart({ budget, projections }) {
  let cumulative = budget || 0;
  const data = [{ year: "Oggi", cash: cumulative }];
  (projections || []).forEach((p) => {
    cumulative += (p.revenue_eur || 0) - (p.costs_eur || 0);
    data.push({ year: `Anno ${p.year}`, cash: Math.round(cumulative) });
  });
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid stroke={C_LINE} vertical={false} />
        <XAxis dataKey="year" tick={{ fontSize: 12, fill: C_INK }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={(v) => formatEUR(v)} tick={{ fontSize: 11, fill: C_GRAY }} width={70} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltipEUR />} />
        <ReferenceLine y={0} stroke={C_GRAY} strokeDasharray="4 4" />
        <Line type="monotone" dataKey="cash" name="Liquidità disponibile" stroke={C_ORANGE} strokeWidth={3} dot={{ r: 5, fill: C_ORANGE, strokeWidth: 0 }} animationDuration={1000} animationEasing="ease-out" />
      </LineChart>
    </ResponsiveContainer>
  );
}

function UseOfFundsPie({ useOfFunds, budget }) {
  const data = (useOfFunds || []).map((u) => ({
    name: u.category,
    value: u.percent,
    eur: budget ? Math.round((budget * u.percent) / 100) : null,
  }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={3} animationDuration={900} animationEasing="ease-out">
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, name, props) => [
            `${value}%${props.payload.eur ? ` — ${formatEUR(props.payload.eur)}` : ""}`,
            name,
          ]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
      </PieChart>
    </ResponsiveContainer>
  );
}

export default function BusinessPlanGenerator() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [view, setView] = useState("welcome");
  const [welcomeGreeted, setWelcomeGreeted] = useState(false);
  const [plan, setPlan] = useState(null);
  const [rawPlanText, setRawPlanText] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [copyLabel, setCopyLabel] = useState("Copia come testo");

  const canSubmit = form.name.trim().length > 0 && form.idea.trim().length > 10;
  const parsedBudget = parseEuroAmount(form.fundingAsk);

  function update(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function generate() {
    setView("loading");
    setErrorMsg("");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildPrompt(form, parsedBudget) }],
        }),
      });

      if (!response.ok) throw new Error(`Richiesta fallita (status ${response.status})`);

      const data = await response.json();
      const textBlock = (data.content || []).find((b) => b.type === "text");
      if (!textBlock || !textBlock.text) throw new Error("Risposta vuota dal modello.");

      try {
        const parsed = parsePlan(textBlock.text);
        setPlan(parsed);
        setView("result");
      } catch (_) {
        setRawPlanText(textBlock.text);
        setView("raw");
      }
    } catch (err) {
      setErrorMsg(err.message || "Errore imprevisto durante la generazione.");
      setView("error");
    }
  }

  function planAsText() {
    if (!plan) return "";
    const budget = parsedBudget || plan.pitch?.ask_eur;
    return [
      `PIANO DI INVESTIMENTO — ${form.name}`,
      "",
      "EXECUTIVE SUMMARY",
      plan.executive_summary,
      "",
      "ANALISI DI MERCATO",
      `TAM: ${formatEUR(plan.market?.tam_eur)} — SAM: ${formatEUR(plan.market?.sam_eur)} — SOM: ${formatEUR(plan.market?.som_eur)}`,
      `Target: ${plan.market?.target}`,
      `Competitor: ${plan.market?.competitors}`,
      "",
      "ALLOCAZIONE DEL CAPITALE",
      `Ricavi: ${plan.business_model?.revenue_streams}`,
      `Pricing: ${plan.business_model?.pricing}`,
      ...(plan.financials?.use_of_funds || []).map((u) => `${u.category}: ${u.percent}%`),
      "",
      "PIANO FINANZIARIO",
      plan.financials?.assumptions,
      ...(plan.financials?.projections || []).map(
        (p) => `Anno ${p.year} — Ricavi: ${formatEUR(p.revenue_eur)}, Costi: ${formatEUR(p.costs_eur)}`
      ),
      `Break-even stimato: mese ${plan.financials?.breakeven_month}`,
      `Runway sul budget indicato: ${computeRunwayLabel(budget, plan.financials?.projections)}`,
      "",
      "PITCH PER INVESTITORI",
      `Problema: ${plan.pitch?.problem}`,
      `Soluzione: ${plan.pitch?.solution}`,
      `Perché ora: ${plan.pitch?.why_now}`,
      `Richiesta: ${formatEUR(plan.pitch?.ask_eur)}`,
    ].join("\n");
  }

  async function copyText() {
    const text = planAsText();
    try {
      await navigator.clipboard.writeText(text);
      setCopyLabel("Copiato ✓");
    } catch {
      setCopyLabel("Copia non disponibile");
    }
    setTimeout(() => setCopyLabel("Copia come testo"), 2000);
  }

  const budgetForCharts = plan ? parsedBudget || plan.pitch?.ask_eur : parsedBudget;
  const runwayLabel = plan ? computeRunwayLabel(budgetForCharts, plan.financials?.projections) : "";
  const runwayOk = runwayLabel === "Sostenibile nei 3 anni";

  return (
    <div className="bpg-app">
      <style>{`
        .bpg-app {
          --canvas: #F5F5F7;
          --surface: #FFFFFF;
          --ink: #1D1D1F;
          --gray: #6E6E73;
          --line: #E5E5EA;
          --green: #30B463;
          --blue: #0A84FF;
          --spring: cubic-bezier(0.34, 1.56, 0.64, 1);
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
          background: var(--canvas);
          color: var(--ink);
          min-height: 100%;
          padding: 48px 20px 90px;
          box-sizing: border-box;
          -webkit-font-smoothing: antialiased;
        }
        .bpg-app * { box-sizing: border-box; }
        .bpg-shell { max-width: 720px; margin: 0 auto; }

        .bpg-eyebrow {
          font-size: 13px; font-weight: 600; letter-spacing: 0.01em;
          color: var(--green); margin-bottom: 10px;
        }
        .bpg-h1 {
          font-size: 38px; font-weight: 700; line-height: 1.1;
          letter-spacing: -0.02em; margin: 0 0 12px; color: var(--ink);
        }
        .bpg-sub { color: var(--gray); font-size: 16px; line-height: 1.5; margin: 0 0 36px; max-width: 520px; }

        .bpg-card {
          background: var(--surface); border-radius: 24px; padding: 32px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.03), 0 12px 32px rgba(0,0,0,0.05);
        }

        .bpg-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px 20px; }
        .bpg-field { display: flex; flex-direction: column; gap: 8px; }
        .bpg-field-full { grid-column: 1 / -1; }
        .bpg-field-label { font-size: 13px; font-weight: 600; color: var(--ink); }
        .bpg-field-hint { font-size: 12.5px; color: var(--gray); }

        .bpg-input, .bpg-select, .bpg-textarea {
          font-family: inherit; font-size: 15px; color: var(--ink); background: var(--canvas);
          border: 1px solid transparent; border-radius: 14px; padding: 12px 14px; width: 100%;
          transition: transform 0.25s var(--spring), box-shadow 0.25s ease, background 0.25s ease;
        }
        .bpg-textarea { resize: vertical; min-height: 76px; }
        .bpg-input:hover, .bpg-select:hover, .bpg-textarea:hover { background: #EFEFF1; }
        .bpg-input:focus, .bpg-select:focus, .bpg-textarea:focus {
          outline: none; background: var(--surface);
          box-shadow: 0 0 0 4px rgba(10,132,255,0.18), 0 0 0 1.5px var(--blue);
          transform: scale(1.01);
        }

        .bpg-actions { margin-top: 30px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }

        .bpg-btn {
          font-family: inherit; font-size: 15px; font-weight: 600;
          border: none; border-radius: 980px; padding: 14px 28px; cursor: pointer;
          transition: transform 0.35s var(--spring), box-shadow 0.35s var(--spring), filter 0.25s ease, background 0.25s ease;
        }
        .bpg-btn-primary { background: var(--green); color: white; box-shadow: 0 4px 14px rgba(48,180,99,0.3); }
        .bpg-btn-primary:hover:not(:disabled) { transform: scale(1.045) translateY(-1px); box-shadow: 0 8px 22px rgba(48,180,99,0.4); filter: brightness(1.04); }
        .bpg-btn-primary:active:not(:disabled) { transform: scale(0.97); }
        .bpg-btn-primary:disabled { opacity: 0.35; cursor: not-allowed; box-shadow: none; }
        .bpg-btn-ghost { background: var(--canvas); color: var(--ink); }
        .bpg-btn-ghost:hover { transform: scale(1.04); background: #EAEAEC; }
        .bpg-btn-ghost:active { transform: scale(0.97); }
        .bpg-hint-row { font-size: 13.5px; color: var(--gray); }

        .bpg-loading { display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 100px 20px; text-align: center; }
        .bpg-spinner { width: 30px; height: 30px; border-radius: 50%; border: 3px solid var(--line); border-top-color: var(--green); animation: bpg-spin 0.7s linear infinite; }
        @keyframes bpg-spin { to { transform: rotate(360deg); } }
        .bpg-loading-text { font-size: 14px; color: var(--gray); }

        .bpg-error { background: #FFF1EE; color: #B3401E; border-radius: 18px; padding: 20px 22px; font-size: 14.5px; line-height: 1.5; }

        .bpg-memo-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 24px; }
        .bpg-memo-name { font-size: 26px; font-weight: 700; letter-spacing: -0.01em; }
        .bpg-memo-meta { font-size: 12.5px; color: var(--gray); }

        .bpg-stat-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 32px; }
        .bpg-stat-tile {
          background: var(--surface); border-radius: 20px; padding: 18px 16px;
          display: flex; flex-direction: column; gap: 6px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.03), 0 8px 20px rgba(0,0,0,0.04);
          transition: transform 0.35s var(--spring), box-shadow 0.35s var(--spring);
        }
        .bpg-stat-tile:hover { transform: translateY(-3px) scale(1.02); box-shadow: 0 14px 28px rgba(0,0,0,0.08); }
        .bpg-stat-dot { width: 8px; height: 8px; border-radius: 50%; }
        .bpg-stat-label { font-size: 12px; color: var(--gray); font-weight: 500; }
        .bpg-stat-value { font-family: ui-rounded, -apple-system, sans-serif; font-size: 19px; font-weight: 700; letter-spacing: -0.01em; }

        .bpg-section { margin-bottom: 28px; }
        .bpg-section-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
        .bpg-icon-badge { width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .bpg-section-title { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; margin: 0; }
        .bpg-section-body { background: var(--surface); border-radius: 20px; padding: 20px; box-shadow: 0 1px 2px rgba(0,0,0,0.03), 0 8px 20px rgba(0,0,0,0.04); }
        .bpg-caption { font-size: 13px; color: var(--gray); line-height: 1.5; margin: 10px 2px 0; }
        .bpg-summary-quote { font-size: 17px; line-height: 1.55; margin: 0; color: var(--ink); }
        .bpg-mini-row { display: flex; flex-direction: column; gap: 10px; }
        .bpg-mini-row div { font-size: 14.5px; color: var(--ink); line-height: 1.5; }
        .bpg-mini-row strong { color: var(--gray); font-weight: 600; }

        .bpg-chart-tooltip { background: var(--surface); border-radius: 10px; padding: 8px 10px; font-size: 12px; box-shadow: 0 4px 14px rgba(0,0,0,0.12); }
        .bpg-chart-tooltip-label { font-weight: 700; margin-bottom: 4px; }

        .bpg-ask-box {
          display: inline-block; background: var(--ink); color: white; border-radius: 980px;
          padding: 12px 22px; font-size: 16px; font-weight: 700; margin-top: 14px;
          transition: transform 0.35s var(--spring); font-family: ui-rounded, -apple-system, sans-serif;
        }
        .bpg-ask-box:hover { transform: scale(1.03); }

        .bpg-result-actions { display: flex; gap: 12px; margin-top: 12px; flex-wrap: wrap; }

        @keyframes bpg-enter {
          from { opacity: 0; transform: translateY(18px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .bpg-enter { animation: bpg-enter 0.6s var(--spring) both; }

        .bpg-welcome {
          position: relative; overflow: hidden; min-height: 76vh;
          display: flex; align-items: center; justify-content: center; text-align: center;
        }
        .bpg-blob { position: absolute; border-radius: 50%; filter: blur(60px); opacity: 0.32; z-index: 0; }
        .bpg-blob-1 { width: 380px; height: 380px; background: var(--green); top: -90px; left: -110px; animation: bpg-float1 15s ease-in-out infinite; }
        .bpg-blob-2 { width: 320px; height: 320px; background: var(--blue); bottom: -100px; right: -90px; animation: bpg-float2 17s ease-in-out infinite; }
        @keyframes bpg-float1 { 0%, 100% { transform: translate(0,0) scale(1); } 50% { transform: translate(40px, 30px) scale(1.12); } }
        @keyframes bpg-float2 { 0%, 100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-30px, -35px) scale(1.06); } }

        .bpg-ambient { position: relative; }
        .bpg-blob-sm-1 { width: 200px; height: 200px; background: var(--green); top: -50px; left: -50px; opacity: 0.16; filter: blur(50px); animation: bpg-float1 15s ease-in-out infinite; }
        .bpg-blob-sm-2 { width: 180px; height: 180px; background: var(--blue); top: -30px; right: -50px; opacity: 0.14; filter: blur(50px); animation: bpg-float2 17s ease-in-out infinite; }

        .bpg-welcome-content { position: relative; z-index: 1; max-width: 480px; padding: 20px; }
        .bpg-welcome-question { font-size: 40px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.15; margin: 0 0 32px; }
        .bpg-welcome-form { display: flex; flex-direction: column; align-items: center; gap: 22px; }
        .bpg-welcome-input {
          width: 100%; border: none; border-bottom: 2px solid var(--line); background: transparent;
          font-family: inherit; font-size: 26px; font-weight: 600; text-align: center; color: var(--ink);
          padding: 8px 4px 14px; transition: border-color 0.3s ease, transform 0.3s var(--spring);
        }
        .bpg-welcome-input:focus { outline: none; border-color: var(--green); transform: scale(1.02); }
        .bpg-welcome-input::placeholder { color: #C7C7CC; }

        .bpg-welcome-greeting { font-size: 40px; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 14px; }
        .bpg-gradient-text {
          background: linear-gradient(90deg, var(--green), var(--blue), var(--green));
          background-size: 200% auto; -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: bpg-gradient-sweep 3s linear infinite;
        }
        @keyframes bpg-gradient-sweep { to { background-position: 200% center; } }
        .bpg-wave { display: inline-block; animation: bpg-wave-anim 1.8s ease-in-out infinite; transform-origin: 70% 70%; }
        @keyframes bpg-wave-anim {
          0%, 60%, 100% { transform: rotate(0deg); }
          10% { transform: rotate(14deg); } 20% { transform: rotate(-8deg); }
          30% { transform: rotate(14deg); } 40% { transform: rotate(-4deg); } 50% { transform: rotate(10deg); }
        }

        @media (max-width: 560px) {
          .bpg-form-grid { grid-template-columns: 1fr; }
          .bpg-stat-row { grid-template-columns: 1fr; }
          .bpg-h1 { font-size: 28px; }
          .bpg-welcome-question, .bpg-welcome-greeting { font-size: 30px; }
        }
      `}</style>

      {view === "welcome" ? (
        <div className="bpg-welcome">
          <div className="bpg-blob bpg-blob-1" />
          <div className="bpg-blob bpg-blob-2" />
          <div className="bpg-welcome-content">
            {!welcomeGreeted ? (
              <div className="bpg-enter">
                <div className="bpg-eyebrow" style={{ justifyContent: "center" }}>Piano d'investimento</div>
                <h1 className="bpg-welcome-question">Come si chiama<br />la tua azienda?</h1>
                <form
                  className="bpg-welcome-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (form.name.trim()) setWelcomeGreeted(true);
                  }}
                >
                  <input
                    className="bpg-welcome-input"
                    value={form.name}
                    onChange={update("name")}
                    placeholder="Nome dell'azienda"
                    autoFocus
                  />
                  <button className="bpg-btn bpg-btn-primary" type="submit" disabled={!form.name.trim()}>
                    Continua
                  </button>
                </form>
              </div>
            ) : (
              <div className="bpg-enter">
                <h1 className="bpg-welcome-greeting">
                  Ciao, <span className="bpg-gradient-text">{form.name}</span>{" "}
                  <span className="bpg-wave">👋</span>
                </h1>
                <p className="bpg-sub" style={{ margin: "0 auto 28px" }}>
                  Pronto a costruire il piano d'investimento che convincerà i tuoi investitori?
                </p>
                <button className="bpg-btn bpg-btn-primary" onClick={() => setView("form")}>
                  Inizia →
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
      <div className="bpg-shell">
        {view === "form" && (
          <>
            <div className="bpg-ambient">
              <div className="bpg-blob bpg-blob-sm-1" />
              <div className="bpg-blob bpg-blob-sm-2" />
              <div className="bpg-eyebrow">Piano d'investimento</div>
              <h1 className="bpg-h1">Genera il piano d'investimento per i tuoi investitori</h1>
              <p className="bpg-sub">
                Descrivi la tua startup e il budget che hai a disposizione. L'AI costruisce
                mercato, allocazione del capitale, proiezioni e pitch — con grafici, non solo testo.
              </p>
            </div>

            <div className="bpg-card">
              <div className="bpg-form-grid">
                <Field label="Nome della startup">
                  <input className="bpg-input" value={form.name} onChange={update("name")} placeholder="Es. Nimbus" />
                </Field>

                <Field label="Capitale che vuoi raccogliere" hint="Guida direttamente i grafici di allocazione e liquidità.">
                  <input className="bpg-input" value={form.fundingAsk} onChange={update("fundingAsk")} placeholder="Es. 250.000 € oppure 250k" />
                </Field>

                <div className="bpg-field bpg-field-full">
                  <Field label="Descrivi la tua idea di business" hint="Cosa fate, per chi, e perché ora — 2/3 righe bastano.">
                    <textarea className="bpg-textarea" value={form.idea} onChange={update("idea")} placeholder="Es. Una piattaforma che aiuta le PMI a..." />
                  </Field>
                </div>

                <Field label="Settore">
                  <select className="bpg-select" value={form.sector} onChange={update("sector")}>
                    {SECTOR_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>

                <Field label="Mercato geografico target">
                  <input className="bpg-input" value={form.market} onChange={update("market")} placeholder="Es. Italia, poi Europa" />
                </Field>

                <Field label="Modello di business">
                  <select className="bpg-select" value={form.businessModel} onChange={update("businessModel")}>
                    {MODEL_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>

                <Field label="Fase attuale">
                  <select className="bpg-select" value={form.stage} onChange={update("stage")}>
                    {STAGE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>

                <div className="bpg-field bpg-field-full">
                  <Field label="Vantaggio competitivo (opzionale)">
                    <textarea className="bpg-textarea" value={form.edge} onChange={update("edge")} placeholder="Cosa vi rende difficili da copiare" />
                  </Field>
                </div>
              </div>

              <div className="bpg-actions">
                <button className="bpg-btn bpg-btn-primary" disabled={!canSubmit} onClick={generate}>
                  Genera piano d'investimento
                </button>
                <span className="bpg-hint-row">
                  {canSubmit ? "" : "Compila almeno nome e idea (min. 10 caratteri)."}
                </span>
              </div>
            </div>
          </>
        )}

        {view === "loading" && (
          <div className="bpg-loading bpg-ambient">
            <div className="bpg-blob bpg-blob-sm-1" />
            <div className="bpg-blob bpg-blob-sm-2" />
            <div className="bpg-spinner" />
            <div className="bpg-loading-text">Costruzione del piano d'investimento in corso…</div>
          </div>
        )}

        {view === "error" && (
          <>
            <div className="bpg-eyebrow">Errore</div>
            <div className="bpg-error">{errorMsg}</div>
            <div className="bpg-result-actions">
              <button className="bpg-btn bpg-btn-primary" onClick={generate}>Riprova</button>
              <button className="bpg-btn bpg-btn-ghost" onClick={() => setView("form")}>Torna al form</button>
            </div>
          </>
        )}

        {view === "raw" && (
          <>
            <div className="bpg-memo-head">
              <span className="bpg-memo-name">{form.name}</span>
              <span className="bpg-memo-meta">{new Date().toLocaleDateString("it-IT")}</span>
            </div>
            <p className="bpg-hint-row" style={{ marginBottom: 16 }}>
              Il modello non ha restituito un formato pulito questa volta: ecco il testo così com'è arrivato.
            </p>
            <div className="bpg-card" style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.6 }}>
              {rawPlanText}
            </div>
            <div className="bpg-result-actions">
              <button className="bpg-btn bpg-btn-ghost" onClick={() => setView("form")}>Modifica input</button>
              <button className="bpg-btn bpg-btn-primary" onClick={generate}>Rigenera</button>
            </div>
          </>
        )}

        {view === "result" && plan && (
          <>
            <div className="bpg-memo-head bpg-enter bpg-ambient">
              <div className="bpg-blob bpg-blob-sm-1" />
              <div className="bpg-blob bpg-blob-sm-2" />
              <span className="bpg-memo-name bpg-gradient-text">{form.name}</span>
              <span className="bpg-memo-meta">{new Date().toLocaleDateString("it-IT")}</span>
            </div>

            <div className="bpg-stat-row">
              <StatTile label="Budget di partenza" color={C_INK} delay={0}>
                <AnimatedNumber value={budgetForCharts || 0} format={(v) => formatEUR(v)} />
              </StatTile>
              <StatTile label="Break-even stimato" color={C_BLUE} delay={80}>
                {plan.financials?.breakeven_month ? (
                  <><AnimatedNumber value={plan.financials.breakeven_month} format={(v) => Math.round(v)} /> mesi</>
                ) : "—"}
              </StatTile>
              <StatTile label="Liquidità esaurita" color={runwayOk ? C_GREEN : C_ORANGE} delay={160}>
                {runwayLabel}
              </StatTile>
            </div>

            <Section icon={ICONS.flag} color={C_PINK} title="Executive summary" delay={80}>
              <p className="bpg-summary-quote">{plan.executive_summary}</p>
            </Section>

            <Section
              icon={ICONS.market}
              color={C_BLUE}
              title="Analisi di mercato"
              caption={`Target: ${plan.market?.target || "—"} · Competitor: ${plan.market?.competitors || "—"}`}
              delay={140}
            >
              <MarketFunnelChart tam={plan.market?.tam_eur} sam={plan.market?.sam_eur} som={plan.market?.som_eur} />
            </Section>

            <Section
              icon={ICONS.funds}
              color={C_PURPLE}
              title="Allocazione del capitale"
              caption={`Ricavi: ${plan.business_model?.revenue_streams || "—"} · Pricing: ${plan.business_model?.pricing || "—"}`}
              delay={200}
            >
              <UseOfFundsPie useOfFunds={plan.financials?.use_of_funds} budget={budgetForCharts} />
            </Section>

            <Section icon={ICONS.growth} color={C_GREEN} title="Ricavi vs costi" delay={260}>
              <FinancialsChart projections={plan.financials?.projections} />
            </Section>

            <Section icon={ICONS.wave} color={C_ORANGE} title="Liquidità disponibile nel tempo" caption={plan.financials?.assumptions} delay={320}>
              <CashBalanceChart budget={budgetForCharts} projections={plan.financials?.projections} />
            </Section>

            <Section icon={ICONS.flag} color={C_PINK} title="Pitch per investitori" delay={380}>
              <div className="bpg-mini-row">
                <div><strong>Problema —</strong> {plan.pitch?.problem}</div>
                <div><strong>Soluzione —</strong> {plan.pitch?.solution}</div>
                <div><strong>Perché ora —</strong> {plan.pitch?.why_now}</div>
              </div>
              <div className="bpg-ask-box">Richiesta: {formatEUR(plan.pitch?.ask_eur || budgetForCharts)}</div>
            </Section>

            <div className="bpg-result-actions">
              <button className="bpg-btn bpg-btn-ghost" onClick={() => setView("form")}>Modifica input</button>
              <button className="bpg-btn bpg-btn-ghost" onClick={generate}>Rigenera</button>
              <button className="bpg-btn bpg-btn-primary" onClick={copyText}>{copyLabel}</button>
            </div>
          </>
        )}
      </div>
      )}
    </div>
  );
}
