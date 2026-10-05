/* Wanderlisi V2 – browser-only MVP. No server or framework is required. */
const STORAGE_KEY = 'wanderlisi.walks.v2';
const SWISS_CENTER = [46.8182, 8.2275];
const SWISS_ZOOM = 8;
let walks = loadWalks();
let currentDetailId = null;
let pendingGpx = null;
let map;
let detailMap;
let detailRoute;
const routeLayers = new Map();
let toastTimer;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const uid = () => (globalThis.crypto?.randomUUID?.() || `walk-${Date.now()}-${Math.random().toString(16).slice(2)}`);
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

function loadWalks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved.map(normalizeWalk).filter(w => w.points.length) : [];
  } catch (error) {
    console.warn('Could not load saved walks', error);
    return [];
  }
}
function normalizeWalk(walk) {
  return {
    id: walk.id || uid(), title: walk.title || 'Unbenannte Wanderung', difficulty: walk.difficulty || 'T2',
    status: walk.status === 'done' ? 'done' : 'todo', duration: walk.duration || '—', distance: Number(walk.distance) || 0,
    ascent: Number(walk.ascent) || 0, descent: Number(walk.descent) || 0, description: walk.description || '',
    points: Array.isArray(walk.points) ? walk.points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng)) : [],
    gpxName: walk.gpxName || '', createdAt: walk.createdAt || Date.now(), updatedAt: walk.updatedAt || Date.now(),
    internetImages: Array.isArray(walk.internetImages) ? walk.internetImages : [],
  };
}
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(walks)); }
  catch (error) { showToast('Speicher ist voll – bitte entferne grosse eigene Bilder.'); console.warn(error); }
}
function showToast(message) {
  const element = $('#toast'); element.textContent = message; element.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => element.classList.remove('visible'), 3300);
}
function statusLabel(status) { return status === 'done' ? 'gemacht' : 'geplant'; }
function formatDistance(km) { return `${Number(km || 0).toFixed(1).replace('.', ',')} km`; }
function formatMeters(m) { return `${Math.round(Number(m) || 0)} m`; }
function formatDuration(seconds) {
  if (!seconds || seconds < 60) return '—';
  const hours = Math.floor(seconds / 3600); const mins = Math.round((seconds % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')} h`;
}
function parseDuration(value) {
  const match = String(value || '').match(/(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?/i);
  if (!match || (!match[1] && !match[2])) return null;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60;
}
function describeWalk(walk) {
  const distance = formatDistance(walk.distance);
  const ascent = formatMeters(walk.ascent);
  const level = walk.difficulty || 'T2';
  return `${walk.title} führt dich über ${distance} durch die Schweizer Bergwelt. Mit ${ascent} Aufstieg und Schwierigkeit ${level} ist die Route ein schönes Erlebnis für wanderfreudige Entdeckerinnen und Entdecker.${walk.duration !== '—' ? ` Plane rund ${walk.duration} dafür ein.` : ''}`;
}

/* The provider is intentionally isolated: replace search() with an API call later. */
const ImageSearchService = {
  async search(walk) {
    const query = encodeURIComponent(`${walk.title} Switzerland hiking mountain`);
    // Unsplash's source endpoint gives useful, license-friendly placeholders without a key.
    return [
      `https://source.unsplash.com/800x550/?${query}&sig=11`,
      `https://source.unsplash.com/800x550/?switzerland,alps,hiking&sig=22`,
      `https://source.unsplash.com/800x550/?mountain,trail,switzerland&sig=33`,
      `https://source.unsplash.com/800x550/?alpine,lake,hike&sig=44`,
    ];
  },
};

function haversine(a, b) {
  const radius = 6371; const lat = (b.lat - a.lat) * Math.PI / 180; const lng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(lat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(lng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
function calculateTrack(points) {
  let distance = 0; let ascent = 0; let descent = 0;
  for (let i = 1; i < points.length; i += 1) {
    distance += haversine(points[i - 1], points[i]);
    if (Number.isFinite(points[i].ele) && Number.isFinite(points[i - 1].ele)) {
      const elevation = points[i].ele - points[i - 1].ele;
      if (elevation > 1) ascent += elevation;
      if (elevation < -1) descent -= elevation;
    }
  }
  const times = points.map(p => p.time).filter(Boolean).map(t => Date.parse(t)).filter(Number.isFinite);
  const duration = times.length > 1 ? Math.max(...times) - Math.min(...times) : 0;
  return { distance, ascent, descent, duration: formatDuration(duration / 1000) };
}
function parseGpx(text, filename = '') {
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('Die GPX-Datei konnte nicht gelesen werden.');
  const pointNodes = [...xml.querySelectorAll('trkpt, rtept, wpt')];
  const points = pointNodes.map(node => ({
    lat: Number(node.getAttribute('lat')), lng: Number(node.getAttribute('lon')),
    ele: Number(node.querySelector('ele')?.textContent), time: node.querySelector('time')?.textContent || '',
  })).filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  if (points.length < 2) throw new Error('Diese GPX-Datei enthält keinen gültigen Track.');
  const metadataName = xml.querySelector('metadata > name, trk > name, rte > name')?.textContent?.trim();
  const title = metadataName || filename.replace(/\.gpx$/i, '').replace(/[-_]+/g, ' ').trim();
  return { points, title, ...calculateTrack(points) };
}

function initMap() {
  if (!globalThis.L) { $('#map-fallback').hidden = false; return; }
  map = L.map('map', { zoomControl: false, attributionControl: true }).setView(SWISS_CENTER, SWISS_ZOOM);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  redrawRoutes();
}
function routeLatLngs(walk) { return walk.points.map(point => [point.lat, point.lng]); }
function redrawRoutes() {
  if (!map) return;
  routeLayers.forEach(layer => layer.remove()); routeLayers.clear();
  walks.forEach(walk => {
    const layer = L.polyline(routeLatLngs(walk), { color: walk.status === 'done' ? '#1d5d50' : '#d9ad3b', weight: 4, opacity: .9, lineCap: 'round', lineJoin: 'round' });
    layer.bindTooltip(escapeHtml(walk.title), { className: 'route-tooltip', direction: 'top', offset: [0, -5] });
    layer.on('click', () => openDetail(walk.id)); layer.addTo(map); routeLayers.set(walk.id, layer);
  });
  if (walks.length) updateMapSummary();
}
function fitAll() {
  if (!map || !walks.length) return;
  const points = walks.flatMap(routeLatLngs); if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [35, 35], maxZoom: 13 });
}
function focusWalk(walk) {
  if (!map || !walk.points.length) return;
  map.fitBounds(L.latLngBounds(routeLatLngs(walk)), { padding: [50, 50], maxZoom: 14 });
}
function updateMapSummary() { $('#map-summary').textContent = walks.length === 1 ? '1 Wanderung in der Schweiz' : `${walks.length} Wanderungen in der Schweiz`; }

function visibleWalks() {
  const filter = $('#status-filter').value; const query = $('#search-input').value.trim().toLowerCase();
  return walks.filter(w => (filter === 'all' || w.status === filter) && (!query || w.title.toLowerCase().includes(query)));
}
function renderList() {
  const list = $('#walk-list'); const shown = visibleWalks(); list.innerHTML = '';
  $('#walk-count').textContent = walks.length;
  $('#empty-state').hidden = walks.length > 0;
  if (!walks.length) return;
  if (!shown.length) { list.innerHTML = '<p class="muted" style="padding:20px;text-align:center">Keine passende Wanderung gefunden.</p>'; return; }
  shown.forEach(walk => {
    const card = document.createElement('article'); card.className = `walk-card${walk.id === currentDetailId ? ' active' : ''}`; card.setAttribute('role', 'listitem'); card.tabIndex = 0;
    const cover = walk.internetImages?.[0] || '';
    card.innerHTML = `<div class="walk-thumb"${cover ? ` style="background-image:url('${escapeHtml(cover)}')"` : ''}></div><div><h3 class="card-title">${escapeHtml(walk.title)}</h3><div class="card-meta">${formatDistance(walk.distance)} · ${walk.duration}</div><div class="card-bottom"><span class="status-dot ${walk.status}"></span><span class="status-text">${statusLabel(walk.status)}</span><span class="difficulty-tag">${escapeHtml(walk.difficulty)}</span></div></div>`;
    card.addEventListener('click', () => openDetail(walk.id)); card.addEventListener('keydown', event => { if (event.key === 'Enter') openDetail(walk.id); }); list.appendChild(card);
  });
}

function openModal(modal) { modal.hidden = false; document.body.style.overflow = 'hidden'; }
function closeModals() { $$('.modal-backdrop').forEach(modal => { modal.hidden = true; }); document.body.style.overflow = ''; }
function resetEditor() {
  $('#walk-form').reset(); $('#walk-id').value = ''; $('#gpx-filename').textContent = 'Noch keine Datei ausgewählt'; pendingGpx = null; $('#editor-title').textContent = 'Neue Wanderung';
  $('#status-input').value = 'todo'; $('#difficulty-input').value = 'T2';
}
function openEditor(id = null) {
  resetEditor(); const walk = id ? walks.find(item => item.id === id) : null;
  if (walk) {
    $('#editor-title').textContent = 'Wanderung bearbeiten'; $('#walk-id').value = walk.id; $('#title-input').value = walk.title; $('#difficulty-input').value = walk.difficulty; $('#status-input').value = walk.status; $('#duration-input').value = walk.duration === '—' ? '' : walk.duration; $('#distance-input').value = walk.distance || ''; $('#ascent-input').value = walk.ascent || ''; $('#descent-input').value = walk.descent || ''; $('#description-input').value = walk.description; $('#gpx-filename').textContent = walk.gpxName || 'GPX-Track bereits importiert';
  }
  openModal($('#editor-modal')); $('#title-input').focus();
}
async function handleGpx(file) {
  if (!file) return;
  try {
    const result = parseGpx(await file.text(), file.name); pendingGpx = { ...result, gpxName: file.name };
    if (!$('#title-input').value) $('#title-input').value = result.title || '';
    $('#duration-input').value = result.duration === '—' ? '' : result.duration; $('#distance-input').value = result.distance.toFixed(2); $('#ascent-input').value = Math.round(result.ascent); $('#descent-input').value = Math.round(result.descent); $('#gpx-filename').textContent = `${file.name} · ${result.points.length.toLocaleString('de-CH')} Punkte`; showToast('GPX-Track importiert.');
  } catch (error) { showToast(error.message || 'GPX konnte nicht importiert werden.'); }
}
function saveForm(event) {
  event.preventDefault();
  const existingId = $('#walk-id').value; const old = walks.find(walk => walk.id === existingId);
  const points = pendingGpx?.points || old?.points || [];
  if (points.length < 2) { showToast('Bitte zuerst eine GPX-Datei importieren.'); return; }
  const calculated = pendingGpx || calculateTrack(points); const walk = normalizeWalk({
    id: existingId || uid(), title: $('#title-input').value.trim() || pendingGpx?.title || 'Unbenannte Wanderung', difficulty: $('#difficulty-input').value,
    status: $('#status-input').value, duration: $('#duration-input').value.trim() || calculated.duration || '—', distance: Number($('#distance-input').value) || calculated.distance,
    ascent: Number($('#ascent-input').value) || calculated.ascent, descent: Number($('#descent-input').value) || calculated.descent, description: $('#description-input').value.trim(), points,
    gpxName: pendingGpx?.gpxName || old?.gpxName || '', internetImages: old?.internetImages || [], createdAt: old?.createdAt || Date.now(), updatedAt: Date.now(),
  });
  if (!walk.description) walk.description = describeWalk(walk);
  const index = walks.findIndex(item => item.id === walk.id); if (index >= 0) walks[index] = walk; else walks.push(walk);
  persist(); redrawRoutes(); renderList(); updateMapSummary(); closeModals(); showToast(index >= 0 ? 'Wanderung aktualisiert.' : 'Wanderung gespeichert.');
  ImageSearchService.search(walk).then(images => { const latest = walks.find(item => item.id === walk.id); if (latest && !latest.internetImages.length) { latest.internetImages = images; persist(); renderList(); } }).catch(() => {});
}

function openDetail(id) {
  const walk = walks.find(item => item.id === id); if (!walk) return;
  currentDetailId = id; renderList(); renderDetail(walk); openModal($('#detail-modal')); focusWalk(walk);
  requestAnimationFrame(() => { if (detailMap) detailMap.invalidateSize(); });
}
function renderDetail(walk) {
  $('#detail-title').textContent = walk.title; $('#detail-status').textContent = statusLabel(walk.status); $('#detail-meta').textContent = `${walk.difficulty} · ${formatDistance(walk.distance)} · ${walk.duration}`;
  $('#detail-description').textContent = walk.description || describeWalk(walk); $('#detail-cover').style.backgroundImage = walk.internetImages?.[0] ? `url("${walk.internetImages[0]}")` : '';
  $('#detail-stats').innerHTML = [['Dauer', walk.duration], ['Distanz', formatDistance(walk.distance)], ['Aufstieg', formatMeters(walk.ascent)], ['Abstieg', formatMeters(walk.descent)], ['Schwierigkeit', walk.difficulty]].map(([label, value]) => `<div class="stat"><span class="stat-label">${label}</span><strong class="stat-value">${escapeHtml(value)}</strong></div>`).join('');
  const images = walk.internetImages?.length ? walk.internetImages : [];
  $('#internet-images').innerHTML = images.map((src, index) => `<figure><img loading="lazy" src="${escapeHtml(src)}" alt="Inspiration ${index + 1}" onerror="this.parentElement.remove()"><figcaption>Inspiration ${index + 1}</figcaption></figure>`).join('') || '<span class="muted">Bilder werden geladen …</span>';
  renderOwnImages(walk.id); initDetailMap(walk);
  if (!images.length) ImageSearchService.search(walk).then(found => { const latest = walks.find(item => item.id === walk.id); if (!latest) return; latest.internetImages = found; persist(); if (currentDetailId === walk.id) renderDetail(latest); }).catch(() => {});
}
function initDetailMap(walk) {
  if (!globalThis.L) return;
  if (!detailMap) { detailMap = L.map('detail-map', { zoomControl: false, attributionControl: false }); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(detailMap); }
  if (detailRoute) detailRoute.remove(); detailRoute = L.polyline(routeLatLngs(walk), { color: walk.status === 'done' ? '#1d5d50' : '#d9ad3b', weight: 4 }).addTo(detailMap); detailMap.fitBounds(detailRoute.getBounds(), { padding: [15, 15] });
}
function renderOwnImages(walkId) {
  const target = $('#own-images'); target.innerHTML = '';
  imageStore.getAll(walkId).then(images => images.forEach(image => { const url = URL.createObjectURL(image.blob); const figure = document.createElement('figure'); figure.innerHTML = `<img src="${url}" alt="${escapeHtml(image.name)}"><figcaption><button class="text-button remove-image" data-image-id="${escapeHtml(image.id)}">Entfernen</button></figcaption>`; target.appendChild(figure); }));
}

const imageStore = {
  db: null,
  open() { if (this.db) return Promise.resolve(this.db); return new Promise((resolve, reject) => { const request = indexedDB.open('wanderlisi-images', 1); request.onupgradeneeded = () => request.result.createObjectStore('images', { keyPath: 'id' }); request.onsuccess = () => { this.db = request.result; resolve(this.db); }; request.onerror = () => reject(request.error); }); },
  async add(walkId, file) { const db = await this.open(); return new Promise((resolve, reject) => { const id = `${walkId}:${uid()}`; const tx = db.transaction('images', 'readwrite'); tx.objectStore('images').put({ id, walkId, name: file.name, blob: file }); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); },
  async getAll(walkId) { try { const db = await this.open(); return new Promise((resolve, reject) => { const request = db.transaction('images').objectStore('images').getAll(); request.onsuccess = () => resolve(request.result.filter(item => item.walkId === walkId)); request.onerror = () => reject(request.error); }); } catch { return []; } },
  async remove(id) { const db = await this.open(); return new Promise(resolve => { const tx = db.transaction('images', 'readwrite'); tx.objectStore('images').delete(id); tx.oncomplete = resolve; }); },
  async removeWalk(walkId) { const images = await this.getAll(walkId); await Promise.all(images.map(image => this.remove(image.id))); },
};

function bindEvents() {
  $('#new-walk-button').addEventListener('click', () => openEditor()); $('#empty-add-button').addEventListener('click', () => openEditor());
  $('#filter-button').addEventListener('click', () => { const filters = $('#filters'); filters.hidden = !filters.hidden; $('#filter-button').setAttribute('aria-expanded', String(!filters.hidden)); });
  $('#status-filter').addEventListener('change', renderList); $('#search-input').addEventListener('input', renderList); $('#walk-form').addEventListener('submit', saveForm);
  $('#choose-gpx').addEventListener('click', () => $('#gpx-input').click()); $('#gpx-input').addEventListener('change', event => handleGpx(event.target.files[0]));
  const drop = $('#gpx-drop'); ['dragenter', 'dragover'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.add('dragover'); })); ['dragleave', 'drop'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.remove('dragover'); })); drop.addEventListener('drop', event => handleGpx(event.dataTransfer.files[0]));
  $$('[data-close-modal]').forEach(button => button.addEventListener('click', closeModals)); $$('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModals(); }));
  $('#fit-button').addEventListener('click', fitAll); $('#locate-button').addEventListener('click', () => map?.setView(SWISS_CENTER, SWISS_ZOOM)); $('#help-button').addEventListener('click', () => showToast('Importiere eine GPX-Datei, ergänze Details und speichere deine Route lokal im Browser.'));
  $('#edit-button').addEventListener('click', () => { closeModals(); openEditor(currentDetailId); }); $('#detail-fit').addEventListener('click', () => { const walk = walks.find(item => item.id === currentDetailId); closeModals(); if (walk) focusWalk(walk); });
  $('#delete-button').addEventListener('click', async () => { const walk = walks.find(item => item.id === currentDetailId); if (!walk || !confirm(`„${walk.title}“ wirklich löschen?`)) return; walks = walks.filter(item => item.id !== walk.id); persist(); await imageStore.removeWalk(walk.id); closeModals(); currentDetailId = null; redrawRoutes(); renderList(); updateMapSummary(); showToast('Wanderung gelöscht.'); });
  $('#ai-button').addEventListener('click', () => { const walk = walks.find(item => item.id === currentDetailId); if (!walk) return; walk.description = describeWalk(walk); persist(); renderDetail(walk); showToast('Beschreibung erstellt – ganz ohne Zauberstaub.'); });
  $('#own-image-input').addEventListener('change', async event => { if (!currentDetailId) return; const files = [...event.target.files]; try { await Promise.all(files.map(file => imageStore.add(currentDetailId, file))); renderOwnImages(currentDetailId); showToast(`${files.length} Bild${files.length === 1 ? '' : 'er'} gespeichert.`); } catch { showToast('Bilder konnten nicht gespeichert werden.'); } event.target.value = ''; });
  $('#own-images').addEventListener('click', async event => { const button = event.target.closest('.remove-image'); if (!button) return; await imageStore.remove(button.dataset.imageId); renderOwnImages(currentDetailId); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModals(); });
}

bindEvents();
renderList();
initMap();
updateMapSummary();
