const express = require('express');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');
const knexConfig = require('./knexfile');
const lab_DB = require('knex')(knexConfig.lab_DB);
const chat_DB = require('knex')(knexConfig.chat_DB);
const path = require('path');
const {
  registerUser,
  loginUser,
  requireLogin,
  requireAdmin,
} = require('./auth');
const sharedSession = require('express-socket.io-session');

const app = express();
const server = http.createServer(app);

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'your-very-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false },
});

app.use(sessionMiddleware);
app.use(express.json());
app.use('/chat', express.static(path.join(__dirname, 'public', 'chat')));

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Share session between Express and Socket.IO
io.use(sharedSession(sessionMiddleware, { autoSave: true }));

// Async handler wrapper
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

app.get('/', (req, res) => {
  res.redirect('/chat');
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
  // OR, if you don't have a chat.html:
  // res.send('Chat interface is now at /chat');
});

app.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const id = await registerUser(username, password);
    res.status(201).json({ message: 'User registered', id });
  })
);

app.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const user = await loginUser(username, password);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
    };

    res.json({
      message: 'Login successful',
      userId: user.id,
      username: user.username,
    });
  })
);

app.post('/logout', (req, res) => {
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to logout' });
      }
      res.clearCookie('connect.sid');
      res.json({ message: 'Logged out successfully' });
    });
  } else {
    res.status(200).json({ message: 'No session to destroy' });
  }
});

app.delete(
  '/chat/:room/clear',
  requireLogin,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { room } = req.params;
    await chat_DB('messages').where({ room }).del();
    res.status(200).json({ message: `All messages from room '${room}' deleted.` });
  })
);

app.delete(
  '/chat/clear',
  requireLogin,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await chat_DB('messages').del();
    res.status(200).json({ message: 'All messages deleted.' });
  })
);

// Socket.IO auth middleware (optional, but recommended)
io.use((socket, next) => {
  const session = socket.handshake.session;
  if (session && session.user) {
    socket.user = session.user;
    next();
  } else {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.user.username} (${socket.id})`);
  console.log('Session data:', socket.handshake.session);

  socket.on('join_room', (room) => {
    if (!socket.user) return;
    socket.join(room);
    console.log(`${socket.user.username} joined room ${room}`);
  });

  socket.on('send_message', async ({ room, message }) => {
    const { id: sender_id, username: display_name } = socket.user;
    const timestamp = new Date();

    await chat_DB('messages').insert({
      room,
      sender: sender_id,
      display_name,
      message,
      timestamp,
    });

    io.to(room).emit('receive_message', { message, sender_id, display_name, timestamp });
  });

  socket.on('private_message', async ({ recipientId, message }) => {
    const { id: sender_id, username: display_name } = socket.user;
    const timestamp = new Date();

    await chat_DB('messages').insert({
      recipientId,
      sender: sender_id,
      display_name,
      message,
      timestamp,
    });

    io.to(recipientId).emit('receive_private_message', {
      message,
      sender_id,
      display_name,
      timestamp,
    });
  });

  socket.on('get_history', async (room, callback) => {
    try {
      const messages = await chat_DB('messages')
        .where({ room })
        .join('users', 'messages.sender', 'users.id')
        .select('messages.message', 'messages.timestamp', 'users.username as display_name')
        .orderBy('messages.timestamp', 'asc');

      callback(messages);
    } catch (error) {
      console.error('Error fetching history:', error);
      callback([]);
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
