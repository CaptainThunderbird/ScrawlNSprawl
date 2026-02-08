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
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');
const photoSection = document.getElementById('photo-section');
const doodleSection = document.getElementById('doodle-section');
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
const MAX_RADIUS_METERS = 100;
const HEAT_RADIUS_METERS = 250;
const HEAT_LEVELS = [1, 3, 7];
const clientId = getOrCreateClientId();
const deletedPostIds = new Set();

const sounds = {
    pop: new Audio('assets/sounds/ui-pop.mp3'),
    paper: new Audio('assets/sounds/paper-place.mp3'),
    sticker: new Audio('assets/sounds/sticker-tap.mp3')
};

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
let lastStatusLocation = 'Kindness Map';
let lastPendingLocation = 'Selected location';
let lastStatusAddress = '';
let lastPendingAddress = '';
let lastAccuracyMeters = null;
let geoState = 'init';
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

addVibeBtn?.addEventListener('click', () => {
    if (!map) return;
    const center = map.getCenter();
    if (!center) return;
    pendingLatLng = { lat: center.lat(), lng: center.lng() };
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


function initMap() {
    map = new google.maps.Map(mapDiv, {
        center: { lat: 49.2827, lng: -123.1207 },
        zoom: 14
    });

    reverseGeocoder = new google.maps.Geocoder();
    geoState = 'loading';
    refreshTopbarLabel();

    map.addListener('click', (e) => {
        pendingLatLng = { lat: e.latLng.lat(), lng: e.latLng.lng() };
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
        const shortName = ok ? getShortLocationName(results) : null;
        const fullAddress = ok ? (results[0]?.formatted_address || shortName) : null;
        const fallback =
            mode === 'pending'
                ? 'Selected location'
                : (latLng ? `${latLng.lat.toFixed(5)}, ${latLng.lng.toFixed(5)}` : 'Nearby');

        if (mode === 'pending') {
            lastPendingLocation = shortName || fallback;
            lastPendingAddress = fullAddress || '';
        } else {
            lastStatusLocation = shortName || fallback;
            lastStatusAddress = fullAddress || '';
        }
        refreshTopbarLabel();
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

    return preferred.name || preferred.formatted_address || lastStatusLocation;
}

function refreshTopbarLabel() {
    if (!locationPill) return;

    if (pendingLatLng) {
        if (userLocation) {
            const dist = haversineMeters(userLocation, pendingLatLng);
            if (dist > MAX_RADIUS_METERS) {
                locationPill.textContent = 'Come closer to within 100 meters';
                return;
            }
            if (dist <= 10 && lastPendingAddress) {
                locationPill.textContent = lastPendingAddress;
                return;
            }
        }
        locationPill.textContent = lastPendingLocation || lastPendingAddress || 'Selected location';
        return;
    }

    if (userLocation) {
        if (lastAccuracyMeters !== null && lastAccuracyMeters <= 10 && lastStatusAddress) {
            locationPill.textContent = lastStatusAddress;
        } else {
            locationPill.textContent = lastStatusLocation;
        }
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

function isWithinRadius(post) {
    const base = userLocation || map.getCenter().toJSON();
    return haversineMeters(base, { lat: post.lat, lng: post.lng }) <= MAX_RADIUS_METERS;
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
    const blocked = ['hate', 'kill', 'stupid', 'idiot', 'dumb', 'racist'];
    const lower = text.toLowerCase();
    return blocked.some((w) => lower.includes(w));
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
        .slice(0, 10);
    mine.forEach((post) => {
        const li = document.createElement('li');
        li.textContent = `${post.user}: ${post.message || post.type}`;
        recentNotes.appendChild(li);
    });
}

function renderSavedNotes() {
    if (!savedNotes) return;
    savedNotes.innerHTML = '';
    const list = loadBookmarks();
    list.forEach((post) => {
        const li = document.createElement('li');
        const text = document.createElement('div');
        text.textContent = `${post.user}: ${post.message || post.type}`;
        const goBtn = document.createElement('button');
        goBtn.type = 'button';
        goBtn.textContent = 'Go to location';
        goBtn.addEventListener('click', () => {
            if (!map) return;
            map.panTo({ lat: post.lat, lng: post.lng });
            map.setZoom(16);
        });
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => {
            removeBookmark(post.id);
            rerenderVisiblePosts();
        });
        li.appendChild(text);
        li.appendChild(goBtn);
        li.appendChild(removeBtn);
        savedNotes.appendChild(li);
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
        if (!isWithinRadius(post)) return;
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
