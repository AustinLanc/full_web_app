const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql2/promise');
const knex = require('knex')(require('./knexfile').development);
const { registerUser, loginUser } = require('./auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('LAN Chat Server is running');
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const id = await registerUser(username, password);
    res.status(201).json({ message: 'User registered', id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await loginUser(username, password);
    res.json({ message: 'Login successful', userId: user.id });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

app.get('/users/:userId/names', async (req, res) => {
  const { userId } = req.params;
  const names = await knex('display_names').where({ user_id: userId }).select('id', 'name');
  res.json(names);
});

app.post('/users/:userId/names', async (req, res) => {
  const { userId } = req.params;
  const { name } = req.body;

  try {
    const [id] = await knex('display_names').insert({ user_id: userId, name });
    res.status(201).json({ id, name });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});





// Socket.IO logic
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join_room', (room) => {
    socket.join(room);
    console.log(`${socket.id} joined room ${room}`);
  });

  socket.on('send_message', async ({ room, message, sender_id, display_name }) => {
    const timestamp = new Date();

    await knex('messages').insert({
      room,
      sender: sender_id,
      display_name,
      message,
      timestamp
    });

    io.to(room).emit('receive_message', { message, sender_id, display_name, timestamp });
  });

  socket.on('private_message', async ({ recipientId, message, sender_id, display_name }) => {
    const timestamp = new Date();

    await knex('messages').insert({ 
      recipientId, 
      sender: sender_id, 
      display_name,
      message, 
      timestamp });
    
    io.to(recipientId).emit('receive_private_message', { message, sender_id, display_name, timestamp });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });

  socket.on('get_history', async (room, callback) => {
    const messages = await knex('messages')
      .where({ room })
      .orderBy('timestamp', 'asc')
      .select('sender', 'message', 'timestamp');

    callback(messages);
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});