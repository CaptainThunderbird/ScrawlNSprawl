// -------------------- DOM Elements --------------------
const modal = document.getElementById('modal');
const saveBtn = document.getElementById('save-note');
const cancelBtn = document.getElementById('cancel-note');
const noteText = document.getElementById('note-text');
const stickerSelect = document.getElementById('sticker-select');
const usernameInput = document.getElementById('username');
const recentNotes = document.getElementById('recent-notes');
const mapDiv = document.getElementById('map');
const locationPill = document.getElementById('location-pill');

// Optional controls (may be null if index.html doesn't have them yet)
const noteColorInput = document.getElementById('note-color');
const anonymousToggle = document.getElementById('anonymous-toggle');
const durationDaysSelect = document.getElementById('duration-days');

let currentMode = 'note';
let userLocation = null;
const MAX_RADIUS_METERS = 100;

// Store posts + rendered elements for filtering/re-rendering
const postsById = new Map();
const itemById = new Map();
const BOOKMARKS_KEY = 'sns_bookmarks_v1';

// -------------------- Map + Overlay --------------------
let map;
let overlayView;
let overlayProjection;
let pendingLatLng = null;
const items = [];
let reverseGeocoder = null;
let lastShortLocation = 'Kindness Map';

function setMode(mode) {
    const allowed = new Set(['note', 'sticker', 'doodle', 'photo']);
    if (!allowed.has(mode)) return;
    currentMode = mode;
    console.log('Mode:', mode);
}

// For quick testing in browser console: setMode('sticker')
window.setMode = setMode;

// Keyboard shortcuts: n/s/d/p
window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'n') setMode('note');
    if (k === 's') setMode('sticker');
    if (k === 'd') setMode('doodle');
    if (k === 'p') setMode('photo');
});

// If teammate later adds buttons with data-mode, this will auto-work
document.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
});


function initMap() {
    map = new google.maps.Map(mapDiv, {
        center: { lat: 49.2827, lng: -123.1207 },
        zoom: 14
    });

    reverseGeocoder = new google.maps.Geocoder();

    map.addListener('click', (e) => {
        pendingLatLng = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        updateLocationLabel(pendingLatLng);

        if (currentMode === 'note') {
            modal.classList.remove('hidden');
            return;
        }

        if (currentMode === 'sticker') {
            window.savePost({
                type: 'sticker',
                user: 'anonymous',
                isAnonymous: true,
                sticker: stickerSelect.value || '',
                color: getNoteColor(),
                lat: pendingLatLng.lat,
                lng: pendingLatLng.lng,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            });
            pendingLatLng = null;
            return;
        }

        if (currentMode === 'doodle') {
            alert('Doodle mode placeholder (next step).');
            pendingLatLng = null;
            return;
        }

        if (currentMode === 'photo') {
            alert('Photo mode placeholder (next step).');
            pendingLatLng = null;
        }
    });


    installOverlay(map);

    if (navigator.geolocation) {
        navigator.geolocation.watchPosition((pos) => {
            userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            updateLocationLabel(userLocation);
            rerenderVisiblePosts();
        });
    }


    // Start listening for posts once map is ready
    window.listenPosts((post) => {
        postsById.set(post.id, post);
        rerenderVisiblePosts();
    });
}

// Attach for Google Maps callback
window.initMap = initMap;

function updateLocationLabel(latLng) {
    if (!reverseGeocoder || !locationPill) return;

    reverseGeocoder.geocode({ location: latLng }, (results, status) => {
        if (status !== 'OK' || !results || !results.length) return;

        const shortName = getShortLocationName(results);
        if (!shortName) return;

        lastShortLocation = shortName;
        locationPill.textContent = shortName;
    });
}

function getShortLocationName(results) {
    const pick = (types) =>
        results.find((r) => types.some((t) => r.types.includes(t)));

    const preferred =
        pick(['point_of_interest', 'park', 'university']) ||
        pick(['neighborhood', 'sublocality', 'sublocality_level_1']) ||
        pick(['locality']) ||
        pick(['administrative_area_level_2']) ||
        results[0];

    if (!preferred) return null;

    if (preferred.address_components) {
        const comp =
            preferred.address_components.find((c) =>
                c.types.includes('point_of_interest')
            ) ||
            preferred.address_components.find((c) => c.types.includes('park')) ||
            preferred.address_components.find((c) => c.types.includes('neighborhood')) ||
            preferred.address_components.find((c) => c.types.includes('sublocality')) ||
            preferred.address_components.find((c) => c.types.includes('locality'));

        if (comp?.short_name) return comp.short_name;
    }

    return preferred.name || preferred.formatted_address || lastShortLocation;
}

function installOverlay(mapInstance) {
    overlayView = new google.maps.OverlayView();

    overlayView.onAdd = () => {
        const overlay = document.createElement('div');
        overlay.id = 'map-overlay';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.pointerEvents = 'none';
        overlayView.overlay = overlay;

        overlayView.getPanes().overlayMouseTarget.appendChild(overlay);
    };

    overlayView.draw = () => {
        overlayProjection = overlayView.getProjection();
        items.forEach(positionItem);
    };

    overlayView.onRemove = () => {
        if (overlayView.overlay?.parentElement) {
            overlayView.overlay.parentElement.removeChild(overlayView.overlay);
        }
    };

    overlayView.setMap(mapInstance);
}

function positionItem(item) {
    if (!overlayProjection) return;
    const point = overlayProjection.fromLatLngToDivPixel(item.latLng);
    if (!point) return;
    item.element.style.left = `${point.x}px`;
    item.element.style.top = `${point.y}px`;
}

function getNoteColor() {
    return noteColorInput?.value || '#C1EDB9';
}

function getIsAnonymous() {
    return anonymousToggle ? anonymousToggle.checked : true;
}

function getDurationDays() {
    const d = Number(durationDaysSelect?.value || 1);
    return Math.min(7, Math.max(1, d));
}

function toMillis(ts) {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') return ts.toDate().getTime(); // Firestore Timestamp
    return new Date(ts).getTime(); // string/date fallback
}

function isExpired(post) {
    const expiresAtMs = toMillis(post.expiresAt);
    return expiresAtMs ? Date.now() > expiresAtMs : false;
}

function haversineMeters(a, b) {
    const R = 6371000;
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);

    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;

    return 2 * R * Math.asin(Math.sqrt(h));
}

function isWithinRadius(post) {
    const base = userLocation || map.getCenter().toJSON();
    return haversineMeters(base, { lat: post.lat, lng: post.lng }) <= MAX_RADIUS_METERS;
}

function loadBookmarks() {
    try {
        const raw = localStorage.getItem(BOOKMARKS_KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
}

function saveBookmarks(list) {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(list));
}

function upsertBookmark(post) {
    const list = loadBookmarks();
    const idx = list.findIndex((p) => p.id === post.id);
    const payload = {
        id: post.id,
        type: post.type || 'note',
        user: post.user || 'anonymous',
        message: post.message || '',
        sticker: post.sticker || '',
        color: post.color || '#C1EDB9',
        lat: post.lat,
        lng: post.lng,
        expiresAt: post.expiresAt || null
    };
    if (idx === -1) list.push(payload);
    else list[idx] = payload;
    saveBookmarks(list);
}

function removeBookmark(id) {
    const list = loadBookmarks().filter((p) => p.id !== id);
    saveBookmarks(list);
}

function isBookmarked(id) {
    return loadBookmarks().some((p) => p.id === id);
}


// -------------------- Modal Logic --------------------
cancelBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
    noteText.value = '';
    usernameInput.value = '';
    pendingLatLng = null;
});

// -------------------- Save Note --------------------
saveBtn.addEventListener('click', () => {
  if (!pendingLatLng) return;

  const isAnonymous = getIsAnonymous();
  const typedName = usernameInput.value.trim();
  const displayName = isAnonymous
    ? `anonymous${Math.floor(Math.random() * 1000)}`
    : (typedName || 'anonymous');

  const days = getDurationDays();
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const newPost = {
    type: 'note',
    user: displayName,
    isAnonymous,
    message: noteText.value,
    sticker: stickerSelect.value || '',
    color: getNoteColor(),
    lat: pendingLatLng.lat,
    lng: pendingLatLng.lng,
    expiresAt
  };

  window.savePost(newPost);

  modal.classList.add('hidden');
  noteText.value = '';
  usernameInput.value = '';
  pendingLatLng = null;
});


// -------------------- Render Note on Map --------------------

function rerenderVisiblePosts() {
  if (!overlayView?.overlay) return;

  const bookmarks = loadBookmarks();
  const bookmarkedIds = new Set(bookmarks.map((b) => b.id));

  // remove old DOM nodes
  itemById.forEach((item) => {
    if (item.element?.parentElement) item.element.parentElement.removeChild(item.element);
  });
  itemById.clear();

  // clear overlay position list so draw() doesn't keep stale items
  items.length = 0;

  // optional: avoid duplicated sidebar entries after every rerender
  recentNotes.innerHTML = '';

  // render filtered posts
  postsById.forEach((post) => {
    if (isExpired(post) && !bookmarkedIds.has(post.id)) return;
    if (!isWithinRadius(post)) return;
    renderPostOnMap(post);
  });

  // render bookmarks that are no longer in live posts
  bookmarks.forEach((post) => {
    if (postsById.has(post.id)) return;
    if (!isWithinRadius(post)) return;
    renderPostOnMap(post);
  });
}

function makeStickerDraggable(el) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let baseLeft = 0;
  let baseTop = 0;

  el.style.cursor = 'grab';
  el.style.userSelect = 'none';

  el.addEventListener('mousedown', (e) => {
    dragging = true;
    el.style.cursor = 'grabbing';
    startX = e.clientX;
    startY = e.clientY;
    baseLeft = parseFloat(el.style.left || '0');
    baseTop = parseFloat(el.style.top || '0');
    e.preventDefault(); // prevents text/image drag behavior
    e.stopPropagation();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    el.style.left = `${baseLeft + dx}px`;
    el.style.top = `${baseTop + dy}px`;
  });

  window.addEventListener('mouseup', () => {
    dragging = false;
    el.style.cursor = 'grab';
  });
}


function renderPostOnMap(post) {
  if (!overlayView?.overlay) return;
  if (itemById.has(post.id)) return;

  const el = document.createElement('div');
  el.style.position = 'absolute';
  el.style.pointerEvents = 'auto';
  const rotation = Math.random() * 20 - 10;
  el.style.transform = `translate(-50%, -100%) rotate(${rotation}deg)`;

  const type = post.type || 'note';
  const bookmarked = isBookmarked(post.id);

  if (type === 'sticker') {
    el.classList.add('sticky-note');
    el.style.background = 'transparent';
    el.innerHTML = `${post.sticker ? `<img src="assets/stickers/${post.sticker}" width="50">` : '*'}`;
    makeStickerDraggable(el);
  } else {
    el.classList.add('sticky-note');
    el.style.backgroundColor = post.color || '#C1EDB9';
    el.innerHTML = `
      <strong>${post.user || 'anonymous'}</strong><br>
      ${post.message || ''}<br>
      ${post.sticker ? `<img src="assets/stickers/${post.sticker}" width="40">` : ''}
    `;
  }

  const bookmarkBtn = document.createElement('button');
  bookmarkBtn.type = 'button';
  bookmarkBtn.className = 'bookmark-btn';
  bookmarkBtn.textContent = bookmarked ? 'Saved' : 'Save';
  bookmarkBtn.title = bookmarked ? 'Remove bookmark' : 'Save bookmark';
  bookmarkBtn.setAttribute('aria-pressed', String(bookmarked));
  bookmarkBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isBookmarked(post.id)) {
      removeBookmark(post.id);
    } else {
      upsertBookmark(post);
    }
    rerenderVisiblePosts();
  });
  el.appendChild(bookmarkBtn);

  const item = {
    id: post.id,
    element: el,
    latLng: new google.maps.LatLng(post.lat, post.lng)
  };

  items.push(item);
  itemById.set(post.id, item);
  overlayView.overlay.appendChild(el);
  positionItem(item);

  updateRecentNotes(post);
}


// -------------------- Update Recent Notes Sidebar --------------------
function updateRecentNotes(post) {
    const li = document.createElement('li');
    li.textContent = `${post.user}: ${post.message || ''}`;
    recentNotes.prepend(li);

    while (recentNotes.children.length > 5) {
        recentNotes.removeChild(recentNotes.lastChild);
    }
}

