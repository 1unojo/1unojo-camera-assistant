const $ = (id) => document.getElementById(id);

let imgObj = null;
let last = null;
let currentImageDataUrl = null;

const els = [
  "photoInput",
  "photoDrop",
  "photoPreview",
  "placeholder",
  "cameraSelect",
  "isoBase",
  "apertureBase",
  "fpsBase",
  "priority"
].reduce((a, id) => ((a[id] = $(id)), a), {});

function init() {
  CAMERAS.forEach((c) => {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = `${c.brand} ${c.model}`;
    els.cameraSelect.appendChild(o);
  });

  els.cameraSelect.value = "red-helium";
  updateCameraUI();

  document.querySelectorAll(".tab").forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll(".tab,.view").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      $(b.dataset.view).classList.add("active");
      if (last) renderAll(last);
    };
  });

  els.photoDrop.onclick = () => els.photoInput.click();

  els.photoInput.onchange = (e) => {
    const f = e.target.files?.[0];
    if (f) loadFile(f);
  };

  ["cameraSelect", "isoBase", "apertureBase", "fpsBase", "priority"].forEach((id) => {
    els[id].onchange = () => {
      if (id === "cameraSelect") updateCameraUI();
      if (imgObj) analyze(imgObj);
    };
  });

  $("resetBtn").onclick = () => location.reload();
  $("demoBtn").onclick = demo;
  $("saveBtn").onclick = saveSession;

  const aiBtn = $("aiAnalyzeBtn");
  if (aiBtn) {
    aiBtn.onclick = analyzeWithAI;
  }
}

function cam() {
  return CAMERAS.find((c) => c.id === els.cameraSelect.value) || CAMERAS[0];
}

function updateCameraUI() {
  const c = cam();

  els.isoBase.innerHTML = "";

  c.isoOptions.forEach((v) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    if (v === c.nativeISO) o.selected = true;
    els.isoBase.appendChild(o);
  });

  $("cameraBadge").textContent = c.brand;
  $("camBrand").textContent = c.brand;
  $("camNotes").textContent = c.notes;
  $("camISO").textContent = c.secondNativeISO ? `${c.nativeISO} / ${c.secondNativeISO}` : c.nativeISO;
  $("camColor").textContent = c.colorSpace;
  $("camGamma").textContent = c.gamma;
  $("codecOut").textContent = c.codecs[0];
  $("gammaOut").textContent = c.gamma;
  $("spaceOut").textContent = c.colorSpace.split(" ")[0];
}

function loadFile(file) {
  const reader = new FileReader();

  reader.onload = () => {
    currentImageDataUrl = reader.result;

    const im = new Image();

    im.onload = () => {
      imgObj = im;
      els.photoPreview.src = currentImageDataUrl;
      els.photoPreview.style.display = "block";
      els.placeholder.style.display = "none";
      analyze(im);
      resetAIState();
    };

    im.onerror = () => alert("No pude leer esa imagen. Prueba JPG o PNG.");
    im.src = currentImageDataUrl;
  };

  reader.readAsDataURL(file);
}

function resetAIState() {
  if ($("aiStatus")) $("aiStatus").textContent = "Listo";
  if ($("aiAnalysis")) {
    $("aiAnalysis").textContent =
      "Foto cargada. Presiona “Analizar con IA” para recibir una recomendación profesional.";
  }
}

function demo() {
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 800;

  const g = c.getContext("2d");

  let grd = g.createLinearGradient(0, 0, 0, 800);
  grd.addColorStop(0, "#8fd4ff");
  grd.addColorStop(0.5, "#ffc477");
  grd.addColorStop(1, "#101808");

  g.fillStyle = grd;
  g.fillRect(0, 0, 1200, 800);

  g.fillStyle = "#fff8";
  g.beginPath();
  g.arc(900, 145, 85, 0, 7);
  g.fill();

  g.fillStyle = "#26303a";
  for (let i = 0; i < 16; i++) {
    let h = 120 + Math.random() * 260;
    g.fillRect(40 + i * 72, 620 - h, 45, h);
  }

  g.fillStyle = "#0c1108";
  g.fillRect(0, 610, 1200, 190);

  const im = new Image();

  im.onload = () => {
    imgObj = im;
    currentImageDataUrl = c.toDataURL("image/jpeg", 0.85);
    els.photoPreview.src = currentImageDataUrl;
    els.photoPreview.style.display = "block";
    els.placeholder.style.display = "none";
    analyze(im);
    resetAIState();
  };

  im.src = c.toDataURL("image/jpeg", 0.85);
}

function analyze(im) {
  const c = $("workCanvas");
  const w = 640;
  const h = Math.max(1, Math.round((im.height / im.width) * w));

  c.width = w;
  c.height = h;

  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(im, 0, 0, w, h);

  const data = ctx.getImageData(0, 0, w, h);
  const d = data.data;

  let lumas = [];
  let satSum = 0;
  let warm = 0;
  let cool = 0;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];

    let y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumas.push(y);

    let max = Math.max(r, g, b);
    let min = Math.min(r, g, b);

    satSum += ((max - min) / (max || 1)) * 100;
    warm += r - b;
    cool += b - r;
  }

  lumas.sort((a, b) => a - b);

  const avg = lumas.reduce((a, b) => a + b, 0) / lumas.length;
  const p10 = pct(lumas, 0.1);
  const p50 = pct(lumas, 0.5);
  const p95 = pct(lumas, 0.95);
  const contrast = p95 - p10;
  const sat = satSum / (d.length / 4);

  const scene = classify(avg, p95, p10, sat, warm, cool);
  const rec = recommend({ avg, p10, p50, p95, contrast, sat, scene });

  last = {
    canvas: c,
    data,
    avg,
    p10,
    p50,
    p95,
    contrast,
    sat,
    scene,
    rec
  };

  updateText(last);
  renderAll(last);
}

function pct(a, p) {
  return a[Math.min(a.length - 1, Math.max(0, Math.floor(a.length * p)))];
}

function classify(avg, p95, p10, sat, warm, cool) {
  if (avg < 45) {
    return {
      label: "Noche / baja luz",
      icon: "☾",
      conf: 88,
      note: "Escena oscura. Evita ND y abre lente."
    };
  }

  if (p95 > 230 && avg > 145) {
    return {
      label: "Exterior soleado",
      icon: "☀",
      conf: 92,
      note: "Altas luces fuertes. Prioriza ND y highlights."
    };
  }

  if (avg > 115 && cool > warm) {
    return {
      label: "Exterior / sombra",
      icon: "◒",
      conf: 78,
      note: "Luz suave o sombra abierta."
    };
  }

  if (warm > cool && sat > 20 && avg > 80) {
    return {
      label: "Atardecer / interior cálido",
      icon: "◉",
      conf: 75,
      note: "Dominante cálida. Ajusta WB según intención."
    };
  }

  return {
    label: "Interior / luz controlada",
    icon: "◐",
    conf: 72,
    note: "Exposición media. Revisa piel y sombras."
  };
}

function recommend(o) {
  const c = cam();

  let iso = Number(els.isoBase.value) || c.nativeISO;
  let ap = els.apertureBase.value;
  let fps = Number(els.fpsBase.value) || 24;
  let shutter = `1/${Math.round(fps * 2)}`;
  let wb = c.wbDay;
  let wbLabel = "día/exterior";
  let stops = 0;
  let nd = "Sin ND";
  let note = "Puedes trabajar sin ND.";
  let visual = "Suave";

  if (o.scene.label.includes("Noche")) {
    iso = c.secondNativeISO || Math.min(3200, iso * 2);
    wb = c.wbTungsten;
    wbLabel = "baja luz";
    note = "No uses ND. Abre apertura o añade luz.";
    visual = "Levanta sombras";
  } else if (o.p95 > 235 || o.avg > 180) {
    stops = 9;
    nd = "ND 1.8 + ND 0.9";
    note = "Mucha luz: usa ambos ND para mantener ISO y apertura.";
    visual = "Reduce altas luces";
  } else if (o.p95 > 218 || o.avg > 145) {
    stops = 6;
    nd = "ND 1.8";
    note = "Luz fuerte: ND 1.8 mantiene la apertura abierta.";
    visual = "Protege highlights";
  } else if (o.p95 > 195 || o.avg > 115) {
    stops = 3;
    nd = "ND 0.9";
    note = "Luz moderada: ND 0.9 ayuda sin cerrar lente.";
    visual = "Control moderado";
  }

  if (o.scene.label.includes("cálido")) {
    wb = 4000;
    wbLabel = "cálido";
  }

  if (o.scene.label.includes("Interior")) {
    wb = 4300;
    wbLabel = "interior";
  }

  return {
    iso,
    ap,
    shutter,
    wb,
    wbLabel,
    stops,
    nd,
    note,
    visual,
    codec: c.codecs[0],
    gamma: c.gamma,
    space: c.colorSpace
  };
}


async function getLocationData() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({
        available: false,
        reason: "Geolocalización no disponible en este navegador."
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          available: true,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: Math.round(pos.coords.accuracy || 0)
        });
      },
      (error) => {
        resolve({
          available: false,
          reason: error.message || "El usuario no permitió compartir ubicación."
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000
      }
    );
  });
}

async function getClientMetadata() {
  const now = new Date();
  const location = await getLocationData();

  return {
    dateISO: now.toISOString(),
    localDate: now.toLocaleDateString(),
    localTime: now.toLocaleTimeString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    location
  };
}


async function analyzeWithAI() {
  if (!currentImageDataUrl) {
    alert("Primero sube o toma una foto.");
    return;
  }

  const aiBtn = $("aiAnalyzeBtn");

  try {
    if (aiBtn) {
      aiBtn.disabled = true;
      aiBtn.textContent = "Analizando...";
    }

    if ($("aiStatus")) $("aiStatus").textContent = "IA";
    if ($("aiAnalysis")) $("aiAnalysis").textContent = "Analizando la imagen con IA...";

    const selectedCamera = cam();
    const metadata = await getClientMetadata();

    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        image: currentImageDataUrl,
        metadata,
        camera: {
          brand: selectedCamera.brand,
          model: selectedCamera.model,
          nativeISO: selectedCamera.nativeISO,
          secondNativeISO: selectedCamera.secondNativeISO || null,
          colorSpace: selectedCamera.colorSpace,
          gamma: selectedCamera.gamma,
          codecs: selectedCamera.codecs,
          notes: selectedCamera.notes
        },
        preferences: {
          aperture: els.apertureBase.value,
          fps: els.fpsBase.value,
          priority: els.priority.value,
          isoBase: els.isoBase.value
        },
        metrics: last
          ? {
              avg: Math.round(last.avg),
              p10: Math.round(last.p10),
              p50: Math.round(last.p50),
              p95: Math.round(last.p95),
              contrast: Math.round(last.contrast),
              saturation: Math.round(last.sat),
              localScene: last.scene.label
            }
          : null
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Error analizando con IA.");
    }

    const ai = normalizeAIResponse(data);

    applyAIRecommendation(ai);

    if ($("aiStatus")) $("aiStatus").textContent = "IA lista";
    if ($("aiAnalysis")) {
      $("aiAnalysis").textContent = ai.reason || "La IA completó el análisis de la imagen.";
    }
  } catch (err) {
    console.error(err);

    if ($("aiStatus")) $("aiStatus").textContent = "Error";
    if ($("aiAnalysis")) {
      $("aiAnalysis").textContent =
        "No se pudo completar el análisis con IA. Revisa que OPENAI_API_KEY esté configurada en Vercel y que el archivo api/analyze.js exista.";
    }

    alert(err.message);
  } finally {
    if (aiBtn) {
      aiBtn.disabled = false;
      aiBtn.textContent = "Analizar con IA";
    }
  }
}

function normalizeAIResponse(data) {
  let raw =
    data?.output?.[0]?.content?.[0]?.text ||
    data?.output_text ||
    data?.result ||
    data;

  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {
        scene: "Análisis IA",
        reason: raw
      };
    }
  }

  return raw || {};
}

function applyAIRecommendation(ai) {
  if (!ai) return;

  if (ai.scene) $("sceneOut").textContent = ai.scene;
  if (ai.confidence) {
  let confidence = Number(ai.confidence);

  if (confidence <= 1) {
    confidence = Math.round(confidence * 100);
  }

  $("confidenceOut").textContent = `${confidence}%`;
}

  $("sceneIcon").textContent = ai.icon || "◉";
  $("sceneNote").textContent = ai.scene_note || ai.reason || "Análisis generado por IA.";

  if (ai.iso) $("isoOut").textContent = ai.iso;
  if (ai.aperture) $("apertureOut").textContent = ai.aperture;
  if (ai.shutter) $("shutterOut").textContent = ai.shutter;

  if (ai.wb) {
    const wbText = String(ai.wb).includes("K") ? String(ai.wb) : `${ai.wb}K`;
    $("wbOut").textContent = wbText;
  }

  if (ai.wb_label) $("wbLabel").textContent = ai.wb_label;
  if (ai.codec) $("codecOut").textContent = ai.codec;
  if (ai.gamma) $("gammaOut").textContent = ai.gamma;
  if (ai.color_space) $("spaceOut").textContent = ai.color_space;

  if (ai.nd) $("ndOut").textContent = ai.nd;
  if (ai.stops) $("stopsOut").textContent = `${ai.stops} pasos`;
  if (ai.nd_note) $("ndNote").textContent = ai.nd_note;
  if (ai.nd_a) $("ndA").textContent = ai.nd_a;
  if (ai.nd_b) $("ndB").textContent = ai.nd_b;

  if (ai.visual) $("visualOut").textContent = ai.visual;
  if (ai.target) $("targetOut").textContent = ai.target;
  if (ai.tip) $("tipOut").textContent = ai.tip;

  if (Array.isArray(ai.warnings) && ai.warnings.length) {
    $("aiAnalysis").textContent = `${ai.reason || ""}\n\nAdvertencias:\n- ${ai.warnings.join("\n- ")}`;
  }
}

function updateText(o) {
  const r = o.rec;

  $("sceneIcon").textContent = o.scene.icon;
  $("sceneOut").textContent = o.scene.label;
  $("sceneNote").textContent = o.scene.note;
  $("confidenceOut").textContent = o.scene.conf + "%";

  $("isoOut").textContent = r.iso;
  $("apertureOut").textContent = r.ap;
  $("shutterOut").textContent = r.shutter;
  $("wbOut").textContent = r.wb + "K";
  $("wbLabel").textContent = r.wbLabel;
  $("codecOut").textContent = r.codec;
  $("gammaOut").textContent = r.gamma;
  $("spaceOut").textContent = r.space.split(" ")[0];

  $("ndOut").textContent = r.nd;
  $("stopsOut").textContent = r.stops + " pasos";
  $("ndNote").textContent = r.note;
  $("ndA").textContent = r.stops === 9 ? "1.8" : r.stops === 6 ? "1.8" : r.stops === 3 ? "0.9" : "—";
  $("ndB").textContent = r.stops === 9 ? "0.9" : "—";

  $("adjustBadge").textContent = r.nd;
  $("visualOut").textContent = r.visual;
  $("targetOut").textContent = els.priority.options[els.priority.selectedIndex].text;

  $("tipOut").textContent = `${cam().brand} ${cam().model}: ${r.note} ${cam().notes}`;

  $("mBright").textContent = Math.round(o.avg / 2.55) + " IRE";
  $("mContrast").textContent = o.contrast > 130 ? "Alto" : o.contrast > 80 ? "Medio" : "Bajo";
  $("mHigh").textContent = Math.round(o.p95 / 2.55) + " IRE";
  $("mShadow").textContent = Math.round(o.p10 / 2.55) + " IRE";
}

function renderAll(o) {
  drawCompare(o);
  drawFalse(o);
  drawWave(o);
  drawHist(o);
}

function size(c, w, h) {
  c.width = w;
  c.height = h;
}

function drawCompare(o) {
  ["originalCanvas", "adjustedCanvas"].forEach((id, idx) => {
    const c = $(id);
    size(c, o.canvas.width, o.canvas.height);

    const x = c.getContext("2d");
    x.drawImage(o.canvas, 0, 0);

    if (idx) {
      let im = x.getImageData(0, 0, c.width, c.height);
      let d = im.data;
      let fac = o.rec.stops >= 6 ? 0.78 : o.rec.stops === 3 ? 0.9 : o.avg < 55 ? 1.18 : 1.02;

      for (let i = 0; i < d.length; i += 4) {
        d[i] = tone(d[i], fac);
        d[i + 1] = tone(d[i + 1], fac);
        d[i + 2] = tone(d[i + 2], fac);
      }

      x.putImageData(im, 0, 0);
    }
  });
}

function tone(v, f) {
  v = v * f;
  return Math.max(0, Math.min(255, 255 * (1 - Math.exp(-v / 235))));
}

function drawFalse(o) {
  const c = $("falseColorCanvas");
  size(c, o.data.width, o.data.height);

  const x = c.getContext("2d");

  const im = new ImageData(new Uint8ClampedArray(o.data.data), o.data.width, o.data.height);
  const d = im.data;

  for (let i = 0; i < d.length; i += 4) {
    let y = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 2.55;
    let col = falseCol(y);
    d[i] = col[0];
    d[i + 1] = col[1];
    d[i + 2] = col[2];
  }

  x.putImageData(im, 0, 0);
}

function falseCol(ire) {
  if (ire < 10) return [88, 30, 180];
  if (ire < 30) return [0, 90, 230];
  if (ire < 50) return [30, 195, 70];
  if (ire < 70) return [240, 215, 40];
  if (ire < 90) return [255, 120, 15];
  return [230, 30, 40];
}

function drawWave(o) {
  const c = $("waveformCanvas");
  size(c, 360, 190);

  const x = c.getContext("2d");
  x.fillStyle = "#050505";
  x.fillRect(0, 0, c.width, c.height);

  x.strokeStyle = "#333";

  for (let y = 20; y < c.height; y += 38) {
    x.beginPath();
    x.moveTo(0, y);
    x.lineTo(c.width, y);
    x.stroke();
  }

  x.fillStyle = "rgba(255,255,255,.08)";

  const d = o.data.data;
  const w = o.data.width;
  const h = o.data.height;

  for (let yy = 0; yy < h; yy += 2) {
    for (let xx = 0; xx < w; xx += 2) {
      let i = (yy * w + xx) * 4;
      let l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      x.fillRect((xx / w) * c.width, c.height - l * c.height, 1, 1);
    }
  }

  x.strokeStyle = "#ff7900";
  x.beginPath();
  x.moveTo(0, c.height * 0.5);
  x.lineTo(c.width, c.height * 0.5);
  x.stroke();
}

function drawHist(o) {
  const c = $("histCanvas");
  size(c, 360, 190);

  const x = c.getContext("2d");
  x.clearRect(0, 0, c.width, c.height);

  let bins = new Array(100).fill(0);
  let d = o.data.data;

  for (let i = 0; i < d.length; i += 4) {
    let y = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 2.55;
    bins[Math.min(99, Math.floor(y))]++;
  }

  let max = Math.max(...bins);

  x.fillStyle = "#ddd";

  bins.forEach((v, i) => {
    let h = (v / max) * (c.height - 18);
    x.fillRect((i * c.width) / 100, c.height - h, Math.ceil(c.width / 100), h);
  });

  x.fillStyle = "#ff7900";
  x.fillRect(0, c.height - 8, c.width, 3);
}

function saveSession() {
  if (!last) return alert("Sube una foto primero.");

  let arr = JSON.parse(localStorage.unojoSessions || "[]");

  arr.unshift({
    date: new Date().toLocaleString(),
    camera: cam().model,
    scene: last.scene.label,
    iso: last.rec.iso,
    nd: last.rec.nd,
    wb: last.rec.wb
  });

  localStorage.unojoSessions = JSON.stringify(arr.slice(0, 30));

  alert("Sesión guardada en este navegador.");
}

init();