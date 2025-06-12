const socket = io({
  autoConnect: false,
});

let currentRoom = '';

function showChatUI() {
  document.getElementById('chat-container').style.display = 'block';
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
  const chatContainer = document.getElementById('chat-container');
  const logoutBtn = document.getElementById('logout-btn');
  const messagesDiv = document.getElementById('messages');
  const roomInput = document.getElementById('room');
  const usernameDisplay = document.getElementById('username-display');
  const messageInput = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');
  const joinRoomBtn = document.getElementById('join-room');
  
  showChatUI();

  if (logoutBtn) {
    logoutBtn.onclick = () => {
      fetch('/logout', { method: 'POST' })
        .finally(() => {
          window.location.href = '/login'; // or '/'
        });
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

socket.on('receive_message', ({ message, sender_id, display_name, timestamp }) => {
  const time = new Date(timestamp).toLocaleTimeString();
  appendMessage(`<strong>${display_name}</strong> [${time}]: ${message}`);
});
