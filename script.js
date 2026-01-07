const canvas = document.getElementById("previewCanvas");
const ctx = canvas.getContext("2d");

let image = null;
let monitors = [];

// Monitor scaling (THIS is the new zoom)
let monitorScale = 1;

// Monitor group offset (mm)
let groupOffset = { x: 0, y: 0 };

// Dragging
let dragging = false;
let lastMouse = { x: 0, y: 0 };

function showLoader(text) {
  document.getElementById("loaderText").textContent = text;
  document.getElementById("loader").classList.remove("hidden");
  document.getElementById("loader").classList.add("flex");
}

function hideLoader() {
  document.getElementById("loader").classList.remove("flex");
  document.getElementById("loader").classList.add("hidden");
}

// ==========================
// Load Image
// ==========================
document.getElementById("imageInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  showLoader("Bild wird geladen…");

  const img = new Image();
  img.onload = () => {
    image = img;
    setupCanvas();
    resetView();
    hideLoader();
  };
  img.src = URL.createObjectURL(file);
});

// ==========================
// Load JSON
// ==========================
document.getElementById("jsonInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    monitors = JSON.parse(reader.result);
    draw();
  };
  reader.readAsText(file);
});

// ==========================
// Canvas Setup
// ==========================
function setupCanvas() {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
}

function resizeCanvas() {
  const maxWidth = window.innerWidth * 0.9;
  canvas.width = maxWidth;
  canvas.height = maxWidth * (image.height / image.width);
  draw();
}

// ==========================
// Reset View
// ==========================
function resetView() {
  monitorScale = 1;
  groupOffset = { x: 0, y: 0 };
  draw();
}

document.getElementById("resetView").onclick = resetView;

// ==========================
// Draw
// ==========================
function draw() {
  if (!image) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // draw image ALWAYS fixed
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  drawMonitors();
  updateMonitorInfo();
}

// ==========================
// Draw Monitors (mm → image px)
// ==========================
function drawMonitors() {
  if (!monitors.length) return;

  const baseMmToImgPx = image.width / 10000;
  const mmToImgPx = baseMmToImgPx * monitorScale;

  monitors.forEach(m => {
    const x = (m.offset[0] + groupOffset.x) * mmToImgPx;
    const y = (m.offset[1] + groupOffset.y) * mmToImgPx;
    const w = m.mm[0] * mmToImgPx;
    const h = m.mm[1] * mmToImgPx;

    // map image-space → preview-space
    const scaleX = canvas.width / image.width;
    const scaleY = canvas.height / image.height;

    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      x * scaleX,
      y * scaleY,
      w * scaleX,
      h * scaleY
    );

    ctx.fillStyle = "rgba(255,0,0,0.25)";
    ctx.fillRect(
      x * scaleX,
      y * scaleY,
      w * scaleX,
      h * scaleY
    );

    ctx.fillStyle = "#fff";
    ctx.fillText(
      m.name,
      x * scaleX + 6,
      y * scaleY + 16
    );
  });
}

// ==========================
// Drag Monitor Group
// ==========================
canvas.addEventListener("mousedown", e => {
  dragging = true;
  lastMouse = { x: e.offsetX, y: e.offsetY };
});

canvas.addEventListener("mouseup", () => dragging = false);
canvas.addEventListener("mouseleave", () => dragging = false);

canvas.addEventListener("mousemove", e => {
  if (!dragging) return;

  const dx = e.offsetX - lastMouse.x;
  const dy = e.offsetY - lastMouse.y;

  const imgDx = dx * (image.width / canvas.width);
  const imgDy = dy * (image.height / canvas.height);

  const baseMmToImgPx = image.width / 10000;
  groupOffset.x += imgDx / (baseMmToImgPx * monitorScale);
  groupOffset.y += imgDy / (baseMmToImgPx * monitorScale);

  lastMouse = { x: e.offsetX, y: e.offsetY };
  draw();
});

// ==========================
// Mouse Wheel → Monitor Scale
// ==========================
canvas.addEventListener("wheel", e => {
  e.preventDefault();

  // fine scroll with Ctrl
  const step = e.ctrlKey ? 1.01 : 1.05;
  const factor = e.deltaY < 0 ? step : 1 / step;

  monitorScale *= factor;
  draw();
}, { passive: false });


// ==========================
// Render & Download
// ==========================
document.getElementById("renderBtn").addEventListener("click", async () => {
  if (!image || !monitors.length) return;

  showLoader("Render & ZIP wird erstellt…");

  const zip = new JSZip();
  const baseMmToImgPx = image.width / 10000;
  const mmToImgPx = baseMmToImgPx * monitorScale;

  const sorted = [...monitors].sort(
    (a, b) => a.offset[0] - b.offset[0]
  );

  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];

    const c = document.createElement("canvas");
    c.width = m.px[0];
    c.height = m.px[1];
    const cctx = c.getContext("2d");

    const sx = (m.offset[0] + groupOffset.x) * mmToImgPx;
    const sy = (m.offset[1] + groupOffset.y) * mmToImgPx;
    const sw = m.mm[0] * mmToImgPx;
    const sh = m.mm[1] * mmToImgPx;

    cctx.drawImage(
      image,
      sx, sy, sw, sh,
      0, 0, c.width, c.height
    );

    const blob = await new Promise(res =>
      c.toBlob(res, "image/png")
    );

    const name =
      `wallpaper_${String(i + 1).padStart(2, "0")}` +
      `_${m.name}_${m.px[0]}x${m.px[1]}.png`;

    zip.file(name, blob);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(zipBlob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "wallpaper_monitors.zip";
  a.click();

  URL.revokeObjectURL(url);
  hideLoader();
});

function updateMonitorInfo() {
  const container = document.getElementById("monitorInfo");
  container.innerHTML = "";

  if (!image || !monitors.length) return;

  const baseMmToImgPx = image.width / 10000;
  const mmToImgPx = baseMmToImgPx * monitorScale;

  monitors.forEach(m => {
    const effectiveWidth = Math.round(m.mm[0] * mmToImgPx);
    const effectiveHeight = Math.round(m.mm[1] * mmToImgPx);

    const ok =
      effectiveWidth >= m.px[0] &&
      effectiveHeight >= m.px[1];

    const div = document.createElement("div");
    div.className = ok ? "ok" : "warn";

    div.textContent =
      `${m.name}: ` +
      `Selection ${effectiveWidth}×${effectiveHeight}px → ` +
      `Monitor ${m.px[0]}×${m.px[1]}px ` +
      (ok ? "✓" : "⚠️");

    container.appendChild(div);
  });
}
