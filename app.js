const COLORS = {
  Pink: "#ff9ecb", Yellow: "#fff176", Blue: "#8fd3ff",
  Green: "#a5f3a0", Orange: "#ffc27a", Purple: "#d1b3ff"
};
const FOLDER_COLORS = Object.values(COLORS);
const STATES = new Set(["open", "closed", "minimized"]);
const MAX_IMAGE_CHARS = 4_000_000; // ~3MB source file as base64

let state = { folders: [], activeId: null };
let pendingImageFolderId = null;

const $ = (s) => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2500);
}

function showApp() {
  $("#landing").hidden = true;
  $("#app").hidden = false;
  render();
}

/* ---------- Validation (keeps loaded files well-formed, entirely client-side) ---------- */
function sanitizeNote(n) {
  if (typeof n !== "object" || n === null) return null;
  const drawing = typeof n.drawing === "string" && n.drawing.startsWith("data:image/png;base64,")
    ? n.drawing : "";
  const img = typeof n.img === "string" && n.img.startsWith("data:image/") && n.img.length <= MAX_IMAGE_CHARS
    ? n.img : "";
  const mode = n.mode === "pen" ? "pen" : n.mode === "image" ? "image" : "text";
  return {
    id: String(n.id || uid()).slice(0, 20),
    color: String(n.color || "#ff9ecb").slice(0, 9),
    text: String(n.text || "").slice(0, 5000),
    drawing,
    img,
    mode,
    x: Number.isFinite(n.x) ? n.x : null,
    y: Number.isFinite(n.y) ? n.y : null
  };
}
function sanitizeFolder(f) {
  if (typeof f !== "object" || f === null) return null;
  const notes = Array.isArray(f.notes)
    ? f.notes.slice(0, 500).map(sanitizeNote).filter(Boolean) : [];
  const codespaceUrl = typeof f.codespaceUrl === "string" ? f.codespaceUrl.slice(0, 500) : "";
  return {
    id: String(f.id || uid()).slice(0, 20),
    name: String(f.name || "Untitled").slice(0, 60),
    color: String(f.color || "#ff9ecb").slice(0, 9),
    state: STATES.has(f.state) ? f.state : "open",
    notes,
    codespaceUrl
  };
}
function sanitizeState(raw) {
  if (typeof raw !== "object" || raw === null || !Array.isArray(raw.folders)) {
    throw new Error("Invalid Sticky Tasks file.");
  }
  const folders = raw.folders.slice(0, 200).map(sanitizeFolder).filter(Boolean);
  let activeId = raw.activeId ? String(raw.activeId) : null;
  if (!folders.some((f) => f.id === activeId)) {
    activeId = folders.length ? folders[0].id : null;
  }
  return { folders, activeId };
}

/* ---------- Landing & file buttons ---------- */
$("#landingCreate").onclick = () => { showApp(); $("#folderName").focus(); };
$("#landingLoad").onclick = () => $("#fileInput").click();
$("#loadBtn").onclick = () => $("#fileInput").click();

$("#fileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const raw = JSON.parse(await file.text());
    state = sanitizeState(raw);
    showApp();
    toast("Folders loaded!");
  } catch (err) {
    toast("Could not load that file — it may not be a Sticky Tasks file.");
  }
});

$("#downloadBtn").onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "sticky-tasks.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  toast("Downloaded sticky-tasks.json");
};

/* ---------- Image upload (shared hidden input) ---------- */
$("#imageInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  const folder = state.folders.find((f) => f.id === pendingImageFolderId);
  pendingImageFolderId = null;
  if (!file || !folder) return;
  if (file.size > 3 * 1024 * 1024) {
    toast("Image too large — please use one under 3MB.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    folder.notes.push({
      id: uid(), color: "#ffffff", text: "", drawing: "",
      img: reader.result, mode: "image", x: null, y: null
    });
    render();
  };
  reader.onerror = () => toast("Could not read that image.");
  reader.readAsDataURL(file);
});

/* ---------- Folders ---------- */
$("#folderForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("#folderName");
  const codeInput = $("#folderCodespace");
  const name = input.value.trim();
  if (!name) return;
  const folder = {
    id: uid(), name,
    color: FOLDER_COLORS[state.folders.length % FOLDER_COLORS.length],
    state: "open",
    notes: [],
    codespaceUrl: codeInput.value.trim().slice(0, 500)
  };
  state.folders.push(folder);
  state.activeId = folder.id;
  input.value = "";
  codeInput.value = "";
  render();
});

const activeFolder = () => state.folders.find((f) => f.id === state.activeId);

function noteLabel(n) {
  if (n.mode === "image") return "Image";
  if (n.text.trim()) return n.text.trim().slice(0, 22);
  return n.drawing ? "Drawing" : "Empty note";
}

function openOrEditCodespace(f, e) {
  if (f.codespaceUrl && !(e && e.shiftKey)) {
    window.open(f.codespaceUrl, "_blank", "noopener");
    return;
  }
  const url = prompt("GitHub Codespace URL for this folder:", f.codespaceUrl || "");
  if (url !== null) {
    f.codespaceUrl = url.trim().slice(0, 500);
    render();
  }
}

function renderSidebar() {
  const list = $("#folderList");
  list.innerHTML = "";
  state.folders.forEach((f) => {
    const li = document.createElement("li");
    const card = document.createElement("div");
    card.className = "folder-card " + f.state + (f.id === state.activeId ? " active" : "");
    card.style.background = f.color;

    if (f.state === "minimized") {
      const b = document.createElement("button");
      b.textContent = f.name.charAt(0).toUpperCase() || "?";
      b.setAttribute("aria-label", `Restore folder ${f.name}`);
      b.title = f.name;
      b.onclick = () => { f.state = "open"; state.activeId = f.id; render(); };
      card.appendChild(b);
    } else {
      const head = document.createElement("div");
      head.className = "folder-head";

      const name = document.createElement("button");
      name.className = "folder-name";
      name.textContent = f.name;
      name.setAttribute("aria-label", `Open folder ${f.name}`);
      name.onclick = () => { state.activeId = f.id; render(); };

      const link = document.createElement("button");
      link.className = "icon-btn";
      link.textContent = "🔗";
      link.title = f.codespaceUrl ? "Open Codespace (Shift+click to edit)" : "Set Codespace link";
      link.setAttribute("aria-label", (f.codespaceUrl ? "Open codespace for " : "Set codespace link for ") + f.name);
      link.onclick = (e) => openOrEditCodespace(f, e);

      const toggle = document.createElement("button");
      toggle.className = "icon-btn";
      toggle.textContent = f.state === "open" ? "▾" : "▸";
      toggle.setAttribute("aria-label", (f.state === "open" ? "Close " : "Open ") + "folder " + f.name);
      toggle.setAttribute("aria-expanded", f.state === "open");
      toggle.onclick = () => { f.state = f.state === "open" ? "closed" : "open"; render(); };

      const min = document.createElement("button");
      min.className = "icon-btn";
      min.textContent = "–";
      min.setAttribute("aria-label", "Minimize folder " + f.name);
      min.onclick = () => { f.state = "minimized"; render(); };

      const del = document.createElement("button");
      del.className = "icon-btn";
      del.textContent = "✕";
      del.setAttribute("aria-label", "Delete folder " + f.name);
      del.onclick = () => {
        if (!confirm(`Delete folder "${f.name}" and all its notes?`)) return;
        state.folders = state.folders.filter((x) => x.id !== f.id);
        if (state.activeId === f.id) state.activeId = state.folders[0] ? state.folders[0].id : null;
        render();
      };

      head.append(name, link, toggle, min, del);
      card.appendChild(head);

      if (f.state === "open") {
        const ul = document.createElement("ul");
        ul.className = "folder-notes";
        if (!f.notes.length) {
          const li2 = document.createElement("li");
          li2.textContent = "No notes yet";
          ul.appendChild(li2);
        }
        f.notes.forEach((n) => {
          const li2 = document.createElement("li");
          li2.textContent = noteLabel(n);
          ul.appendChild(li2);
        });
        card.appendChild(ul);
      }
    }
    li.appendChild(card);
    list.appendChild(li);
  });
}

/* ---------- Board & notes (free-form canvas, OneNote-style) ---------- */
function renderBoard() {
  const board = $("#board");
  board.innerHTML = "";
  const f = activeFolder();

  if (!f) {
    board.innerHTML = '<p class="empty">Create a folder on the left to get started, or load a saved file.</p>';
    return;
  }

  const head = document.createElement("div");
  head.className = "board-head";
  const h2 = document.createElement("h2");
  h2.textContent = f.name;

  const label = document.createElement("label");
  label.textContent = "Color: ";
  label.setAttribute("for", "newColor");
  const sel = document.createElement("select");
  sel.id = "newColor";
  Object.entries(COLORS).forEach(([name, hex]) => {
    const o = document.createElement("option");
    o.value = hex; o.textContent = name;
    sel.appendChild(o);
  });

  const add = document.createElement("button");
  add.className = "btn-top";
  add.textContent = "+ New sticky";
  add.onclick = () => {
    f.notes.push({ id: uid(), color: sel.value, text: "", drawing: "", mode: "text", x: null, y: null });
    render();
  };

  const addImage = document.createElement("button");
  addImage.className = "btn-top";
  addImage.textContent = "+ Image";
  addImage.onclick = () => {
    pendingImageFolderId = f.id;
    $("#imageInput").click();
  };

  head.append(h2, label, sel, add, addImage);

  if (f.codespaceUrl) {
    const openCs = document.createElement("button");
    openCs.className = "btn-top";
    openCs.textContent = "↗ Open Codespace";
    openCs.onclick = () => window.open(f.codespaceUrl, "_blank", "noopener");
    head.appendChild(openCs);
  }

  board.appendChild(head);

  if (!f.notes.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "No sticky notes yet. Pick a color and press “New sticky”, or add an image.";
    board.appendChild(p);
  }

  const wrap = document.createElement("div");
  wrap.className = "notes";
  f.notes.forEach((n, i) => {
    if (n.x == null || n.y == null) {
      n.x = 20 + (i % 4) * 270;
      n.y = 20 + Math.floor(i / 4) * 230;
    }
    wrap.appendChild(n.mode === "image" ? buildImageNote(f, n) : buildNote(f, n));
  });
  board.appendChild(wrap);
}

function makeDraggable(el, n) {
  const grip = el.querySelector(".note-drag");
  let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
  grip.addEventListener("pointerdown", (e) => {
    dragging = true;
    grip.setPointerCapture(e.pointerId);
    startX = e.clientX; startY = e.clientY;
    startLeft = n.x; startTop = n.y;
    el.classList.add("dragging");
  });
  grip.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    n.x = startLeft + (e.clientX - startX);
    n.y = startTop + (e.clientY - startY);
    el.style.left = n.x + "px";
    el.style.top = n.y + "px";
  });
  const stop = () => { dragging = false; el.classList.remove("dragging"); };
  grip.addEventListener("pointerup", stop);
  grip.addEventListener("pointercancel", stop);
}

function buildImageNote(folder, n) {
  const el = document.createElement("div");
  el.className = "note";
  el.style.background = n.color;
  el.style.left = n.x + "px";
  el.style.top = n.y + "px";

  const tools = document.createElement("div");
  tools.className = "note-tools";
  const grip = document.createElement("span");
  grip.className = "note-drag";
  grip.textContent = "⋮⋮";
  grip.title = "Drag to move";
  const del = document.createElement("button");
  del.className = "tool-btn";
  del.textContent = "Delete";
  del.setAttribute("aria-label", "Delete image note");
  del.onclick = () => {
    folder.notes = folder.notes.filter((x) => x.id !== n.id);
    render();
  };
  tools.append(grip, del);

  const body = document.createElement("div");
  body.className = "note-body note-body-image";
  const img = document.createElement("img");
  img.className = "note-image";
  img.src = n.img;
  img.alt = "Pasted image";
  body.appendChild(img);

  el.append(tools, body);
  makeDraggable(el, n);
  return el;
}

function buildNote(folder, n) {
  const el = document.createElement("div");
  el.className = "note";
  el.style.background = n.color;
  el.style.left = n.x + "px";
  el.style.top = n.y + "px";

  const tools = document.createElement("div");
  tools.className = "note-tools";

  const grip = document.createElement("span");
  grip.className = "note-drag";
  grip.textContent = "⋮⋮";
  grip.title = "Drag to move";

  const color = document.createElement("select");
  color.setAttribute("aria-label", "Note color");
  Object.entries(COLORS).forEach(([name, hex]) => {
    const o = document.createElement("option");
    o.value = hex; o.textContent = name;
    if (hex === n.color) o.selected = true;
    color.appendChild(o);
  });
  color.onchange = () => { n.color = color.value; el.style.background = n.color; };

  const textBtn = document.createElement("button");
  textBtn.className = "tool-btn";
  textBtn.textContent = "Text";
  const penBtn = document.createElement("button");
  penBtn.className = "tool-btn";
  penBtn.textContent = "Pen";
  const clear = document.createElement("button");
  clear.className = "tool-btn";
  clear.textContent = "Clear pen";
  clear.setAttribute("aria-label", "Clear drawing");
  const del = document.createElement("button");
  del.className = "tool-btn";
  del.textContent = "Delete";
  del.setAttribute("aria-label", "Delete note");

  const body = document.createElement("div");
  body.className = "note-body";
  const ta = document.createElement("textarea");
  ta.value = n.text;
  ta.setAttribute("aria-label", "Sticky note text");
  ta.placeholder = "Write here…";
  ta.addEventListener("input", () => { n.text = ta.value; renderSidebar(); });

  const canvas = document.createElement("canvas");
  canvas.width = 480; canvas.height = 380;
  canvas.setAttribute("aria-label", "Drawing area for pen");
  const ctx = canvas.getContext("2d");
  ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#222";
  if (n.drawing) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0);
    img.src = n.drawing;
  }

  function setMode(m) {
    n.mode = m;
    textBtn.setAttribute("aria-pressed", m === "text");
    penBtn.setAttribute("aria-pressed", m === "pen");
    canvas.classList.toggle("pen-on", m === "pen");
  }
  textBtn.onclick = () => { setMode("text"); ta.focus(); };
  penBtn.onclick = () => setMode("pen");

  let drawing = false;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * (canvas.width / r.width),
            (e.clientY - r.top) * (canvas.height / r.height)];
  };
  canvas.addEventListener("pointerdown", (e) => {
    if (n.mode !== "pen") return;
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    const [x, y] = pos(e);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.1, y + 0.1); ctx.stroke();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const [x, y] = pos(e);
    ctx.lineTo(x, y); ctx.stroke();
  });
  const stop = () => {
    if (!drawing) return;
    drawing = false;
    n.drawing = canvas.toDataURL("image/png");
    renderSidebar();
  };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);

  clear.onclick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    n.drawing = "";
    renderSidebar();
  };
  del.onclick = () => {
    folder.notes = folder.notes.filter((x) => x.id !== n.id);
    render();
  };

  tools.append(grip, color, textBtn, penBtn, clear, del);
  body.append(ta, canvas);
  el.append(tools, body);
  setMode(n.mode === "pen" ? "pen" : "text");
  makeDraggable(el, n);
  return el;
}

function render() {
  renderSidebar();
  renderBoard();
}