const socket = io({
  autoConnect: false,
});

let currentRoom = '';
let currentUser = null;

function showRegister() {
  document.getElementById('register-modal').style.display = 'flex';
}

function hideRegister() {
  document.getElementById('register-modal').style.display = 'none';
  document.getElementById('register-error').textContent = '';
}

function showChatUI() {
  document.getElementById('login-modal').style.display = 'none';
  document.getElementById('register-modal').style.display = 'none';
  document.getElementById('chat-container').style.display = 'block';
  document.getElementById('login-error').textContent = '';
  document.getElementById('username-display').textContent = currentUser.username;

  socket.connect();
  joinDefaultRoom();
}

function joinDefaultRoom() {
  const room = document.getElementById('room').value.trim() || 'General';
  currentRoom = room;
  loadChatHistory(room, () => {
    socket.emit('join_room', room);
    appendMessage(`<em>Joined room "${room}"</em>`);
  });
}

function appendMessage(html) {
  const messagesDiv = document.getElementById('messages');
  messagesDiv.innerHTML += `<div>${html}</div>`;
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function loadChatHistory(room, callback) {
  socket.emit('get_history', room, (messages) => {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.innerHTML = '';
    messages.forEach(({ display_name, message, timestamp }) => {
      const time = new Date(timestamp).toLocaleTimeString();
      appendMessage(`<strong>${display_name}</strong> [${time}]: ${message}`);
    });
    if (callback) callback();
  });
}

window.onload = () => {
  // Get DOM elements
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
  const joinRoomBtn = document.getElementById('join-room');

  // Check for stored user
  const storedUser = localStorage.getItem('user');
  if (storedUser) {
    currentUser = JSON.parse(storedUser);
    showChatUI();
  } else {
    loginModal.style.display = 'flex';
  }

  // Event listeners
  if (logoutBtn) {
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
  }

  if (loginForm) {
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
  }

  if (registerForm) {
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
  }

  if (joinRoomBtn) {
    joinRoomBtn.onclick = () => {
      const room = roomInput.value.trim();
      if (!room) return alert('Please enter a room name.');

      currentRoom = room;
      loadChatHistory(room, () => {
        socket.emit('join_room', room);
        appendMessage(`<em>Joined room "${room}"</em>`);
      });
    };
  }

  if (sendBtn) {
    sendBtn.onclick = () => {
      const message = messageInput.value.trim();
      if (!currentRoom) return alert('Join a room first!');
      if (!message) return;

      socket.emit('send_message', {
        room: currentRoom,
        message,
      });

      messageInput.value = '';
    };
  }

  if (messageInput) {
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendBtn.click();
      }
    });
  }
};

// Socket.IO event handlers
socket.on('receive_message', ({ message, sender_id, display_name, timestamp }) => {
  const time = new Date(timestamp).toLocaleTimeString();
  appendMessage(`<strong>${display_name}</strong> [${time}]: ${message}`);
});
