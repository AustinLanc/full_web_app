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
  checkLabUser
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
app.use(express.urlencoded({ extended: true }));
app.use('/static', express.static('static'));
app.use('/chat', express.static(path.join(__dirname, 'views', 'chat')));

app.set('views', './views');
app.set('view engine', 'ejs');

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

app.get('/', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  const isLabUser = await checkLabUser(req.session.user.username);
  if (isLabUser) {
    return res.render('lab/update', {
      user_id: req.session.user.id,
      username: req.session.user.username,
      labUser: true
    });
  }
  return res.render('chat/index', {
    user_id: req.session.user.id,
    username: req.session.user.username,
    labUser: false
  });
});


app.get('/retains', requireLogin, checkLabUser, (req, res) => {
  // QUERY DB, GET ALL RETAINS IN DB, ORDER BY box, SUBSTRING(batch, 3, 4), SUBSTRING(batch, 1, 2)
  res.render('lab/retains', { retains: results });
});

app.get('/update', requireLogin, checkLabUser, (req, res) => {
  return res.render('lab/update');
});

app.post('/update', requireLogin, checkLabUser, (req, res) => {
  let { code_batch, date, box, action } = req.body;
  let [code, batch] = code_batch.split(' ');
  code = parseInt(code);
  date = date || new Date().toISOString().slice(0, 10);
  box = parseInt(box);

  if (action === 'add') {
    // USE KNEX TO ADD RETAIN TO DB
  } else if (action === 'remove') {
    // USE KNEX TO REMOVE RETAIN FROM DB
  }
  res.redirect('/update');
});

app.get('/qc', requireLogin, checkLabUser, (req, res) => {
  // QUERY TABLE TO GET ALL QC LOGS, ORDER BY SUBSTRING(q.batch, 3, 1) DESC, SUBSTRING(q.batch, 2, 1) DESC, SUBSTRING(q.batch, 4) DESC
  res.render('/lab/qc.html', { qc: results });
});

app.get('/testing', requireLogin, (req, res) => {
  // QUERY TABLE TO GET TESTING DATA, ORDER BY SUBSTRING(batch, 3, 1), SUBSTRING(batch, 2, 1), SUBSTRING(batch, 4), date DESC
  res.render('testing.html', { testing: results });
});

app.get('/chat', (req, res) => {
  console.log(req.session)
  
  if (!req.session.user) {
    return res.redirect('/login');
  }
  return res.render('chat/index', {
    user_id: req.session.user.id,
    username: req.session.user.username,
    labUser: false
  });
});

app.post(
  '/register',
  requireLogin,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const id = await registerUser(username, password);
    res.status(201).json({ message: 'User registered', id });
  })
);

app.get('/login', (req, res) => {
  res.render('login', {
    title: 'Log In',
  });
});

app.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const user = await loginUser(username, password);

    if (!user) {
      return res.status(401).render('login', { title: 'Log In', error: 'Invalid credentials' });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      isAdmin: user.is_Admin,
    };

    res.redirect('/');
  })
);

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.status(200).json({ message: 'Logged out' });
  });
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
