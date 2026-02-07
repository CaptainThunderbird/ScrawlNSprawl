// -------------------- DOM Elements --------------------
const modal = document.getElementById('modal');
const saveBtn = document.getElementById('save-note');
const cancelBtn = document.getElementById('cancel-note');
const noteText = document.getElementById('note-text');
const stickerSelect = document.getElementById('sticker-select');
const usernameInput = document.getElementById('username');
const recentNotes = document.getElementById('recent-notes');
const mapDiv = document.getElementById('map');

// -------------------- Modal Logic --------------------
mapDiv.addEventListener('click', () => {
  modal.classList.remove('hidden');
});

cancelBtn.addEventListener('click', () => {
  modal.classList.add('hidden');
  noteText.value = '';
  usernameInput.value = '';
});

// -------------------- Save Note --------------------
saveBtn.addEventListener('click', () => {
  const newPost = {
    user: usernameInput.value || `anonymous${Math.floor(Math.random()*1000)}`,
    message: noteText.value,
    sticker: stickerSelect.value,
    lat: Math.random() * 0.01 + 49.28,  // temporary coordinates for mock
    lng: Math.random() * 0.01 - 123.12
  };

  // Save to Firebase
  savePost(newPost);

  // Reset modal
  modal.classList.add('hidden');
  noteText.value = '';
  usernameInput.value = '';
});

// -------------------- Render Note on Map --------------------
function renderNoteOnMap(post) {
  // Create sticky note div
  const noteDiv = document.createElement('div');
  noteDiv.classList.add('sticky-note');

  // Random rotation
  const rotation = Math.random() * 20 - 10; // -10° to +10°
  noteDiv.style.transform = `rotate(${rotation}deg)`;

  // Color based on sticker type (optional)
  noteDiv.style.backgroundColor = '#C1EDB9';

  // Content
  noteDiv.innerHTML = `
    <strong>${post.user}</strong><br>
    ${post.message}<br>
    <img src="assets/stickers/${post.sticker}" width="40">
  `;

  // Append to mapDiv at mock position
  noteDiv.style.position = 'absolute';
  noteDiv.style.top = `${Math.random() * 80 + 10}%`; // temporary positioning
  noteDiv.style.left = `${Math.random() * 80 + 10}%`;
  mapDiv.appendChild(noteDiv);

  // Optional animation with Framer Motion
  if (window.motion) {
    motion(noteDiv, { scale: [0, 1], rotate: [0, rotation], transition: { duration: 0.5 } });
  }

  // Update recent notes sidebar
  updateRecentNotes(post);
}

// -------------------- Update Recent Notes Sidebar --------------------
function updateRecentNotes(post) {
  const li = document.createElement('li');
  li.textContent = `${post.user}: ${post.message}`;
  recentNotes.prepend(li);

  // Keep only last 5 notes
  while (recentNotes.children.length > 5) {
    recentNotes.removeChild(recentNotes.lastChild);
  }
}

// -------------------- Listen for Real-Time Posts --------------------
listenPosts((newPost) => {
  renderNoteOnMap(newPost);
});

