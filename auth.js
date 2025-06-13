const bcrypt = require('bcrypt');
const SALT_ROUNDS = 10;
const knexConfig = require('./knexfile');
const lab_DB = require('knex')(knexConfig.lab_DB);
const chat_DB = require('knex')(knexConfig.chat_DB);

async function registerUser(username, password) {
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  const inserted = await chat_DB('users').insert({
    username,
    password: hashedPassword,
  });

  const id = Array.isArray(inserted) ? inserted[0] : inserted;

  return id;
}

async function loginUser(username, inputPassword) {
  const user = await chat_DB('users').where({ username }).first();

  if (!user) {
    throw new Error('User not found');
  }

  const isMatch = await bcrypt.compare(inputPassword, user.password);

  if (!isMatch) {
    throw new Error('Incorrect password');
  }

  return user;
}

function requireLabUser(req, res, next) {
  // Make sure the user is logged in and username is available
  if (!req.session.user || !req.session.user.username) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  lab_DB('users')
    .where({ username: req.session.user.username })
    .first()
    .then(user => {
      if (!user) {
        return res.status(403).json({ error: 'Forbidden: Not a lab user' });
      }
      next();
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    });
}

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

async function requireAdmin(req, res, next) {
  const { username } = req.user || { username: req.username };
  try {
    const admin = await chat_DB('users')
      .where({ username })
      .select('is_admin')
      .first();
    if (!admin) {
      return res.status(404).send('User not found');
    }
    if (!admin.is_admin) {
      return res.status(403).send('Admin access required');
    }
    next();
  } catch (err) {
    res.status(500).send('Server error');
  }
}

async function isLabUser(username) {
  const user = await lab_DB('users').where({ username }).first();
  return !!user;
}



module.exports = {
  registerUser,
  loginUser,
  requireLogin,
  requireAdmin,
  requireLabUser,
  isLabUser
};
