// This is the config and requirements for the server. Sets up the constant variables that are used throughout the rest of the code and imports functions from other .js files
const express = require('express');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');
const knexConfig = require('./knexfile');
const lab_DB = require('knex')(knexConfig.lab_DB);
const chat_DB = require('knex')(knexConfig.chat_DB);
const user_DB = require('knex')(knexConfig.user_DB);
const path = require('path');
// The following two lines are similar but one is synchronous and one is async
const fs = require("fs");
const fsp = require('fs').promises;
// Next three lines are for the telegram bot. This isn't required for the server to function if all Telegram related stuff is removed
const TelegramBot = require('node-telegram-bot-api');
const { TELEGRAM_TOKEN, CHAT_ID } = require("./config"); // This file contains the Telegram token and chat id required for the bot to send and receive messages. Check example-config.js for format
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const DATA_FILE = path.join(__dirname, "tasks.json"); // This file stores all the retain checks for the future. Later code removes old ones that have passed.
const TEST_DATA_FILE = path.join(__dirname, "tests.json"); // Stores active tests
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // For production, this line should be removed and HTTPs should be set up
// These are user defined functions that pertain to user account handling. Helps keep this main file cleaner.
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

// If HTTPs to be used, this section needs to be updated
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'your-very-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false },
});

app.use(sessionMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/static', express.static('static')); // For static files e.g images, stylesheets, etc.
app.use('/chat', express.static(path.join(__dirname, 'views', 'chat'))); // Specifically for the chat part of the web app

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

// For dynamic pages, allows elements to be updated without having to manually change it. Useful for tables that are updated
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

let cachedResults = null;
let cachedQCResults = null;

// First / default route. Ensures users start at the correct page (login, update, or chat)
app.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.session.user) return res.redirect('/login');

    if (req.session.user.is_lab) return res.redirect('/update');
    return res.redirect('/chat');
  })
);

// For getting all retains that exists in storage
app.get(
  '/retains',
  requireLogin, // User has to be logged in
  requireLabUser, // User has to be a lab member
  asyncHandler(async (req, res) => {
    const results = await lab_DB('retains') // Knex style database querying. Similar to raw SQL
      .join('names', 'retains.code', 'names.code')
      .select('retains.*', 'names.name')
      .orderByRaw('box, SUBSTRING(batch, 3, 4), SUBSTRING(batch, 1, 2)');

    // Formats the date so it is in the 
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

    // Renders template with the data. See retains.ejs to see how it gets unpacked
    res.render('lab/retains', {
      retains: formattedResults,
      title: 'Retains'
    });
  })
);

// Main page for lab users. Can add and remove individual retains from inventory.
app.get(
  '/update',
  requireLogin,
  requireLabUser,
  asyncHandler(async (req, res) => {
    res.render('lab/update', { title: 'Update' });
  })
);

// Still part of main page but handles POST requests. Notice app.post instead of app.get.
// This route also handles requests from other forums as seen with the deleteBox option which is found at the /retains route if logged in as an Admin
app.post(
  '/update',
  requireLogin,
  requireLabUser,
  asyncHandler(async (req, res) => {
    const { code_batch, date, box, action } = req.body; // With how the barcode for a retain is designed, the one field covers both the product code and batch number (e.g. ###### BATCH)

    if (action === 'deleteBox') { // Deletes whole box (removes records with matching box number). Helps when deleting old (>1 year) retains
      await lab_DB('retains').where({ box: parseInt(box) }).del();
      res.redirect('/retains'); // Redirects to retain inventory page since that is where the user request with the deleteBox option would have came from
    }

    if (!code_batch) {
      res.redirect('/update');
    }

    const [codeStr, batch] = code_batch.split(' ');
    const code = parseInt(codeStr); // Stored as int in database, not string, so have to convert
    const finalDate = date || new Date().toISOString().slice(0, 10); // If no date provided, defaults to current date
    const finalBox = parseInt(box); // Again, stored as int in database

    if (action === 'add') {
      await lab_DB('retains').insert({ code, batch, date: finalDate, box: finalBox });
    } else if (action === 'remove') {
      await lab_DB('retains')
        .where({ code, batch, box: finalBox })
        .first()
        .del();
    }

    // Another action that is available only oon the retain inventory page when logged in as an Admin
    if (action === 'deleteRow') {
      await lab_DB('retains')
        .where({ code: parseInt(code), batch: batch, box: parseInt(box), date: date}).del();
      res.redirect('/retains');
    }

    res.redirect('/update');
  })
);

// Route to show all QC data
app.get(
  '/qc',
  requireLogin,
  requireLabUser,
  asyncHandler(async (req, res) => {
    if (!cachedQCResults) { // If there are no results already in memory or if they have been updated recently, will get fresh results
      try {
        let freshResults = await lab_DB('qc')
          .join('names', 'qc.code', 'names.code') // Pairs product names with produce codes
          .select('qc.*', 'names.name')
          .orderByRaw(
            'SUBSTRING(batch, 3, 1) DESC, SUBSTRING(batch, 2, 1) DESC, SUBSTRING(batch, 4) DESC' // Most recent on top
          );

        cachedQCResults = freshResults; // Stores results in server memory
      } catch (err) {
        console.error('Error fetching fresh QC results:', err);
      }
    }

    return res.render('lab/qc', {
      qc: Array.isArray(cachedQCResults) ? cachedQCResults : [],
      title: 'QC Logs',
    });
  })
);

// Route for testing data. See /qc route for better understanding of this route. Functions essentially the same.
app.get(
  '/results',
  requireLogin,
  requireLabUser,
  asyncHandler(async (req, res) => {
    if (!cachedResults) {
      try {
        let freshResults = await lab_DB('testing_data')
          .join('names', 'testing_data.code', 'names.code')
          .select('testing_data.*', 'names.name')
          .orderByRaw(
            'SUBSTRING(batch, 3, 1), SUBSTRING(batch, 2, 1), SUBSTRING(batch, 4), date DESC'
          );

        const formattedTesting = freshResults.map((test) => {
          const d = new Date(test.date);
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const yyyy = d.getFullYear();
          return {
            ...test,
            formattedDate: `${mm}/${dd}/${yyyy}`,
          };
        });

        cachedResults = formattedTesting;
      } catch (err) {
        console.error('Error fetching fresh results:', err);
      }
    }

    return res.render('lab/results', {
      testing: Array.isArray(cachedResults) ? cachedResults : [],
      title: 'Results',
    });
  })
);

// Basic route to display a page that lists the shared drive directories the lab uses. Helpful for new employees or as a refresher. Will have to manually update this page if files and folders are moved or renamed
app.get('/directory', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  res.render('lab/directory', { title: 'Directory' });
});

// Route for the chat rooms, also default for non-lab users. The main code for this is below with the socket connections and in views/chat/index.ejs
app.get(
  '/chat',
  asyncHandler(async (req, res) => {
    if (!req.session.user) return res.redirect('/login');

    res.render('chat/index', { title: 'Chat' });
  })
);

// A route for Admins. Allows users to be created, deleted, set to active / inactive, force change password, etc.
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

// Basic route for standard users to use
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

// For when users change their passwords, especially after an Admin resets it for them
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

// The Admin route for resetting user passwords
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

// Admin route for deleting users
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
      return res.status(400).send("You can't delete your own account"); // Prevents Admin from deleting their own account
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

// Route for toggling user account status, useful when users need to be temporarily disabled. Similar to the route for deleting users
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
      return res.status(400).send("You can't change your own active status"); // Prevents Admins from disabling their own account
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

// Route to create a new user. This route requires Admin status to use
app.post(
  '/register',
  requireLogin,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { username, password, isLabUser } = req.body; // Check views/admin.ejs to see form. Allows Admin to set a default password for a new user
    const id = await registerUser(username, password, isLabUser);
    res.redirect('/admin');
  })
);

// Simply renders the login page. Users should always be directed here until they login
app.get('/login', (req, res) => {
  res.render('login', { title: 'Log In' });
});

// Handles the login request
app.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const user = await loginUser(username, password);

    if (!user) {
      return res.redirect('/login'); // If the user does not exist or if the credentials are wrong, it will just redirect back to the login page. This can be enhanced by instead including either an alert popup or other indication
    }

    // Sets the session up for the user. Keeps track of their user id, name, admin status, lab member status, and active status
    req.session.user = {
      id: user.id,
      username: user.username,
      is_admin: user.is_admin,
      is_lab: user.is_lab,
      active: user.active
    };

    res.redirect('/'); // Redirects to default route which will then redirect based on if they are a lab member or not
  })
);

// Allows user to logout. Removes their session and clears their cookie
app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.status(200).json({ message: 'Logged out' });
  });
});

// These next routes are specific to the chat room functionality of the web page. They allow for deleting chat room messages by an Admin in case a user sends an inappropriate message
// These routes are not implemented fully and are not very user friendly, but are included as a way to avoid writing direct SQL queries.
// First route is for clearing a specific room
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

// This route is for completely removing all messages. Should only be used for testing purposes or in extreme cases
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
// Probably the most confusing session unless experienced with web sockets.
io.use((socket, next) => {
  const session = socket.handshake.session;
  if (session && session.user) {
    socket.user = session.user;
    next();
  } else {
    next(new Error('Authentication error'));
  }
});

// This handles the socket connection, joining rooms, displaying message history, etc.
io.on('connection', (socket) => {
  // Joining a room
  socket.on('join_room', (room) => {
    if (!socket.user) return;
    socket.join(room);
    console.log(`${socket.user.username} joined room ${room}`);
  });

  // Sending a message
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

    // Alerts other socket connections a message has been received so the other users can see it without refreshing the page
    io.to(room).emit('receive_message', { message, sender_id, display_name, timestamp });
  });

  // Private messages are not implemented, but the original idea was to allow users to message each other directly. The chat feature never gets used, so it never got implemented
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

    // Let's user know they got a private message. Again, this isn't implemented
    io.to(recipientId).emit('receive_private_message', {
      message,
      sender_id,
      display_name,
      timestamp,
    });
  });

  // Retrieve message history for the room the user joins
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

  // Logs when a user disconnects. Only useful for backend devs or debugging purposes
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// The next section of code deals with setting reminders and the Telegram bot behavior.
// When a user sets up reminders, will do the math required to determine what the future time will be
const addTime = (date, type) => {
  let d = new Date(date);
  switch (type) {
    case "48h": d.setHours(d.getHours() + 48); break;
    case "7d": d.setDate(d.getDate() + 7); break;
    case "3m": d.setMonth(d.getMonth() + 3); break;
    case "1y": d.setFullYear(d.getFullYear() + 1); break;
    default: 
      const hours = Number(type);
      if (!isNaN(hours)) d.setHours(d.getHours() + hours);
      break;
  }
  return d;
};

const INTERVALS = ["48h", "7d", "3m", "1y"];  // The intervals that have been used. Can be changed if needed, but may have to change the section of code above too

// Route for users to add task reminders. Since these are lab specific reminders, they must be a lab user to access this
app.get('/reminders',
  requireLogin,
  requireLabUser,
  asyncHandler(async(req, res) => {
  res.render('lab/reminders', { title: 'Reminders' });
}));

// Handles user submission for reminders. With how this is currently used, the user will enter a batch number only
app.post('/reminders', async (req, res) => {
  const { batch } = req.body;
  if (!batch) return res.status(400).send("Missing batch number");

  const cstNow = new Date();

  cstNow.setHours(19, 0, 0, 0);

  const createdAt = cstNow.toISOString();

  const tasks = INTERVALS.map(interval => ({
    id: `${batch}-${interval}`, // This id should be unique. If batch numbers are likely to be repeated, this should be changed to something that is less likely to have conflicts
    batch,
    interval,
    due: addTime(createdAt, interval),
    notified: false // Used to check whether a notification has been sent out and if it is safe to delete
  }));

  // Adds the new tasks to the old tasks. See functions a few sections down for more info
  const allTasks = readTasks(DATA_FILE);
  writeTasks(DATA_FILE, [...allTasks, ...tasks]);

  // Part of the Telegram bot functionality. Preps a message and tries to send it. Again, see sections below for function definition
  const message = `✅ Batch ${batch} added!`;
  try {
    await sendTelegramMessage(message);
  } catch (error) {
    console.error("Telegram message failed:", error);
    return res.status(500).send("Batch added, but failed to send Telegram message.");
  }

  res.render('lab/reminders', { title: 'Reminders' });
});

app.get('/tests',
  requireLogin,
  requireLabUser,
  asyncHandler(async (req, res) => {
    const testNameMap = {
      "copper-corrosion": "Copper Corrosion",
      "oil-bleed": "Oil Bleed",
      "oxidation": "Oxidation",
      "rust": "Rust"
    };

    const toCSTDateTimeString = (utcDate) => {
      return new Date(utcDate)
        .toLocaleString("en-US", {
          timeZone: "America/Chicago",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true
        });
    };

    const tests = readTasks(TEST_DATA_FILE).map(t => ({
      ...t,
      displayName: testNameMap[t.test] || t.test,
      dueFormatted: t.due ? toCSTDateTimeString(new Date(t.due)) : ""
    }));

    res.render('lab/tests', { title: 'Active Tests', tests });
  })
);

app.post('/tests', async (req, res) => {
  const { batch, test, duration } = req.body;
  if (!batch) return res.status(400).send("Missing batch number");
  if (!test) return res.status(400).send("Missing test");
  if (!duration) return res.status(400).send("No duration");

  const now = new Date();
  const due = addTime(now, duration);

  const newTask = {
    id: `${batch}-${test}`,
    batch,
    test,
    due: due.toISOString(),
    notified: false
  };

  const allTestTasks = readTasks(TEST_DATA_FILE);
  writeTasks(TEST_DATA_FILE, [...allTestTasks, newTask]);

  res.redirect('/tests');
});

// This is the route that will update all the database, adding or updating QC and testing data. This route is mainly used as a way to click one button and run two Python scripts on the server machine.
// Definitely not the best way to do this, but with how this setup was structured, the web server runs in a docker container while the Windows host machine, that uses a company login, has access to a shared drive.
// If the main source of data was local or if users could be trusted to maintain this, there would be many better alternatives. This route was mainly for me so I didn't have to remote into the server and manually run the scripts.
app.get(
  '/update-database',
  requireLogin,
  requireAdmin,
  asyncHandler(async (req, res) => {
    try {
      cachedResults = null; // Resets the cachedResults in memory
      cachedQCResults = null; // Resets the cachedQCResults in memory

      // Sends request to run scripts. They take a while to run, making the client side time-out. The script logs are not really necessary so a simple confirmation that they have started is sufficient
      fetch('http://host.docker.internal:5001/run-scripts', { method: 'POST' })
        .then(() => console.log('Host script initialization triggered'))
        .catch(err => console.error('Error triggering host script:', err));

      res.send('Scripts have been initialized.');
    } catch (err) {
      console.error('Error calling host script:', err);
      res.status(500).send('Failed to initialize scripts on host');
    }
  })
);

// The following functions are used for the Telegram bot to check which reminders have been sent and to add new ones. Also for sending the Telegram message
function readTasks(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeTasks(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function addBatchTasks(batch) {
  const cstNow = new Date();

  cstNow.setHours(19, 0, 0, 0);

  const createdAt = cstNow.toISOString();

  const newTasks = INTERVALS.map(interval => ({
    id: `${batch}-${interval}`,
    batch,
    interval,
    due: addTime(createdAt, interval),
    notified: false
  }));

  const allTasks = readTasks(DATA_FILE);
  writeTasks(DATA_FILE, [...allTasks, ...newTasks]);
}

// Function that actually sends the Telegram message. Again, check example-config.js to see how the token and chat id should be formatted.
async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text })
  });
}

// Checks which reminders need to be sent out. Once it sends the alert, it will mark it as notified and eventually the reminder will get removed.
async function checkDueTasks(file) {
  const tasks = readTasks(file);
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

  if (updated) writeTasks(file, tasks);
}

// Function that cleans up the tasks.json file so it doesn't become too large. The intervals can be changed
function cleanupNotifiedEntries(file) {
  try {
    if (!fs.existsSync(file)) return;

    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const cleaned = data.filter(entry => !entry.notified);

    // Only write if changes were made
    if (cleaned.length !== data.length) {
      fs.writeFileSync(file, JSON.stringify(cleaned, null, 2), 'utf8');
      console.log(`[${new Date().toISOString()}] Cleaned up ${data.length - cleaned.length} notified entries.`);
    }
  } catch (err) {
    console.error('Error during cleanup:', err);
  }
}

// If the bot receives a message, it will check to see if it is a batch number. If so, it will create the reminders automatically. Allows users to message the bot instead of using the web app directly
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text && msg.text.trim().toUpperCase();

  if (text && /^[A-Z]{2}\d{4}[A-Z]?$/.test(text)) {
    addBatchTasks(text);
    bot.sendMessage(chatId, `✅ Batch *${text}* added!`, { parse_mode: 'Markdown' });
  }
});

// On startup, checks which reminders need to be sent out, cleans up old ones, and then sets intervals to repeat those tasks
checkDueTasks(DATA_FILE);
checkDueTasks(TEST_DATA_FILE);
cleanupNotifiedEntries(DATA_FILE);
cleanupNotifiedEntries(TEST_DATA_FILE);
setInterval(() => cleanupNotifiedEntries(DATA_FILE), 7 * 24 * 60 * 60 * 1000); // Once a week
setInterval(() => cleanupNotifiedEntries(TEST_DATA_FILE), 24 * 60 * 60 * 1000); // Once a day
setInterval(() => checkDueTasks(DATA_FILE), 60 * 1000 * 30); // Every 30 minutes
setInterval(() => checkDueTasks(TEST_DATA_FILE), 60 * 1000 * 30); // Every 30 minutes

// These following routes are going to be for api calls. Might be useful for some applications
// Get list of users
app.get('/api/users',
  requireLogin, 
  requireAdmin, 
  asyncHandler(async (req, res) => {
    const users = await user_DB('users')
      .select('id', 'username', 'active', 'is_lab', 'is_admin')
      .orderBy('id');

    if (!users) {
      return res.status(404).json({ error: "No users found" });
    }

    res.json({data: users});
}));

// Get specific user information
app.get('/api/users/:id',
  requireLogin, 
  requireAdmin, 
  asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user ID' });
    const user = await user_DB('users')
      .select('id', 'username', 'active', 'is_lab', 'is_admin')
      .where({ id: userId })
      .first()

    if (!user) {
      return res.status(404).json({ error: "No user found" });
    }

    res.json({ data: user });
}));

// Get all retain information
app.get('/api/retains',
  asyncHandler(async (req, res) => {
    const retains = await lab_DB('retains')
      .join('names', 'retains.code', 'names.code')
      .select('retains.*', 'names.name')
      .orderByRaw('box, SUBSTRING(batch, 3, 4), SUBSTRING(batch, 1, 2)');

    if (!retains) {
      return res.status(404).json({ error: "No retains found" });
    }

    res.json({ data: retains });
}));

// Get specific retain information
app.get('/api/retains/:batch',
  asyncHandler(async (req, res) => {
    const batch = req.params.batch;
    const retain = await lab_DB('retains')
      .join('names', 'retains.code', 'names.code')
      .select('retains.*', 'names.name')
      .where({ batch: batch })
      .orderByRaw('box, SUBSTRING(batch, 3, 4), SUBSTRING(batch, 1, 2)');

    if (!retain) {
      return res.status(404).json({ error: "No retain found for batch" });
    }

    res.json({ data: retain });
}));

// Get all qc results
app.get('/api/qc',
  asyncHandler(async (req, res) => {

    if (cachedQCResults && Array.isArray(cachedQCResults)) {
      res.json({ data: cachedQCResults });
    }

    console.log('Querying database for QC logs');
    const results = await lab_DB('qc')
      .join('names', 'qc.code', 'names.code')
      .select('qc.*', 'names.name')
      .orderByRaw(
        'SUBSTRING(batch, 3, 1) DESC, SUBSTRING(batch, 2, 1) DESC, SUBSTRING(batch, 4) DESC'
      );
    
    cachedQCResults = results;

    if (!results) {
      return res.status(404).json({ error: "No qc data found" });
    }

    res.json({ data: results});
}));

// Get specific qc results
app.get('/api/qc/:batch',
  asyncHandler(async (req, res) => {
    const batch = req.params.batch;
    const results = await lab_DB('qc')
      .join('names', 'qc.code', 'names.code')
      .select('qc.*', 'names.name')
      .where({ batch: batch })
      .orderByRaw(
        'SUBSTRING(batch, 3, 1) DESC, SUBSTRING(batch, 2, 1) DESC, SUBSTRING(batch, 4) DESC'
      );
    
    if (!results) {
      return res.status(404).json({ error: "No qc data found for batch" });
    }

    res.json({ data: results});
}));

// Get all testing results
app.get('/api/testing',
  asyncHandler(async (req, res) => {

    if (cachedResults && Array.isArray(cachedResults)) {
      res.json({ data: cachedResults });
    }

    console.log('Querying database for testing logs');
    const results = await lab_DB('testing_data')
      .join('names', 'testing_data.code', 'names.code')
      .select('testing_data.*', 'names.name')
      .orderByRaw(
        'SUBSTRING(batch, 3, 1), SUBSTRING(batch, 2, 1), SUBSTRING(batch, 4), date DESC'
      );
    
    cachedResults = results;

    if (!results) {
      return res.status(404).json({ error: "No testing data found" });
    }

    res.json({ data: results});
}));

// Get specific testing results
app.get('/api/testing/:batch',
  asyncHandler(async (req, res) => {
    const batch = req.params.batch;
    const results = await lab_DB('testing_data')
      .join('names', 'testing_data.code', 'names.code')
      .select('testing_data.*', 'names.name')
      .where({ batch: batch })
      .orderByRaw(
        'SUBSTRING(batch, 3, 1), SUBSTRING(batch, 2, 1), SUBSTRING(batch, 4), date DESC'
      );
    
    if (!results) {
      return res.status(404).json({ error: "No testing data found for batch" });
    }

    res.json({ data: results});
}));

// Get all reminders
app.get('/api/reminders',
  asyncHandler(async (req, res) => {
    const results = readTasks(DATA_FILE);
    if (!results) {
      return res.status(404).json({ error: "No reminders found" });
    }

    res.json({ data: results});
}));

// Get specific reminders
app.get('/api/reminders/:batch',
  asyncHandler(async (req, res) => {
    const batch = req.params.batch;
    const allResults = readTasks(DATA_FILE);
    const results =  allResults.filter(result => result.batch === batch);

    if (!results) {
      return res.status(404).json({ error: "No reminders found" });
    }

    res.json({ data: results});
}));

// Get all test reminders
app.get('/api/tests',
  asyncHandler(async (req, res) => {
    const results = readTasks(TEST_DATA_FILE);
    if (!results) {
      return res.status(404).json({ error: "No test reminders found" });
    }

    res.json({ data: results});
}));

// Get specific test reminders
app.get('/api/tests/:batch',
  asyncHandler(async (req, res) => {
    const batch = req.params.batch;
    const allResults = readTasks(TEST_DATA_FILE);
    const results =  allResults.filter(result => result.batch === batch);

    if (!results) {
      return res.status(404).json({ error: "No test reminders found" });
    }

    res.json({ data: results});
}));

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
