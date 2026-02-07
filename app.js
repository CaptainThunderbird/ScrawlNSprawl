// -------------------- DOM Elements --------------------
const modal = document.getElementById('modal');
const saveBtn = document.getElementById('save-note');
const cancelBtn = document.getElementById('cancel-note');
const noteText = document.getElementById('note-text');
const stickerSelect = document.getElementById('sticker-select');
const usernameInput = document.getElementById('username');
const recentNotes = document.getElementById('recent-notes');
const mapDiv = document.getElementById('map');

// -------------------- Map + Overlay --------------------
let map;
let overlayView;
let overlayProjection;
let pendingLatLng = null;
const items = [];
const renderedIds = new Set();

function initMap() {
  map = new google.maps.Map(mapDiv, {
    center: { lat: 49.2827, lng: -123.1207 },
    zoom: 14
  });

  // Click on map opens modal + stores coordinates
  map.addListener('click', (e) => {
    pendingLatLng = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    modal.classList.remove('hidden');
  });

  installOverlay(map);

  // Start listening for posts once map is ready
  window.listenPosts((post) => {
    renderNoteOnMap(post);
  });
}

// Attach for Google Maps callback
window.initMap = initMap;

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

  const newPost = {
    type: 'note',
    user: usernameInput.value || `anonymous${Math.floor(Math.random() * 1000)}`,
    isAnonymous: !usernameInput.value,
    message: noteText.value,
    sticker: stickerSelect.value || '',
    color: '#C1EDB9',
    lat: pendingLatLng.lat,
    lng: pendingLatLng.lng
  };

  window.savePost(newPost);

  modal.classList.add('hidden');
  noteText.value = '';
  usernameInput.value = '';
  pendingLatLng = null;
});

// -------------------- Render Note on Map --------------------
function renderNoteOnMap(post) {
  if (renderedIds.has(post.id)) return;
  renderedIds.add(post.id);

  const noteDiv = document.createElement('div');
  noteDiv.classList.add('sticky-note');
  noteDiv.style.position = 'absolute';
  noteDiv.style.pointerEvents = 'auto';

  const rotation = Math.random() * 20 - 10;
  noteDiv.style.transform = `translate(-50%, -100%) rotate(${rotation}deg)`;
  noteDiv.style.backgroundColor = post.color || '#C1EDB9';

  noteDiv.innerHTML = `
    <strong>${post.user}</strong><br>
    ${post.message || ''}<br>
    ${post.sticker ? `<img src="assets/stickers/${post.sticker}" width="40">` : ''}
  `;

  const item = {
    element: noteDiv,
    latLng: new google.maps.LatLng(post.lat, post.lng)
  };

  items.push(item);
  overlayView.overlay.appendChild(noteDiv);
  positionItem(item);

  if (window.motion) {
    motion(noteDiv, { scale: [0, 1], rotate: [0, rotation], transition: { duration: 0.5 } });
  }

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
