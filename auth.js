const bcrypt = require('bcrypt');
const SALT_ROUNDS = 10;
const knex = require('knex')(require('./knexfile').development);

async function registerUser(username, password) {
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  const inserted = await knex('users').insert({
    username,
    password: hashedPassword,
  });

  const id = Array.isArray(inserted) ? inserted[0] : inserted;

  return id;
}

async function loginUser(username, inputPassword) {
  const user = await knex('users').where({ username }).first();

  if (!user) {
    throw new Error('User not found');
  }

  const isMatch = await bcrypt.compare(inputPassword, user.password);

  if (!isMatch) {
    throw new Error('Incorrect password');
  }

  return user;
}

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.session?.user?.id === 1) {
    return next();
  }
  res.status(403).json({ error: 'Admin access required' });
}

module.exports = {
  registerUser,
  loginUser,
  requireLogin,
  requireAdmin,
};
