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
  requireLabUser,
  isLabUser
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
const engine = require('ejs-mate');
app.engine('ejs', engine);
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
  let labUser = false;
  try {
    labUser = await isLabUser(req.session.user.username);
  } catch (err) {
    console.error(err);
    return res.status(500).send('Database error');
  }
  if (labUser) {
    return res.redirect('/update');
  }
  return res.redirect('/chat');
});


app.get('/retains', requireLogin, requireLabUser, async (req, res) => {
  const results = await lab_DB('retains')
    .join('names', 'retains.code', 'names.code')
    .select('retains.*', 'names.name')
    .orderByRaw('box, SUBSTRING(batch, 3, 4), SUBSTRING(batch, 1, 2)');
  const formattedResults = results.map(retain => {
    const d = new Date(retain.date);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return {
      ...retain,
      formattedDate: `${mm}/${dd}/${yyyy}`
    };
  });
  res.render('lab/retains', {
    user_id: req.session.user.id,
    username: req.session.user.username,
    labUser: true,
    retains: formattedResults 
  });
});

app.get('/update', requireLogin, requireLabUser, async (req, res) => {
  return res.render('lab/update', {
    user_id: req.session.user.id,
    username: req.session.user.username,
    labUser: true
  });
});

app.post('/update', requireLogin, requireLabUser, async (req, res) => {
  let { code_batch, date, box, action } = req.body;
  let [code, batch] = code_batch.split(' ');
  code = parseInt(code);
  date = date || new Date().toISOString().slice(0, 10);
  box = parseInt(box);

  try {
    if (action === 'add') {
      await lab_DB('retains').insert({
        code: code,
        batch: batch,
        date: date,
        box: box
      });
    } else if (action === 'remove') {
      await lab_DB('retains')
        .where({ code, batch, box })
        .first()
        .del();
    }
    res.redirect('/update');
  } catch (e) {
    console.error(e);
    res.status(500).send('Database error');
  }
});

app.get('/qc', requireLogin, requireLabUser, async (req, res) => {
    const results = await lab_DB('qc')
    .join('names', 'qc.code', 'names.code')
    .select('qc.*', 'names.name')
    .orderByRaw('SUBSTRING(batch, 3, 1) DESC, SUBSTRING(batch, 2, 1) DESC, SUBSTRING(batch, 4) DESC');
  res.render('lab/qc', {
    user_id: req.session.user.id,
    username: req.session.user.username,
    labUser: true,
    qc: results 
  });
});

app.get('/testing', requireLogin, requireLabUser, async (req, res) => {
  const results = await lab_DB('testing_data')
    .join('names', 'testing_data.code', 'names.code')
    .select('testing_data.*', 'names.name')
    .orderByRaw('SUBSTRING(batch, 3, 1), SUBSTRING(batch, 2, 1), SUBSTRING(batch, 4), date DESC');
  const formattedTesting = results.map(test => {
    const d = new Date(test.date);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return {
      ...test,
      formattedDate: `${mm}/${dd}/${yyyy}`
    };
  });
  res.render('lab/testing', {
    user_id: req.session.user.id,
    username: req.session.user.username,
    labUser: true,
    testing: formattedTesting
  });
});

app.get('/directory', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  return res.render('lab/directory', {
    user_id: req.session.user.id,
    username: req.session.user.username,
    labUser: true
  });
});

app.get('/chat', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  return res.render('chat/index', {
    user_id: req.session.user.id,
    username: req.session.user.username,
    labUser: isLabUser(req.session.user.userame)
  });
});

app.post('/register', requireLogin, requireAdmin, asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const id = await registerUser(username, password);
  res.status(201).json({ message: 'User registered', id });
}));

app.get('/login', (req, res) => {
  res.render('login', {
    title: 'Log In',
  });
});

app.post('/login', asyncHandler(async (req, res) => {
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
}));

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.status(200).json({ message: 'Logged out' });
  });
});

app.delete('/chat/:room/clear', requireLogin, requireAdmin, asyncHandler(async (req, res) => {
  const { room } = req.params;
  await chat_DB('messages').where({ room }).del();
  res.status(200).json({ message: `All messages from room '${room}' deleted.` });
}));

app.delete('/chat/clear', requireLogin, requireAdmin, asyncHandler(async (req, res) => {
  await chat_DB('messages').del();
  res.status(200).json({ message: 'All messages deleted.' });
}));

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
