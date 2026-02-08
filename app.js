// -------------------- DOM Elements --------------------
const modal = document.getElementById('modal');
const typeModal = document.getElementById('type-modal');
const typeCancelBtn = document.getElementById('type-cancel');
const typeButtons = document.querySelectorAll('[data-create-type]');
const saveBtn = document.getElementById('save-note');
const cancelBtn = document.getElementById('cancel-note');
const noteText = document.getElementById('note-text');
const noteIconSelect = document.getElementById('note-icon-select');
const modalTitle = document.getElementById('modal-title');
const noteFields = document.getElementById('note-fields');
const stickerSection = document.getElementById('sticker-section');
const stickerSelect = document.getElementById('sticker-select');
const stickerPicker = document.getElementById('sticker-picker');
const stickerTrayButtons = document.querySelectorAll('#sticker-tray [data-sticker]');
stickerTrayButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
        selectedSticker = btn.dataset.sticker;
        stickerTrayButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
    });
});
const usernameInput = document.getElementById('username');
const recentNotes = document.getElementById('recent-notes');
const savedNotes = document.getElementById('saved-notes');
const mapDiv = document.getElementById('map');
const locationPill = document.getElementById('location-pill');
const bookmarksBtn = document.getElementById('bookmarks-btn');
const addVibeBtn = document.getElementById('add-vibe-btn');
const loadMoreBtn = document.getElementById('load-more-btn');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');
const sidebar = document.getElementById('sidebar');
const bookmarksToggle = document.getElementById('bookmarks-toggle');
const menuBtn = document.getElementById('menu-btn');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const photoSection = document.getElementById('photo-section');
const doodleSection = document.getElementById('doodle-section');
const logoPopup = document.getElementById('logo-popup');
const brandLogo = document.querySelector('.brand-logo');
const photoInput = document.getElementById('photo-input');
const photoPreview = document.getElementById('photo-preview');
const doodleCanvas = document.getElementById('doodle-canvas');
const doodleClearBtn = document.getElementById('doodle-clear');

// Optional controls (may be null if index.html doesn't have them yet)
const noteColorInput = document.getElementById('note-color');
const swatches = document.querySelectorAll('.swatch[data-color]');
let selectedColor = '#C1EDB9';
swatches.forEach((btn) => {
    btn.addEventListener('click', () => {
        selectedColor = (btn.dataset.color || '#C1EDB9').toUpperCase();
        swatches.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
    });
});
if (noteColorInput) {
    noteColorInput.addEventListener('input', () => {
        selectedColor = (noteColorInput.value || '#C1EDB9').toUpperCase();
    });
}

const anonymousToggle = document.getElementById('anonymous-toggle');
const durationDaysSelect = document.getElementById('duration-days');

let currentMode = 'note';
let selectedSticker = 'heart.svg';
let userLocation = null;
const MAX_RADIUS_METERS = 300;
const HEAT_RADIUS_METERS = 250;
const HEAT_LEVELS = [1, 3, 7];
const clientId = getOrCreateClientId();
const deletedPostIds = new Set();

const sounds = {
    pop: new Audio('assets/sounds/ui-pop.mp3'),
    paper: new Audio('assets/sounds/paper-place.mp3'),
    sticker: new Audio('assets/sounds/sticker-tap.mp3')
};

const defaultBlockedWords = ['hate', 'kill', 'stupid', 'idiot', 'dumb', 'racist'];
let blockedWords = [...defaultBlockedWords];
const countryNameSet = new Set();
const countryBBoxes = [];

async function loadBlockedWords() {
    try {
        const res = await fetch('blocked-words.json', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data?.blocked)) {
            blockedWords = [...new Set([...defaultBlockedWords, ...data.blocked])];
        }
    } catch {
        // Keep defaults on failure
    }
}

async function loadCountryNames() {
    try {
        const res = await fetch('countries.json', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data?.countries)) {
            data.countries.forEach((c) => {
                if (typeof c === 'string' && c.trim()) {
                    countryNameSet.add(c.trim().toLowerCase());
                }
            });
        }
    } catch {
        // Leave set empty on failure
    }
}

async function loadCountryBBoxes() {
    try {
        const res = await fetch('country-bboxes.json', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data?.bboxes)) {
            data.bboxes.forEach((b) => {
                if (!b || typeof b.name !== 'string') return;
                countryBBoxes.push({
                    name: b.name,
                    minLat: Number(b.minLat),
                    maxLat: Number(b.maxLat),
                    minLng: Number(b.minLng),
                    maxLng: Number(b.maxLng)
                });
            });
        }
    } catch {
        // Leave empty on failure
    }
}
const soundByButtonType = new Map([
    ['button', 'pop'],
    ['submit', 'pop'],
    ['reset', 'pop']
]);
document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
    if (btn.dataset.sound === 'off') return;
    const type = btn.getAttribute('type') || 'button';
    const sound = soundByButtonType.get(type) || 'pop';
    playSound(sound);
}, true);

loadBlockedWords();
loadCountryNames();
loadCountryBBoxes();

brandLogo?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!logoPopup) return;
    logoPopup.classList.toggle('hidden');
    playSound('pop');
});

document.addEventListener('click', (e) => {
    if (!logoPopup || logoPopup.classList.contains('hidden')) return;
    if (e.target.closest('#logo-popup') || e.target.closest('.brand-logo')) return;
    logoPopup.classList.add('hidden');
});

// Store posts + rendered elements for filtering/re-rendering
const postsById = new Map();
const itemById = new Map();
const BOOKMARKS_KEY = 'sns_bookmarks_v1';
let landmarks = [];
let landmarksLoaded = false;
let recentLimit = 10;

// -------------------- Map + Overlay --------------------
let map;
let overlayView;
let overlayProjection;
let pendingLatLng = null;
const items = [];
let reverseGeocoder = null;
let lastStatusLocation = 'Kindness Map';
let lastPendingLocation = 'Click on the map sprawl to drop a scrawl';
let lastStatusAddress = '';
let lastPendingAddress = '';
let lastAccuracyMeters = null;
let geoState = 'init';
let hasCenteredOnUser = false;
const doodleCtx = doodleCanvas?.getContext('2d');
let isDoodling = false;
let doodleHasStroke = false;
const DOODLE_OUTLINE_WIDTH = 18;
const DOODLE_STROKE_WIDTH = 8;

function setMode(mode) {
    const allowed = new Set(['note', 'sticker', 'photo', 'doodle']);
    if (!allowed.has(mode)) return;
    currentMode = mode;
    updateModalMode();
    console.log('Mode:', mode);
}

// For quick testing in browser console: setMode('sticker')
window.setMode = setMode;

tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
});

bookmarksBtn?.addEventListener('click', () => {
    setActiveTab('saved');
});

loadMoreBtn?.addEventListener('click', () => {
    recentLimit += 10;
    renderRecentNotes();
});

const setSidebarOpen = (open) => {
    if (!sidebar) return;
    sidebar.classList.toggle('open', open);
    sidebarOverlay?.classList.toggle('hidden', !open);
};

menuBtn?.addEventListener('click', () => {
    setSidebarOpen(!sidebar?.classList.contains('open'));
    playSound('pop');
});

sidebarOverlay?.addEventListener('click', () => {
    setSidebarOpen(false);
});

bookmarksToggle?.addEventListener('click', () => {
    const next = !sidebar?.classList.contains('collapsed');
    sidebar?.classList.toggle('collapsed', next);
    bookmarksToggle.textContent = next ? 'Bookmarks ▾' : 'Bookmarks ▴';
    playSound('pop');
});


addVibeBtn?.addEventListener('click', () => {
    if (!map) return;
    const center = map.getCenter();
    if (!center) return;
    pendingLatLng = { lat: center.lat(), lng: center.lng() };
    lastPendingLocation = `${pendingLatLng.lat.toFixed(5)}, ${pendingLatLng.lng.toFixed(5)}`;
    lastPendingAddress = '';
    refreshTopbarLabel();
    updateLocationLabel(pendingLatLng, 'pending');

    if (typeModal) {
        typeModal.classList.remove('hidden');
    } else {
        setMode('note');
        modal.classList.remove('hidden');
    }
    playSound('pop');
});


function buildStickerPicker() {
    if (!stickerPicker || !stickerSelect) return;

    const options = Array.from(stickerSelect.options).filter((opt) => opt.value);
    stickerPicker.innerHTML = '';
    if (!options.length) {
        selectedSticker = '';
        return;
    }

    if (!options.some((opt) => opt.value === selectedSticker)) {
        selectedSticker = options[0].value;
    }

    options.forEach((opt) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sticker-choice';
        btn.dataset.sticker = opt.value;
        btn.title = opt.textContent || opt.value;
        btn.setAttribute('aria-label', opt.textContent || opt.value);
        btn.setAttribute('aria-checked', String(opt.value === selectedSticker));
        if (opt.value === selectedSticker) btn.classList.add('active');
        btn.innerHTML = getStickerMarkup(opt.value);
        stickerPicker.appendChild(btn);
    });
}

stickerPicker?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sticker]');
    if (!btn) return;
    selectedSticker = btn.getAttribute('data-sticker') || selectedSticker;
    const buttons = stickerPicker.querySelectorAll('[data-sticker]');
    buttons.forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-checked', String(active));
    });
    playSound('sticker');
});

if (photoInput && photoPreview) {
    photoInput.addEventListener('change', () => {
        const file = photoInput.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            photoPreview.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

function clearDoodleCanvas() {
    if (!doodleCanvas || !doodleCtx) return;
    doodleCtx.clearRect(0, 0, doodleCanvas.width, doodleCanvas.height);
    doodleCtx.lineCap = 'round';
    doodleCtx.lineJoin = 'round';
    doodleHasStroke = false;
}

function getCanvasPointFromEvent(evt) {
    if (!doodleCanvas) return { x: 0, y: 0 };
    const rect = doodleCanvas.getBoundingClientRect();
    const sx = doodleCanvas.width / rect.width;
    const sy = doodleCanvas.height / rect.height;
    const x = (evt.clientX - rect.left) * sx;
    const y = (evt.clientY - rect.top) * sy;
    return { x, y };
}

if (doodleCanvas && doodleCtx) {
    clearDoodleCanvas();

    doodleCanvas.addEventListener('pointerdown', (evt) => {
        evt.preventDefault();
        const { x, y } = getCanvasPointFromEvent(evt);
        doodleCtx.beginPath();
        doodleCtx.moveTo(x, y);
        doodleCtx.lineTo(x + 0.01, y + 0.01);
        doodleCtx.strokeStyle = '#ffffff';
        doodleCtx.lineWidth = DOODLE_OUTLINE_WIDTH;
        doodleCtx.stroke();
        doodleCtx.strokeStyle = '#111111';
        doodleCtx.lineWidth = DOODLE_STROKE_WIDTH;
        doodleCtx.stroke();
        isDoodling = true;
        doodleHasStroke = true;
    });

    doodleCanvas.addEventListener('pointermove', (evt) => {
        if (!isDoodling) return;
        evt.preventDefault();
        const { x, y } = getCanvasPointFromEvent(evt);
        doodleCtx.lineTo(x, y);
        doodleCtx.strokeStyle = '#ffffff';
        doodleCtx.lineWidth = DOODLE_OUTLINE_WIDTH;
        doodleCtx.stroke();
        doodleCtx.strokeStyle = '#111111';
        doodleCtx.lineWidth = DOODLE_STROKE_WIDTH;
        doodleCtx.stroke();
        doodleHasStroke = true;
    });

    const stopDoodle = () => {
        if (!isDoodling) return;
        doodleCtx.closePath();
        isDoodling = false;
    };
    doodleCanvas.addEventListener('pointerup', stopDoodle);
    doodleCanvas.addEventListener('pointerleave', stopDoodle);
    doodleCanvas.addEventListener('pointercancel', stopDoodle);
}

doodleClearBtn?.addEventListener('click', () => {
    clearDoodleCanvas();
});

typeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
        const nextType = btn.getAttribute('data-create-type');
        if (!nextType) return;
        typeModal?.classList.add('hidden');
        setMode(nextType);
        modal.classList.remove('hidden');
        playSound('pop');
    });
});

typeCancelBtn?.addEventListener('click', () => {
    typeModal?.classList.add('hidden');
    pendingLatLng = null;
    refreshTopbarLabel();
});

setActiveTab('recent');
buildStickerPicker();
updateModalMode();
loadLandmarks();


function initMap() {
    map = new google.maps.Map(mapDiv, {
        center: { lat: 49.2827, lng: -123.1207 },
        zoom: 14
    });

    reverseGeocoder = new google.maps.Geocoder();
    geoState = 'loading';
    refreshTopbarLabel();

    map.addListener('click', (e) => {
        const clickedLatLng = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        const createCheck = canCreateWithinRadius(clickedLatLng);
        if (!createCheck.allowed) {
            alert(createCheck.message);
            return;
        }

        pendingLatLng = clickedLatLng;
        lastPendingLocation = `${pendingLatLng.lat.toFixed(5)}, ${pendingLatLng.lng.toFixed(5)}`;
        lastPendingAddress = '';
        refreshTopbarLabel();
        updateLocationLabel(pendingLatLng, 'pending');

        if (typeModal) {
            typeModal.classList.remove('hidden');
        } else {
            setMode('note');
            modal.classList.remove('hidden');
        }

        playSound('pop');
    });



    installOverlay(map);

    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            (pos) => {
                geoState = 'ready';
                userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                lastAccuracyMeters = typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : null;
                if (!hasCenteredOnUser) {
                    map.setCenter(userLocation);
                    map.setZoom(15);
                    hasCenteredOnUser = true;
                }
                updateLocationLabel(userLocation, 'status');
                rerenderVisiblePosts();
            },
            (err) => {
                geoState = err?.code === 1 ? 'denied' : 'error';
                refreshTopbarLabel();
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
    } else {
        geoState = 'unsupported';
        refreshTopbarLabel();
    }


    // Start listening for posts once map is ready
    window.listenPosts((post) => {
        postsById.set(post.id, post);
        rerenderVisiblePosts();
    });
}

// Attach for Google Maps callback
window.initMap = initMap;

function updateLocationLabel(latLng, mode = 'status') {
    if (!reverseGeocoder || !locationPill) return;

    reverseGeocoder.geocode({ location: latLng }, (results, status) => {
        const ok = status === 'OK' && results && results.length;
        const nearest = findNearestLandmark(latLng);
        const withinLandmark = nearest && nearest.distMeters <= MAX_RADIUS_METERS;
        const country = ok ? getCountryName(results) : null;
        const countryBBox = !country ? getCountryNameFromBBoxes(latLng) : null;
        const shortName = ok
            ? (withinLandmark ? nearest.name : (country || countryBBox || getShortLocationName(results)))
            : (countryBBox || null);
        const fullAddress = ok ? (results[0]?.formatted_address || shortName) : null;
        const fallback =
            mode === 'pending'
                ? (latLng ? `${latLng.lat.toFixed(5)}, ${latLng.lng.toFixed(5)}` : 'Selected location')
                : (latLng ? `${latLng.lat.toFixed(5)}, ${latLng.lng.toFixed(5)}` : 'Nearby');

        if (mode === 'pending') {
            lastPendingLocation = shortName || fallback;
            // Prefer country name over full address when outside landmark radius.
            lastPendingAddress = (!withinLandmark && (country || countryBBox)) ? '' : (fullAddress || '');
        } else {
            lastStatusLocation = shortName || fallback;
            lastStatusAddress = (!withinLandmark && (country || countryBBox)) ? '' : (fullAddress || '');
        }
        refreshTopbarLabel();

        // If we didn't get a country, try a country-only reverse geocode.
        if (!withinLandmark && !country && reverseGeocoder) {
            reverseGeocoder.geocode({ location: latLng, resultType: ['country'] }, (r2, s2) => {
                if (s2 !== 'OK' || !r2 || !r2.length) return;
                const countryOnly = getCountryName(r2);
                if (!countryOnly) return;
                if (mode === 'pending') {
                    lastPendingLocation = countryOnly;
                    lastPendingAddress = '';
                } else {
                    lastStatusLocation = countryOnly;
                    lastStatusAddress = '';
                }
                refreshTopbarLabel();
            });
        }
    });
}

function getShortLocationName(results) {
    const pick = (types) =>
        results.find((r) => types.some((t) => r.types.includes(t)));

    const preferred =
        pick(['point_of_interest', 'establishment', 'tourist_attraction', 'museum', 'park', 'university']) ||
        pick(['neighborhood', 'sublocality', 'sublocality_level_1']) ||
        pick(['locality']) ||
        pick(['administrative_area_level_2']) ||
        results[0];

    if (!preferred) return null;

    if (preferred.address_components) {
        const comps = preferred.address_components;
        const findComp = (t) => comps.find((c) => c.types.includes(t));
        const poi =
            findComp('point_of_interest') ||
            findComp('establishment') ||
            findComp('tourist_attraction') ||
            findComp('museum') ||
            findComp('park');
        const univ = findComp('university');
        const neighborhood =
            findComp('neighborhood') ||
            findComp('sublocality') ||
            findComp('locality');

        // Prefer POI/landmark names; keep UBC building names when available
        if (poi?.short_name) return poi.short_name;
        if (univ?.short_name) return univ.short_name;
        if (neighborhood?.short_name) return neighborhood.short_name;
    }

    return preferred.name || preferred.formatted_address || lastStatusLocation;
}

function getCountryName(results) {
    if (!results || !results.length) return null;
    for (const r of results) {
        const comps = r.address_components || [];
        const country = comps.find((c) => c.types?.includes('country'));
        if (country) {
            const name = country.long_name || country.short_name || null;
            if (!name) return null;
            const normalized = name.toLowerCase();
            if (normalized === 'canada') return null;
            if (countryNameSet.size > 0 && countryNameSet.has(normalized)) return name;
            if (countryNameSet.size === 0) return name;
            // If Google returns a localized country name not in the ASCII list, still use it.
            return name;
        }
    }
    // Fallback: Google often returns a final result that is the country name.
    const last = results[results.length - 1];
    const formatted = last?.formatted_address || '';
    if (formatted) {
        const normalized = formatted.toLowerCase();
        if (normalized === 'canada') return null;
        if (countryNameSet.size === 0 || countryNameSet.has(normalized)) return formatted;
        return formatted;
    }
    return null;
}

function getCountryNameFromBBoxes(latLng) {
    if (!latLng || !countryBBoxes.length) return null;
    const lat = Number(latLng.lat);
    const lng = Number(latLng.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    for (const b of countryBBoxes) {
        if (
            lat >= b.minLat &&
            lat <= b.maxLat &&
            lng >= b.minLng &&
            lng <= b.maxLng
        ) {
            if (String(b.name).toLowerCase() === 'canada') continue;
            return b.name;
        }
    }
    return null;
}

function refreshTopbarLabel() {
    if (!locationPill) return;

    const prefixLocation = (label) => `You're at the ${label}`;

  if (pendingLatLng) {
      if (!landmarksLoaded) {
          locationPill.textContent = 'Loading landmarks...';
          return;
      }
      const nearest = findNearestLandmark(pendingLatLng);
      if (nearest && nearest.distMeters <= MAX_RADIUS_METERS) {
          locationPill.textContent = prefixLocation(nearest.name);
          return;
      }
      if (lastPendingAddress) {
          locationPill.textContent = prefixLocation(lastPendingAddress);
      } else {
          locationPill.textContent = prefixLocation(lastPendingLocation || 'Click on the map sprawl to drop a scrawl');
      }
      return;
  }

  if (!pendingLatLng && userLocation && geoState === 'ready') {
      locationPill.textContent = 'Click on the map sprawl to drop a scrawl';
      return;
  }

  if (userLocation) {
      const nearest = findNearestLandmark(userLocation);
        if (nearest && nearest.distMeters <= MAX_RADIUS_METERS) {
            locationPill.textContent = prefixLocation(nearest.name);
            return;
        }
        if (lastAccuracyMeters !== null && lastAccuracyMeters <= 10 && lastStatusAddress) {
            locationPill.textContent = prefixLocation(lastStatusAddress);
            return;
        }
        const distFromCenter = pendingLatLng ? 0 : null;
        if (geoState === 'ready' && map) {
            const center = map.getCenter()?.toJSON?.();
            if (center) {
                const dist = haversineMeters(userLocation, center);
                if (dist > MAX_RADIUS_METERS) {
                    locationPill.textContent = 'Come closer to within 300 meters';
                    return;
                }
            }
        }
        locationPill.textContent = prefixLocation(lastStatusLocation);
        return;
    }

    if (geoState === 'loading' || geoState === 'init') {
        locationPill.textContent = 'Locating...';
        return;
    }
    if (geoState === 'denied') {
        locationPill.textContent = 'Location blocked';
        return;
    }
    if (geoState === 'unsupported') {
        locationPill.textContent = 'Location unsupported';
        return;
    }
    locationPill.textContent = 'Enable location';
}

function setActiveTab(name) {
    tabButtons.forEach((btn) => {
        const active = btn.dataset.tab === name;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', String(active));
    });
    tabPanels.forEach((panel) => {
        panel.classList.toggle('active', panel.dataset.panel === name);
    });
}

function updateModalMode() {
    if (modalTitle) {
        modalTitle.textContent =
            currentMode === 'sticker'
                ? 'New Sticker'
                : (currentMode === 'photo'
                    ? 'New Photo'
                    : (currentMode === 'doodle' ? 'New Doodle' : 'New Sticky Note'));
    }
    noteFields?.classList.toggle('hidden', currentMode !== 'note');
    stickerSection?.classList.toggle('hidden', currentMode !== 'sticker');
    photoSection?.classList.toggle('hidden', currentMode !== 'photo');
    doodleSection?.classList.toggle('hidden', currentMode !== 'doodle');
    modal?.classList.toggle('doodle-mode', currentMode === 'doodle');
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
        overlay.style.pointerEvents = 'auto';
        overlay.style.zIndex = '999';
        overlayView.overlay = overlay;

        overlay.addEventListener('click', (e) => {
            if (e.target !== overlay || !overlayProjection) return;
            const point = new google.maps.Point(e.offsetX, e.offsetY);
            const latLng = overlayProjection.fromDivPixelToLatLng(point);
            if (latLng) {
                google.maps.event.trigger(map, 'click', { latLng });
            }
        });

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
    return (selectedColor || noteColorInput?.value || '#C1EDB9').toUpperCase();
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

async function loadLandmarks() {
    try {
        const res = await fetch('assets/landmarks.json', { cache: 'no-store' });
        if (!res.ok) throw new Error(`Landmarks fetch failed: ${res.status}`);
        const data = await res.json();
        if (Array.isArray(data)) {
            landmarks = data
                .filter((l) => l && typeof l.lat === 'number' && typeof l.lng === 'number' && l.name)
                .map((l) => ({
                    name: String(l.name),
                    lat: l.lat,
                    lng: l.lng,
                    priority: typeof l.priority === 'number' ? l.priority : 0
                }));
        }
        landmarksLoaded = true;
        refreshTopbarLabel();
    } catch (err) {
        console.warn('Landmarks load failed', err);
        landmarksLoaded = true;
    }
}

function findNearestLandmark(latLng) {
    if (!latLng || !landmarks.length) return null;
    let best = null;
    let bestDist = Infinity;
    let bestPriority = -Infinity;
    for (const lm of landmarks) {
        const dist = haversineMeters(latLng, { lat: lm.lat, lng: lm.lng });
        const priority = lm.priority ?? 0;
        const withinPriorityRange = dist <= 200;
        if (withinPriorityRange && priority > bestPriority) {
            best = lm;
            bestDist = dist;
            bestPriority = priority;
            continue;
        }
        if (priority === bestPriority && dist < bestDist) {
            bestDist = dist;
            best = lm;
            continue;
        }
        if (!best) {
            bestDist = dist;
            best = lm;
            bestPriority = priority;
        }
    }
    if (!best) return null;
    return { ...best, distMeters: bestDist };
}

function isWithinRadius(post) {
    return true;
}

function canCreateWithinRadius(latLng) {
    if (!latLng) {
        return { allowed: false, message: 'Pick a location on the map first.' };
    }
    if (!userLocation) {
        return { allowed: false, message: 'Enable location so we can enforce the 300 meter creation limit.' };
    }
    const dist = haversineMeters(userLocation, latLng);
    if (dist > MAX_RADIUS_METERS) {
        return { allowed: false, message: 'You can only add notes within 300 meters of your current location.' };
    }
    return { allowed: true, message: '' };
}

function getOrCreateClientId() {
    const key = 'sns_client_id';
    let id = localStorage.getItem(key);
    if (!id) {
        id = `client_${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(key, id);
    }
    return id;
}

function playSound(name) {
    const audio = sounds[name];
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => { });
}

function containsBlockedLanguage(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return blockedWords.some((w) => lower.includes(String(w).toLowerCase()));
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
        noteIcon: post.noteIcon || '',
        color: post.color || '#C1EDB9',
        photoData: post.photoData || '',
        doodleData: post.doodleData || '',
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

function mergeCandidates(bookmarks) {
    const byId = new Map();
    postsById.forEach((post, id) => byId.set(id, post));
    bookmarks.forEach((post) => byId.set(post.id, post));
    return Array.from(byId.values());
}

function computeHeatLevel(post, candidates) {
    let n = 0;
    candidates.forEach((other) => {
        const dist = haversineMeters({ lat: post.lat, lng: post.lng }, { lat: other.lat, lng: other.lng });
        if (dist <= HEAT_RADIUS_METERS) n += 1;
    });
    if (n <= HEAT_LEVELS[0]) return 0;
    if (n <= HEAT_LEVELS[1]) return 1;
    if (n <= HEAT_LEVELS[2]) return 2;
    return 3;
}

function renderRecentNotes() {
    if (!recentNotes) return;
    recentNotes.innerHTML = '';
    const mine = Array.from(postsById.values())
        .filter((p) => p.clientId === clientId && !isExpired(p))
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
        .slice(0, recentLimit);

    mine.forEach((post) => {
        const item = buildFeedItem(post, {
            scrapbookLabel: true,
            showJump: true,
            highlightClass: 'pulse',
            minZoom: 17,
            zoom: null
        });
        recentNotes.appendChild(item.li);
    });
}


function renderSavedNotes() {
    if (!savedNotes) return;
    savedNotes.innerHTML = '';
    const list = loadBookmarks();
    if (!list.length) {
        const empty = document.createElement('li');
        empty.className = 'feed-empty';
        empty.textContent = 'No blossoms yet—go explore the map!';
        savedNotes.appendChild(empty);
        return;
    }
    list.forEach((post) => {
        const item = buildFeedItem(post);
        const goBtn = document.createElement('button');
        goBtn.type = 'button';
        goBtn.textContent = 'Go to location';
        goBtn.addEventListener('click', () => {
            if (!map) return;
            map.panTo({ lat: post.lat, lng: post.lng });
            map.setZoom(16);
        });
        goBtn.addEventListener('click', (e) => e.stopPropagation());
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => {
            removeBookmark(post.id);
            rerenderVisiblePosts();
        });
        removeBtn.addEventListener('click', (e) => e.stopPropagation());
        const actions = document.createElement('div');
        actions.className = 'feed-actions';
        actions.appendChild(goBtn);
        actions.appendChild(removeBtn);
        item.body.appendChild(actions);
        savedNotes.appendChild(item.li);
    });
}


// -------------------- Modal Logic --------------------
cancelBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
    noteText.value = '';
    usernameInput.value = '';
    if (photoInput) photoInput.value = '';
    if (photoPreview) photoPreview.src = '';
    clearDoodleCanvas();
    pendingLatLng = null;
    refreshTopbarLabel();
});

// -------------------- Save Note --------------------
saveBtn.addEventListener('click', () => {
    if (!pendingLatLng) return;
    const createCheck = canCreateWithinRadius(pendingLatLng);
    if (!createCheck.allowed) {
        alert(createCheck.message);
        return;
    }

    const typedName = usernameInput.value.trim();
    const isAnonymous = typedName ? false : getIsAnonymous();
    const displayName = isAnonymous
        ? `anonymous${Math.floor(Math.random() * 1000)}`
        : typedName;

    const days = getDurationDays();
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    if (currentMode === 'note' && containsBlockedLanguage(noteText.value)) {
        alert('Please keep notes kind and positive.');
        return;
    }
    if (currentMode === 'sticker' && !selectedSticker) {
        alert('Please choose a sticker.');
        return;
    }
    if (currentMode === 'photo' && !photoPreview?.src) {
        alert('Please upload a photo.');
        return;
    }
    if (currentMode === 'doodle' && !doodleHasStroke) {
        alert('Please draw something first.');
        return;
    }

    const newPost = {
        type: currentMode,
        user: displayName,
        isAnonymous,
        message: currentMode === 'note' ? noteText.value : '',
        noteIcon: currentMode === 'note' ? (noteIconSelect?.value || 'heart') : '',
        sticker: currentMode === 'sticker' ? selectedSticker : '',
        color: getNoteColor(),
        lat: pendingLatLng.lat,
        lng: pendingLatLng.lng,
        expiresAt,
        clientId
    };

    if (currentMode === 'photo') {
        newPost.photoData = photoPreview?.src || '';
    }
    if (currentMode === 'doodle') {
        newPost.doodleData = doodleCanvas?.toDataURL('image/png') || '';
    }

    window.savePost(newPost);
    playSound('paper');

    modal.classList.add('hidden');
    noteText.value = '';
    usernameInput.value = '';
    if (photoInput) photoInput.value = '';
    if (photoPreview) photoPreview.src = '';
    clearDoodleCanvas();
    pendingLatLng = null;
    refreshTopbarLabel();
});


// -------------------- Render Note on Map --------------------

function rerenderVisiblePosts() {
    if (!overlayView?.overlay) return;

    const bookmarks = loadBookmarks();
    const bookmarkedIds = new Set(bookmarks.map((b) => b.id));
    const candidates = mergeCandidates(bookmarks);
    const heatCandidates = candidates.filter((p) => !isExpired(p) || bookmarkedIds.has(p.id));

    // remove old DOM nodes
    itemById.forEach((item) => {
        if (item.element?.parentElement) item.element.parentElement.removeChild(item.element);
    });
    itemById.clear();

    // clear overlay position list so draw() doesn't keep stale items
    items.length = 0;

    // render filtered posts with heat levels
    candidates.forEach((post) => {
        const isExpiredPost = isExpired(post);
        const isSaved = bookmarkedIds.has(post.id);
        if (isExpiredPost && !isSaved) {
            if (!deletedPostIds.has(post.id)) {
                deletedPostIds.add(post.id);
                window.deletePost?.(post.id);
            }
            return;
        }
        if (!isWithinRadius(post) && !isSaved) return;
        post._heat = computeHeatLevel(post, heatCandidates);
        renderPostOnMap(post);
    });

    renderRecentNotes();
    renderSavedNotes();
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

function getStickerMarkup(sticker) {
    if (!sticker) return '';
    const imageExt = /\.(svg|png|jpe?g|webp|gif)$/i;
    if (imageExt.test(sticker)) {
        return `<img class="map-sticker-image" src="assets/stickers/${sticker}" alt="">`;
    }
    if (sticker === 'stub-star') return '?';
    if (sticker === 'stub-flower') return '??';
    return '?';
}


function renderPostOnMap(post) {
    if (!overlayView?.overlay) return;
    if (itemById.has(post.id)) return;

    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.pointerEvents = 'auto';
    // Prevent map drag/zoom while interacting with notes
    [
        'mousedown',
        'mouseup',
        'click',
        'dblclick',
        'contextmenu',
        'touchstart',
        'touchmove',
        'touchend',
        'pointerdown',
        'pointermove',
        'pointerup'
    ].forEach((evt) => {
        el.addEventListener(evt, (e) => {
            e.stopPropagation();
        });
    });
    const rotation = Math.random() * 20 - 10;
    el.style.transform = `translate(-50%, -100%) rotate(${rotation}deg)`;

    const type = post.type || 'note';
    const bookmarked = isBookmarked(post.id);
    if (type !== 'sticker' && type !== 'doodle') {
        el.classList.add(`heat-${post._heat ?? 0}`);
    }

    if (type === 'sticker') {
        el.classList.add('map-sticker');
        el.innerHTML = getStickerMarkup(post.sticker);
        makeStickerDraggable(el);
    } else if (type === 'photo') {
        el.classList.add('sticky-note', 'photo-note');
        el.innerHTML = `
      <div class="photo-frame">
        ${post.photoData ? `<img class="photo-note-image" src="${post.photoData}" alt="">` : ''}
      </div>
      <div class="photo-caption">${post.user || 'anonymous'}</div>
    `;
    } else if (type === 'doodle') {
        el.classList.add('map-doodle');
        el.innerHTML = `
      ${post.doodleData ? `<img class="doodle-image" src="${post.doodleData}" alt="">` : ''}
    `;
    } else {
        el.classList.add('sticky-note');
        el.style.backgroundColor = post.color || '#C1EDB9';
        el.innerHTML = `
      <strong>${post.user || 'anonymous'}</strong><br>
      ${post.message || ''}<br>
    `;
    }

    if (type !== 'sticker' && type !== 'doodle') {
        const bookmarkBtn = document.createElement('button');
        bookmarkBtn.type = 'button';
        bookmarkBtn.className = 'bookmark-btn';
        const isStarType = type === 'note' || type === 'photo';
        bookmarkBtn.textContent = isStarType ? (bookmarked ? '⭐' : '☆') : (bookmarked ? 'Bookmarked' : 'Bookmark');
        bookmarkBtn.title = bookmarked ? 'Remove bookmark' : 'Bookmark';
        bookmarkBtn.setAttribute('aria-pressed', String(bookmarked));
        bookmarkBtn.setAttribute('aria-label', bookmarked ? 'Remove bookmark' : 'Bookmark');
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
    }

    const item = {
        id: post.id,
        element: el,
        latLng: new google.maps.LatLng(post.lat, post.lng)
    };

    items.push(item);
    itemById.set(post.id, item);
    overlayView.overlay.appendChild(el);
    positionItem(item);
}

function getTypeIcon(type) {
    if (type === 'note') return '📝';
    if (type === 'sticker') return '🏷️';
    if (type === 'doodle') return '✏️';
    if (type === 'photo') return '📷';
    return '⭐';
}

function getStickerLabel(sticker) {
    if (!sticker) return 'Sticker';
    if (sticker === 'heart.svg') return 'Heart sticker <3';
    if (sticker === 'smile.svg') return 'Smile sticker';
    if (sticker === 'sparkle.svg') return 'Sparkle sticker';
    return 'Sticker';
}

function getPostLocationLabel(post) {
    if (!landmarksLoaded) return null;
    const lat = Number(post.lat);
    const lng = Number(post.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    const nearest = findNearestLandmark({ lat, lng });
    if (!nearest || nearest.distMeters > MAX_RADIUS_METERS) return null;
    return nearest.name || null;
}

function formatScrapbookLabel(type, location = null) {
    const at = location ? ` at ${location}` : '';
    if (type === 'doodle') return `A doodle was left${at}`;
    if (type === 'sticker') return `A sticker was placed${at}`;
    if (type === 'photo') return `A photo was pinned${at}`;
    return `A note was left${at}`;
}

function updateFeedItemLocation(textEl, post) {
    const location = getPostLocationLabel(post);
    if (location) {
        textEl.textContent = formatScrapbookLabel(post.type, location);
        return;
    }
    if (!reverseGeocoder) return;
    const lat = Number(post.lat);
    const lng = Number(post.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    reverseGeocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status !== 'OK' || !results || !results.length) return;
        const nearest = findNearestLandmark({ lat, lng });
        const withinLandmark = nearest && nearest.distMeters <= MAX_RADIUS_METERS;
        const country = getCountryName(results);
        const shortName = withinLandmark ? nearest.name : (country || getShortLocationName(results));
        if (!shortName) return;
        textEl.textContent = formatScrapbookLabel(post.type, shortName);
    });
}

function buildFeedItem(post, options = {}) {
    const { scrapbookLabel = false, showJump = false, highlightClass = 'pulse-highlight', zoom = 16, minZoom = null } = options;
    const li = document.createElement('li');
    li.classList.add('feed-item');
    li.tabIndex = 0;

    const icon = document.createElement('span');
    icon.className = 'feed-icon';
    icon.textContent = getTypeIcon(post.type);

    const body = document.createElement('div');
    body.className = 'feed-body';
    const text = document.createElement('div');
    if (scrapbookLabel) {
        text.textContent = formatScrapbookLabel(post.type, null);
        updateFeedItemLocation(text, post);
    } else {
        const label =
            post.type === 'doodle'
                ? (post.message || post.type)
                : (post.type === 'sticker' ? getStickerLabel(post.sticker) : (post.message || post.type));
        text.textContent = `${post.user}: ${label}`;
    }

    body.appendChild(text);
    li.appendChild(icon);
    li.appendChild(body);
    if (showJump) {
        const jump = document.createElement('span');
        jump.className = 'feed-jump';
        jump.textContent = '↗';
        jump.setAttribute('aria-hidden', 'true');
        li.appendChild(jump);
    }

    const goTo = () => {
        if (!map) return;
        playSound('pop');
        map.panTo({ lat: post.lat, lng: post.lng });
        if (minZoom !== null && map.getZoom) {
            map.setZoom(Math.max(map.getZoom(), minZoom));
        } else if (zoom !== null) {
            map.setZoom(zoom);
        }
        const item = itemById.get(post.id);
        if (item?.element) {
            item.element.classList.add(highlightClass);
            setTimeout(() => item.element?.classList.remove(highlightClass), 1200);
        }
    };

    li.addEventListener('click', goTo);
    li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            goTo();
        }
    });

    return { li, body };
}
