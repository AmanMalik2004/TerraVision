import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertCircle, ArrowDownToLine, ArrowUpRight, CheckCircle2,
  ChevronDown, CircleHelp, Cpu, FileImage, Gauge, Image as ImageIcon,
  Layers3, Leaf, Menu, RotateCcw, Satellite, ShieldCheck, Sparkles,
  TreePine, Upload, Waves, X, Zap, Building2
} from "lucide-react";
import { getHealth, getMetrics, predictImage } from "./lib/api.js";

const MetricComparisonChart = lazy(() => import("./components/MetricComparisonChart.jsx"));
const TrainingHistoryChart = lazy(() => import("./components/TrainingHistoryChart.jsx"));

const MODELS = [
  { id: "cnn", label: "TerraCNN", short: "CNN", artifact: "Custom CNN", detail: "Compact convolutional baseline", architecture: "Custom CNN", input: "64 × 64" },
  { id: "resnet18", label: "ResNet18", short: "ResNet18", artifact: "ResNet18", detail: "Residual network · transfer learning", architecture: "ResNet-18", input: "224 × 224" },
  { id: "vit_b16", label: "Vision Transformer", short: "ViT-B/16", artifact: "ViT-B16", detail: "Attention-based image encoder", architecture: "ViT-B/16", input: "224 × 224" },
];

const NAV = [
  ["overview", "Overview", Activity],
  ["classify", "Image analysis", Layers3],
  ["models", "Model laboratory", Cpu],
  ["evaluation", "Evaluation", Gauge],
];

const CLASS_INFO = {
  AnnualCrop: ["Annual crop", "Agriculture"], Forest: ["Forest", "Vegetation"],
  HerbaceousVegetation: ["Herbaceous vegetation", "Vegetation"], Highway: ["Highway", "Infrastructure"],
  Industrial: ["Industrial", "Built environment"], Pasture: ["Pasture", "Agriculture"],
  PermanentCrop: ["Permanent crop", "Agriculture"], Residential: ["Residential", "Built environment"],
  River: ["River", "Water"], SeaLake: ["Sea or lake", "Water"],
};

const fmtName = value => String(value ?? "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");
const nice = n => Number.isFinite(Number(n)) ? Number(n).toLocaleString(undefined, { maximumFractionDigits: 3 }) : "—";

function metricFor(metrics, model) {
  if (!Array.isArray(metrics)) return null;
  return metrics.find(row => [row.model, row.name].some(name => String(name || "").toLowerCase() === model.artifact.toLowerCase()));
}

function parseHistory(csv) {
  const [headerLine, ...lines] = csv.trim().split(/\r?\n/);
  const headers = headerLine.split(",");
  return lines.filter(Boolean).map(line => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((header, i) => [header, i === 0 ? values[i] : Number(values[i])]));
  });
}

function StatusDot({ state }) {
  return <span className={`status-dot ${state === "online" ? "green" : state === "checking" ? "amber" : "red"}`} aria-hidden="true"/>;
}

function SectionTitle({ eyebrow, title, description, action }) {
  return <div className="section-title"><div><div className="eyebrow"><span className="eyebrow-line"/>{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function App() {
  const [page, setPage] = useState("overview");
  const [model, setModel] = useState("resnet18");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [health, setHealth] = useState(null);
  const [apiState, setApiState] = useState("checking");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const inputRef = useRef(null);
  const pageTitle = NAV.find(([key]) => key === page)?.[1] ?? "Overview";

  const refreshStatus = useCallback(async () => {
    try {
      const data = await getHealth();
      setHealth(data);
      setApiState(data.status === "healthy" ? "online" : "offline");
    } catch {
      setHealth(null);
      setApiState("offline");
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    const timer = window.setInterval(refreshStatus, 20000);
    getMetrics().then(setMetrics).catch(() => setMetrics([]));
    fetch("/evaluation/training_history.csv").then(r => r.ok ? r.text() : "").then(text => text && setHistory(parseHistory(text))).catch(() => {});
    return () => window.clearInterval(timer);
  }, [refreshStatus]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function selectFile(next) {
    if (!next) return;
    const supportedType = ["image/jpeg", "image/png", "image/webp"].includes(next.type);
    const supportedExtension = /\.(jpe?g|png|webp)$/i.test(next.name);
    if (!supportedType && !supportedExtension) { setError("Choose a supported image file (JPG, PNG, or WEBP)."); return; }
    if (next.size > 15 * 1024 * 1024) { setError("This image is larger than 15 MB. Choose a smaller file."); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setResult(null);
    setError("");
  }

  async function classify() {
    if (!file) { setError("Upload a satellite image first."); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const data = await predictImage(file, model);
      setResult(data);
      setApiState("online");
    } catch (e) {
      setError(e.message || "Could not connect to the inference API.");
      setApiState("offline");
    } finally { setLoading(false); }
  }

  function reset() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null); setPreview(""); setResult(null); setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  const detectedClass = result ? (CLASS_INFO[result.predicted_class] || [fmtName(result.predicted_class), "Land cover"]) : null;
  const comparisonData = useMemo(() => MODELS.map(m => {
    const row = metricFor(metrics, m);
    const pct = key => row?.[key] == null ? null : Number(row[key]) * 100;
    return { model: m.short, accuracy: pct("accuracy"), precision: pct("macro_precision"), recall: pct("macro_recall"), f1: pct("macro_f1") };
  }), [metrics]);
  const knownModels = health?.loaded_models || [];

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <a className="brand" href="#overview" onClick={e => { e.preventDefault(); setPage("overview"); setMobileNav(false); }}>
        <span className="brand-mark"><Satellite size={22}/></span><span><strong>TerraVision</strong><small>EARTH INTELLIGENCE</small></span>
      </a>
      <div className="side-label">WORKSPACE</div>
      <nav aria-label="Main navigation">{NAV.map(([key, label, Icon]) => <button key={key} className={`nav-item ${page === key ? "active" : ""}`} aria-current={page === key ? "page" : undefined} onClick={() => { setPage(key); setMobileNav(false); }}><Icon size={17}/>{label}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="status-card"><StatusDot state={apiState}/><div><strong>Inference API</strong><small>{apiState === "online" ? "Connected" : apiState === "checking" ? "Checking connection…" : "Not connected"}</small></div><button className="refresh-status" onClick={refreshStatus} aria-label="Refresh API status"><RotateCcw size={13}/></button></div>
        <div className="device-row"><Cpu size={14}/><span>Compute device</span><strong>{health?.device?.toUpperCase() || "—"}</strong></div>
        <div className="side-foot">EUROSAT RGB DATASET <span>·</span> 10 CLASSES</div>
      </div>
    </aside>

    <main className="main-content">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav(v => !v)} aria-label={mobileNav ? "Close menu" : "Open menu"}>{mobileNav ? <X size={18}/> : <Menu size={18}/>}</button><div className="breadcrumb">TerraVision <span>/</span> <strong>{pageTitle}</strong></div><div className="top-status"><StatusDot state={apiState}/>{apiState === "online" ? "API connected" : apiState === "checking" ? "Connecting…" : "API disconnected"}</div></header>

      {page === "overview" && <>
        <SectionTitle eyebrow="SATELLITE COMPUTER VISION" title={<>See the Earth <span className="gradient-text">differently.</span></>} description="A three-model deep learning workspace for EuroSAT land-cover classification." action={<div className="heading-chip"><span className="pulse-dot"/> EURO SAT / RGB</div>}/>
        <section className="overview-hero panel"><div className="hero-copy"><span className="hero-kicker"><Sparkles size={14}/> TERRAVISION AI · RESEARCH BUILD</span><h2>From satellite pixels<br/>to land-cover insight.</h2><p>Upload an image, choose a model, and inspect its top predictions with the evaluation artifacts from this project.</p><button className="primary-button hero-button" onClick={() => setPage("classify")}>Start an analysis <ArrowUpRight size={16}/></button></div><div className="hero-map" aria-hidden="true"><div className="map-grid"/><div className="map-ring ring-a"/><div className="map-ring ring-b"/><div className="map-crosshair"/><span className="map-label label-nw">38° 53′ N</span><span className="map-label label-se">EUROSAT · RGB</span><span className="map-coordinate">LAND COVER / INFERENCE</span></div></section>
        <div className="section-heading-row"><div><h2>Evaluation snapshot</h2><p>Recorded results from the saved model comparison artifact.</p></div><button className="text-button" onClick={() => setPage("evaluation")}>View evaluation <ArrowUpRight size={15}/></button></div>
        <section className="snapshot-grid">{MODELS.map(m => { const row = metricFor(metrics, m); return <article className="snapshot-card panel" key={m.id}><div className="snapshot-top"><span className="snapshot-model">{m.short}</span><span className={`availability ${knownModels.includes(m.id) ? "available" : apiState === "online" ? "missing" : "unknown"}`}><i/>{knownModels.includes(m.id) ? "Loaded" : apiState === "online" ? "Unavailable" : "API unknown"}</span></div><div className="snapshot-score">{row?.accuracy != null ? `${(Number(row.accuracy) * 100).toFixed(2)}%` : "—"}<small>accuracy</small></div><div className="snapshot-meta"><span>Macro F1</span><strong>{row?.macro_f1 != null ? `${(Number(row.macro_f1) * 100).toFixed(2)}%` : "—"}</strong></div></article>; })}</section>
        <section className="overview-bottom"><article className="panel overview-chart"><div className="panel-heading"><div><span className="step-number"><Activity size={14}/></span><div><h2>Model comparison</h2><p>Accuracy and macro F1 from the saved evaluation results</p></div></div></div><Suspense fallback={<div className="chart-loading">Loading chart…</div>}><MetricComparisonChart data={comparisonData}/></Suspense></article><article className="panel overview-info"><div className="panel-heading"><div><span className="step-number"><ShieldCheck size={14}/></span><div><h2>Project at a glance</h2><p>Current inference setup</p></div></div></div><div className="info-line"><span>Dataset</span><strong>EuroSAT RGB</strong></div><div className="info-line"><span>Land-cover classes</span><strong>10 categories</strong></div><div className="info-line"><span>Available models</span><strong>3 architectures</strong></div><div className="info-line"><span>Backend device</span><strong>{health?.device || "Not connected"}</strong></div><button className="secondary-button full-button" onClick={() => setPage("models")}>Explore the model lab <ArrowUpRight size={15}/></button></article></section>
      </>}

      {page === "classify" && <>
        <SectionTitle eyebrow="IMAGE ANALYSIS" title={<>Read the <span className="gradient-text">landscape.</span></>} description="Upload a satellite image and compare a model’s top three class probabilities." action={<div className="heading-chip"><span className="pulse-dot"/> {apiState === "online" ? "INFERENCE READY" : "API CONNECTION REQUIRED"}</div>}/>
        <div className="analysis-grid"><section className="panel upload-panel"><div className="panel-heading"><div><span className="step-number">01</span><div><h2>Image input</h2><p>JPG, PNG, or WEBP · maximum 15 MB</p></div></div>{file && <button className="icon-button" onClick={reset} title="Clear image"><RotateCcw size={15}/></button>}</div>
          <div className={`drop-zone ${dragging ? "dragging" : ""} ${preview ? "has-preview" : ""}`} role="button" tabIndex={0} aria-label="Choose or drop an image" onKeyDown={e => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }} onClick={e => { if (!preview && e.target === e.currentTarget) inputRef.current?.click(); }} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); selectFile(e.dataTransfer.files?.[0]); }}>
            {preview ? <><img className="preview-image" src={preview} alt={`Preview of ${file?.name || "uploaded satellite image"}`}/><div className="preview-overlay"><span><ImageIcon size={14}/>{file?.name}</span><button onClick={e => { e.stopPropagation(); reset(); }}>Remove</button></div></> : <div className="empty-upload"><div className="upload-icon"><Upload size={23}/></div><h3>Drop your image here</h3><p>or browse files from your device</p><button className="secondary-button" type="button" onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}>Choose image <ArrowUpRight size={14}/></button><div className="file-hints">JPG, PNG, WEBP <span>·</span> MAX 15 MB</div></div>}
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => selectFile(e.target.files?.[0])}/>
          </div>
          <div className="form-section"><label className="field-label" htmlFor="model-select">CLASSIFICATION MODEL</label><div className="select-wrap"><Cpu size={16}/><select id="model-select" value={model} onChange={e => { setModel(e.target.value); setResult(null); }} aria-describedby="model-note">{MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select><ChevronDown size={15}/></div><div id="model-note" className="model-note">{MODELS.find(m => m.id === model)?.detail}</div></div>
          <button className="primary-button" disabled={!file || loading || apiState === "offline"} onClick={classify}>{loading ? <><span className="spinner"/> Analyzing image…</> : <><Zap size={16}/> Run classification <ArrowUpRight size={15}/></>}</button>
          {error && <div className="error-box" role="alert"><AlertCircle size={16}/><span>{error}</span></div>}
          {apiState === "offline" && <div className="inline-help"><CircleHelp size={14}/> Start the FastAPI backend to run inference.</div>}
          <div className="privacy-note"><CheckCircle2 size={13}/> Image is processed by the configured inference API.</div>
        </section>
        <section className="panel results-panel"><div className="panel-heading"><div><span className="step-number">02</span><div><h2>Analysis results</h2><p>Prediction and model probabilities</p></div></div>{result && <span className="result-tag"><span className="status-dot green"/> COMPLETE</span>}</div>
          {!result ? <div className="results-empty"><div className="orbital"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="earth-icon"><Satellite size={34}/></div><span className="orbit-point point-one"/><span className="orbit-point point-two"/></div><h3>{loading ? "Analyzing image…" : "Ready to analyze"}</h3><p>{loading ? "The selected model is processing your image." : "Upload an image and run classification. The prediction and top-three probabilities will appear here."}</p><div className="empty-stats"><div><strong>03</strong><span>MODELS</span></div><i/><div><strong>10</strong><span>LAND-COVER CLASSES</span></div><i/><div><strong>RGB</strong><span>IMAGERY</span></div></div></div> : <div className="result-content"><div className="prediction-banner"><div className="prediction-symbol">{detectedClass?.[1] === "Water" ? <Waves size={23}/> : detectedClass?.[1] === "Built environment" ? <Building2 size={23}/> : <TreePine size={23}/>}</div><div className="prediction-copy"><span>DETECTED LAND COVER</span><h3>{detectedClass?.[0]}</h3><p>{detectedClass?.[1]}</p></div><div className="confidence-ring" style={{"--progress": `${result.confidence}%`}}><div><strong>{Number(result.confidence).toFixed(1)}<small>%</small></strong><span>CONFIDENCE</span></div></div></div><div className="result-meta"><span><Cpu size={13}/>{result.model}</span><span><ImageIcon size={13}/>{result.image_size?.width} × {result.image_size?.height}px</span><span><FileImage size={13}/>{file?.name}</span></div><div className="top-predictions"><div className="subheading"><h3>Top predictions</h3><span>MODEL PROBABILITY</span></div>{result.predictions?.map((p, i) => <div className="prediction-row" key={p.class_name}><div className={`rank ${i === 0 ? "rank-first" : ""}`}>{String(i + 1).padStart(2, "0")}</div><div className="prediction-detail"><div className="prediction-label">{fmtName(p.class_name)} {i === 0 && <span className="best-label">TOP MATCH</span>}</div><div className="bar-track"><div className={`bar-fill bar-${i}`} style={{width: `${Math.min(100, Number(p.confidence))}%`}}/></div></div><strong className="score">{Number(p.confidence).toFixed(2)}%</strong></div>)}</div><div className="result-disclaimer">Confidence scores are the selected model’s output probabilities and do not guarantee correctness.</div><button className="text-button analyze-another" onClick={reset}>Analyze another image <ArrowUpRight size={14}/></button></div>}
        </section></div>
      </>}

      {page === "models" && <>
        <SectionTitle eyebrow="MODEL LABORATORY" title={<>Three models. <span className="gradient-text">One landscape.</span></>} description="Architecture details and measured test results from the saved comparison artifact."/>
        <section className="model-grid">{MODELS.map((m, i) => { const row = metricFor(metrics, m); const isLoaded = knownModels.includes(m.id); return <article className="panel model-card" key={m.id}><div className="model-card-top"><span className="model-index">0{i + 1}</span><span className={`model-status ${isLoaded ? "is-loaded" : ""}`}><StatusDot state={isLoaded ? "online" : apiState}/>{isLoaded ? "LOADED IN API" : apiState === "online" ? "NOT LOADED" : "STATUS UNKNOWN"}</span></div><div className="model-illustration">{i === 0 ? <Layers3 size={31}/> : i === 1 ? <Cpu size={31}/> : <Activity size={31}/>}</div><h2>{m.label}</h2><p>{m.detail}</p><div className="model-spec"><span>Architecture</span><strong>{m.architecture}</strong></div><div className="model-spec"><span>Input resolution</span><strong>{m.input}</strong></div><div className="model-metric-box"><span>Recorded accuracy</span><strong>{row?.accuracy != null ? `${(Number(row.accuracy) * 100).toFixed(2)}%` : "Unavailable"}</strong><small>{row ? `Macro F1 ${ (Number(row.macro_f1) * 100).toFixed(2)}%` : "No saved result"}</small></div><button className="secondary-button full-button" onClick={() => { setModel(m.id); setPage("classify"); }}>Analyze with this model <ArrowUpRight size={14}/></button></article>; })}</section>
        <div className="metric-note"><CircleHelp size={15}/> Metrics shown here are read from the saved evaluation artifact. They describe the recorded evaluation run, not a guarantee for new images.</div>
      </>}

      {page === "evaluation" && <>
        <SectionTitle eyebrow="EVALUATION" title={<>Performance, <span className="gradient-text">measured.</span></>} description="Explore the saved comparison scores, confusion matrices, and training history."/>
        <section className="panel evaluation-panel"><div className="panel-heading"><div><span className="step-number"><Gauge size={14}/></span><div><h2>Model comparison</h2><p>Metrics from outputs/model_comparison.json and outputs/model_comparison.csv</p></div></div><span className="source-tag">SAVED RESULTS</span></div>
          {metrics.length ? <><Suspense fallback={<div className="chart-loading comparison-chart">Loading chart…</div>}><MetricComparisonChart data={comparisonData} className="comparison-chart"/></Suspense><div className="metrics-table"><div className="metrics-head"><span>MODEL</span><span>ACCURACY</span><span>MACRO PRECISION</span><span>MACRO RECALL</span><span>MACRO F1</span><span>RECORDED MS / IMAGE</span></div>{MODELS.map(m => { const row = metricFor(metrics, m); return <div className="metrics-row" key={m.id}><strong>{m.short}</strong><span>{row?.accuracy != null ? `${(Number(row.accuracy) * 100).toFixed(2)}%` : "—"}</span><span>{row?.macro_precision != null ? `${(Number(row.macro_precision) * 100).toFixed(2)}%` : "—"}</span><span>{row?.macro_recall != null ? `${(Number(row.macro_recall) * 100).toFixed(2)}%` : "—"}</span><span>{row?.macro_f1 != null ? `${(Number(row.macro_f1) * 100).toFixed(2)}%` : "—"}</span><span>{row?.inference_ms_per_image != null ? `${nice(row.inference_ms_per_image)} ms` : "—"}</span></div>; })}</div><p className="metric-footnote">ROC-AUC was unavailable in the saved results. Inference timing is displayed as recorded; hardware and measurement conditions were not included in the artifact.</p></> : <EmptyState title="Evaluation results unavailable" detail="The API metrics endpoint and local comparison artifact could not be loaded."/>}
        </section>
        <div className="evaluation-artifacts"><article className="panel artifact-card"><div className="panel-heading"><div><span className="step-number"><Layers3 size={14}/></span><div><h2>Confusion matrices</h2><p>Saved model evaluation image</p></div></div><a className="icon-button download-link" href="/evaluation/confusion_matrices.png" download aria-label="Download confusion matrix image"><ArrowDownToLine size={15}/></a></div><a href="/evaluation/confusion_matrices.png" target="_blank" rel="noreferrer" className="artifact-image-link"><img className="artifact-image" src="/evaluation/confusion_matrices.png" alt="Saved confusion matrices for the three TerraVision models" onError={e => { e.currentTarget.style.display = "none"; e.currentTarget.nextSibling.style.display = "grid"; }}/><div className="artifact-fallback"><ImageIcon size={22}/><span>Confusion matrix image unavailable</span></div></a><div className="artifact-caption">outputs/confusion_matrices.png</div></article>
          <article className="panel artifact-card"><div className="panel-heading"><div><span className="step-number"><Gauge size={14}/></span><div><h2>Saved comparison plot</h2><p>Original model comparison artifact</p></div></div><a className="icon-button download-link" href="/evaluation/model_comparison.png" download aria-label="Download model comparison plot"><ArrowDownToLine size={15}/></a></div><a href="/evaluation/model_comparison.png" target="_blank" rel="noreferrer" className="artifact-image-link"><img className="artifact-image" src="/evaluation/model_comparison.png" alt="Saved plot comparing TerraVision model evaluation" onError={e => { e.currentTarget.style.display = "none"; e.currentTarget.nextSibling.style.display = "grid"; }}/><div className="artifact-fallback"><ImageIcon size={22}/><span>Comparison plot unavailable</span></div></a><div className="artifact-caption">outputs/model_comparison.png</div></article>
          <article className="panel artifact-card"><div className="panel-heading"><div><span className="step-number"><Activity size={14}/></span><div><h2>Training history</h2><p>Recorded train and validation accuracy</p></div></div></div>{history.length ? <Suspense fallback={<div className="chart-loading history-chart">Loading chart…</div>}><TrainingHistoryChart data={history}/></Suspense> : <EmptyState title="Training history unavailable" detail="The saved training_history.csv could not be loaded."/>}<div className="artifact-caption">outputs/training_history.csv · validation accuracy</div></article></div>
        <div className="metric-note"><CheckCircle2 size={15}/> Charts and scores are sourced from the repository’s saved outputs. No performance values are generated by the interface.</div>
      </>}

      <section className="bottom-strip"><div className="bottom-item"><span className="bottom-icon"><Satellite size={16}/></span><div><strong>EuroSAT RGB</strong><small>Remote sensing dataset</small></div></div><div className="bottom-item"><span className="bottom-icon"><Cpu size={16}/></span><div><strong>PyTorch inference</strong><small>Deep learning pipeline</small></div></div><div className="bottom-item"><span className="bottom-icon"><Leaf size={16}/></span><div><strong>10 land-cover classes</strong><small>Land-use understanding</small></div></div><div className="build-label">TERRAVISION <span>AI</span> <i>·</i> RESEARCH BUILD</div></section>
      <footer>TerraVision AI <span>·</span> Satellite image classification <span>·</span> For research and educational use</footer>
    </main>
  </div>;
}

function EmptyState({ title, detail }) { return <div className="evaluation-empty"><Activity size={25}/><h3>{title}</h3><p>{detail}</p></div>; }

export default App;
