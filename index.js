const express = require('express');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');
const knexConfig = require('./knexfile');
const lab_DB = require('knex')(knexConfig.lab_DB);
const chat_DB = require('knex')(knexConfig.chat_DB);
const user_DB = require('knex')(knexConfig.user_DB);
const path = require('path');
const fs = require("fs");
const TelegramBot = require('node-telegram-bot-api');
const { TELEGRAM_TOKEN, CHAT_ID } = require("./config");
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const DATA_FILE = path.join(__dirname, "tasks.json");
const {
  registerUser,
  loginUser,
  requireLogin,
  requireAdmin,
  requireLabUser,
  updatePassword,
  adminResetUserPassword,
  deleteUser,
  toggleUser,
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

app.use((req, res, next) => {
  if (req.session && req.session.user) {
    res.locals.user_id = req.session.user.id;
    res.locals.username = req.session.user.username;
    res.locals.is_lab = req.session.user.is_lab;
    res.locals.is_admin = req.session.user.is_admin;
  } else {
    res.locals.user_id = null;
    res.locals.username = null;
    res.locals.is_lab = false;
    res.locals.is_admin = false;
  }
  next();
});

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

io.use(sharedSession(sessionMiddleware, { autoSave: true }));

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

app.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.session.user) return res.redirect('/login');

    if (req.session.user.is_lab) return res.redirect('/update');
    return res.redirect('/chat');
  })
);

app.get(
  '/retains',
  requireLogin,
  requireLabUser,
  asyncHandler(async (req, res) => {
    const results = await lab_DB('retains')
      .join('names', 'retains.code', 'names.code')
      .select('retains.*', 'names.name')
      .orderByRaw('box, SUBSTRING(batch, 3, 4), SUBSTRING(batch, 1, 2)');

    const formattedResults = results.map((retain) => {
      const d = new Date(retain.date);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const yyyy = d.getFullYear();
      return {
        ...retain,
        formattedDate: `${mm}/${dd}/${yyyy}`,
      };
    });

    res.render('lab/retains', {
      retains: formattedResults,
      title: 'Retains'
    });
  })
);

app.get(
  '/update',
  requireLogin,
  requireLabUser,
  asyncHandler(async (req, res) => {
    res.render('lab/update', { title: 'Update' });
  })
);

app.post(
  '/update',
  requireLogin,
  requireLabUser,
  asyncHandler(async (req, res) => {
    const { code_batch, date, box, action } = req.body;

    if (action === 'deleteBox') {
      await lab_DB('retains').where({ box: parseInt(box) }).del();
      res.redirect('/retains');
    }

    if (!code_batch) {
      res.redirect('/update');
    }

    const [codeStr, batch] = code_batch.split(' ');
    const code = parseInt(codeStr);
    const finalDate = date || new Date().toISOString().slice(0, 10);
    const finalBox = parseInt(box);

    if (action === 'add') {
      await lab_DB('retains').insert({ code, batch, date: finalDate, box: finalBox });
    } else if (action === 'remove') {
      await lab_DB('retains')
        .where({ code, batch, box: finalBox })
        .first()
        .del();
    }

    if (action === 'deleteRow') {
      await lab_DB('retains')
        .where({ code: parseInt(code), batch: batch, box: parseInt(box), date: date}).del();
      res.redirect('/retains');
    }

    res.redirect('/update');
  })
);

app.get(
  '/qc',
  requireLogin,
  requireLabUser,
  asyncHandler(async (req, res) => {
    const results = await lab_DB('qc')
      .join('names', 'qc.code', 'names.code')
      .select('qc.*', 'names.name')
      .orderByRaw(
        'SUBSTRING(batch, 3, 1) DESC, SUBSTRING(batch, 2, 1) DESC, SUBSTRING(batch, 4) DESC'
      );

    res.render('lab/qc', {
      qc: results,
      title: 'QC Logs'
    });
  })
);

app.get(
  '/results',
  requireLogin,
  requireLabUser,
  asyncHandler(async (req, res) => {
    const results = await lab_DB('testing_data')
      .join('names', 'testing_data.code', 'names.code')
      .select('testing_data.*', 'names.name')
      .orderByRaw('SUBSTRING(batch, 3, 1), SUBSTRING(batch, 2, 1), SUBSTRING(batch, 4), date DESC');

    const formattedTesting = results.map((test) => {
      const d = new Date(test.date);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const yyyy = d.getFullYear();
      return {
        ...test,
        formattedDate: `${mm}/${dd}/${yyyy}`,
      };
    });

    res.render('lab/results', {
      testing: formattedTesting,
      title: 'Results'
    });
  })
);

app.get('/directory', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  res.render('lab/directory', { title: 'Directory' });
});

app.get(
  '/chat',
  asyncHandler(async (req, res) => {
    if (!req.session.user) return res.redirect('/login');

    res.render('chat/index', { title: 'Chat' });
  })
);

app.get(
  '/admin',
  requireLogin,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const users = await user_DB('users').select('*');

    res.render('admin', {
      users: users,
      title: 'Admin'
    });
  })
);

app.get(
  '/account',
  requireLogin,
  asyncHandler(async (req, res) => {
    res.render('account', {
      error: null,
      success: null,
      title: 'Account'
    });
  })
);

app.post(
  '/account',
  requireLogin,
  asyncHandler(async (req, res) => {
    const { current_password, new_password } = req.body;

    try {
      const userId = req.session.user.id;
      await updatePassword(userId, current_password, new_password);
      res.redirect('/account');
    } catch (error) {
      console.error('Password update error:', error.message);
      res.status(400).send(error.message);
    }
  })
);

app.post(
  '/admin/reset-password',
  requireLogin,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { username, new_password } = req.body;

    try {
      const updatedUsername = await adminResetUserPassword(username, new_password);
      res.redirect('/admin');
    } catch (error) {
      console.error('Admin password reset error:', error.message);
      res.status(400).send(error.message);
    }
  })
);

app.post(
  '/admin/delete-user',
  requireLogin,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).send('User ID is required');
    }

    if (req.session.user.id === parseInt(user_id)) {
      return res.status(400).send("You can't delete your own account");
    }

    try {
      await deleteUser(user_id);
      res.redirect('/admin');
    } catch (error) {
      console.error('Delete user error:', error.message);
      if (error.message === 'User not found') {
        return res.status(404).send(error.message);
      }
      res.status(500).send('Internal server error');
    }
  })
);

app.post(
  '/admin/toggle-user',
  requireLogin,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).send('User ID is required');
    }

    if (req.session.user.id === parseInt(user_id)) {
      return res.status(400).send("You can't change your own active status");
    }

    try {
      const newStatus = await toggleUser(user_id);
      res.redirect('/admin');
    } catch (error) {
      console.error('Toggle user status error:', error.message);
      if (error.message === 'User not found') {
        return res.status(404).send(error.message);
      }
      res.status(500).send('Internal server error');
    }
  })
);

app.post(
  '/register',
  requireLogin,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { username, password, isLabUser } = req.body;
    const id = await registerUser(username, password, isLabUser);
    res.redirect('/admin');
  })
);

app.get('/login', (req, res) => {
  res.render('login', { title: 'Log In' });
});

app.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const user = await loginUser(username, password);

    if (!user) {
      es.redirect('/login');
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      is_admin: user.is_admin,
      is_lab: user.is_lab,
      active: user.active
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

// Socket.IO auth middleware
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
        .select('message', 'timestamp', 'display_name')
        .orderBy('timestamp', 'asc');

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

const now = () => new Date();
const addTime = (date, type) => {
  let d = new Date(date);
  switch (type) {
    case "48h": d.setHours(d.getHours() + 48); break;
    case "7d": d.setDate(d.getDate() + 7); break;
    case "3m": d.setMonth(d.getMonth() + 3); break;
    case "1y": d.setFullYear(d.getFullYear() + 1); break;
  }
  return d;
};

const INTERVALS = ["48h", "7d", "3m", "1y"];

app.get("/reminders",
  requireLogin,
  requireLabUser,
  asyncHandler(async(req, res) => {
  res.render('lab/reminders', { title: 'Reminders' });
}));

app.post("/reminders", async (req, res) => {
  const { batch } = req.body;
  if (!batch) return res.status(400).send("Missing batch number");

  const createdAt = new Date().toISOString();
  const tasks = INTERVALS.map(interval => ({
    id: `${batch}-${interval}`,
    batch,
    interval,
    due: addTime(createdAt, interval),
    notified: false
  }));

  const allTasks = readTasks();
  writeTasks([...allTasks, ...tasks]);

  // Send a Telegram confirmation message
  const message = `✅ Batch *${batch}* added via API. Reminders have been scheduled.`;
  try {
    await sendTelegramMessage(message);
  } catch (error) {
    console.error("Telegram message failed:", error);
    return res.status(500).send("Batch added, but failed to send Telegram message.");
  }

  res.send("Batch added with scheduled checks and Telegram notification sent.");
});


function readTasks() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function writeTasks(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function addBatchTasks(batch) {
  const createdAt = new Date().toISOString();
  const newTasks = INTERVALS.map(interval => ({
    id: `${batch}-${interval}`,
    batch,
    interval,
    due: addTime(createdAt, interval),
    notified: false
  }));

  const allTasks = readTasks();
  writeTasks([...allTasks, ...newTasks]);
}

async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text })
  });
}

async function checkDueTasks() {
  const tasks = readTasks();
  const nowTime = new Date();

  let updated = false;

  for (let task of tasks) {
    if (!task.notified && new Date(task.due) <= nowTime) {
      const message = `🔔 Batch ${task.batch} - ${task.interval} check is due!`;
      await sendTelegramMessage(message);
      task.notified = true;
      updated = true;
    }
  }

  if (updated) writeTasks(tasks);
}

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text && msg.text.trim().toUpperCase();

  if (text && /^[A-Z0-9\- ]{3,}$/.test(text)) {
    addBatchTasks(text);
    bot.sendMessage(chatId, `✅ Batch *${text}* added and reminders scheduled!`, { parse_mode: 'Markdown' });
  } else {
    bot.sendMessage(chatId, '⚠️ Please send a valid batch number.');
  }
});

setInterval(checkDueTasks, 60 * 1000);

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
