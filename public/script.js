const socket = io('http://localhost:3000', {
  autoConnect: false, // only connect after login, to get proper session
});

const loginModal = document.getElementById('login-modal');
const registerModal = document.getElementById('register-modal');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const chatContainer = document.getElementById('chat-container');
const logoutBtn = document.getElementById('logout-btn');
const messagesDiv = document.getElementById('messages');
const roomInput = document.getElementById('room');
const usernameDisplay = document.getElementById('username-display');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');

let currentRoom = '';
let currentUser = null;

function showRegister() {
  registerModal.style.display = 'flex';
}
function hideRegister() {
  registerModal.style.display = 'none';
  registerError.textContent = '';
}

function showChatUI() {
  loginModal.style.display = 'none';
  registerModal.style.display = 'none';
  chatContainer.style.display = 'block';
  loginError.textContent = '';
  usernameDisplay.textContent = currentUser.username;

  socket.connect();
  joinDefaultRoom();
}

function joinDefaultRoom() {
  const room = roomInput.value.trim() || 'general';
  currentRoom = room;
  loadChatHistory(room, () => {
    socket.emit('join_room', room);
    appendMessage(`<em>Joined room "${room}"</em>`);
  });
}

function appendMessage(html) {
  messagesDiv.innerHTML += `<div>${html}</div>`;
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

logoutBtn.onclick = () => {
  fetch('/logout', { method: 'POST' })
    .catch(() => {})
    .finally(() => {
      localStorage.removeItem('user');
      currentUser = null;
      chatContainer.style.display = 'none';
      loginModal.style.display = 'flex';
      messagesDiv.innerHTML = '';
      currentRoom = '';
      socket.disconnect();
    });
};

loginForm.onsubmit = async (e) => {
  e.preventDefault();
  loginError.textContent = '';

  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (res.ok) {
      currentUser = { userId: data.userId, username: data.username || username };
      localStorage.setItem('user', JSON.stringify(currentUser));
      showChatUI();
    } else {
      loginError.textContent = data.error || 'Login failed';
    }
  } catch {
    loginError.textContent = 'Network error';
  }
};

registerForm.onsubmit = async (e) => {
  e.preventDefault();
  registerError.textContent = '';

  const username = document.getElementById('register-username').value.trim();
  const password = document.getElementById('register-password').value;

  try {
    const res = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (res.ok) {
      alert('Registration successful! Please login.');
      hideRegister();
    } else {
      registerError.textContent = data.error || 'Registration failed';
    }
  } catch {
    registerError.textContent = 'Network error';
  }
};

window.onload = () => {
  const storedUser = localStorage.getItem('user');
  if (storedUser) {
    currentUser = JSON.parse(storedUser);
    showChatUI();
  } else {
    loginModal.style.display = 'flex';
  }
};

document.getElementById('join-room').onclick = () => {
  const room = roomInput.value.trim();
  if (!room) return alert('Please enter a room name.');

  currentRoom = room;
  loadChatHistory(room, () => {
    socket.emit('join_room', room);
    appendMessage(`<em>Joined room "${room}"</em>`);
  });
};

document.getElementById('send-btn').onclick = () => {
  const message = messageInput.value.trim();
  if (!currentRoom) return alert('Join a room first!');
  if (!message) return;

  socket.emit('send_message', {
    room: currentRoom,
    message,
  });

  messageInput.value = '';
};

messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendBtn.click();
  }
});

socket.on('receive_message', ({ message, sender_id, display_name, timestamp }) => {
  const time = new Date(timestamp).toLocaleTimeString();
  appendMessage(`<strong>${display_name}</strong> [${time}]: ${message}`);
});

function loadChatHistory(room, callback) {
  socket.emit('get_history', room, (messages) => {
    messagesDiv.innerHTML = '';
    messages.forEach(({ display_name, message, timestamp }) => {
      const time = new Date(timestamp).toLocaleTimeString();
      appendMessage(`<strong>${display_name}</strong> [${time}]: ${message}`);
    });
    if (callback) callback();
  });
}
