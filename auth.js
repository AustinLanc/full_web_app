const bcrypt = require('bcrypt');
const SALT_ROUNDS = 10;
const knexConfig = require('./knexfile');
const lab_DB = require('knex')(knexConfig.lab_DB);
const chat_DB = require('knex')(knexConfig.chat_DB);
const user_DB = require('knex')(knexConfig.user_DB);

async function registerUser(username, password, isLabMember = false) {
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  const inserted = await user_DB('users').insert({
    username,
    password: hashedPassword,
    is_lab: isLabMember,
    active: true
  });

  const id = Array.isArray(inserted) ? inserted[0] : inserted;

  return id;
}

async function loginUser(username, inputPassword) {
  try {
    const user = await user_DB('users').where({ username }).first();

    if (!user || user.active === false) {
      return null;
    }

    const isMatch = await bcrypt.compare(inputPassword, user.password);

    if (!isMatch) {
      return null;
    }

    return user;
  } catch (err) {
    console.error('loginUser error:', err);
    return null;
  }
}

function requireLabUser(req, res, next) {
  if (!req.session.user || !req.session.user.username) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  user_DB('users')
    .where({ id: req.session.user.id })
    .first()
    .then(user => {
      if (!user.is_lab) {
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
    res.redirect('/login');
  }
  next();
}

async function requireAdmin(req, res, next) {
  try {
    const id = req.session?.user?.id;

    if (!id) {
      return res.status(401).send('Unauthorized');
    }

    const admin = await user_DB('users')
      .where({ id })
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
    console.error('requireAdmin error:', err);
    res.status(500).send('Server error');
  }
}

async function updatePassword(id, oldPassword, newPassword) {
  const user = await user_DB('users').where({ id }).first();

  if (!user) {
    throw new Error('User not found');
  }

  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) {
    throw new Error('Incorrect password');
  }

  const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await user_DB('users')
    .where({ id: user.id })
    .update({ password: hashedPassword });

  return id;
}

async function adminResetUserPassword(username, newPassword) {
  const user = await user_DB('users').where({ username }).first();

  if (!user) {
    throw new Error('User not found');
  }

  const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await user_DB('users')
    .where({ id: user.id })
    .update({ password: hashedPassword });

  return user.username;
}

async function deleteUser(userId) {
  const deletedCount = await user_DB('users').where({ id: userId }).del();
  if (deletedCount === 0) {
    throw new Error('User not found');
  }
  return deletedCount;
}

async function toggleUser(userId) {
  const user = await user_DB('users').where({ id: userId }).first();

  if (!user) {
    throw new Error('User not found');
  }

  const newStatus = user.active === 1 ? 0 : 1;

  await user_DB('users')
    .where({ id: userId })
    .update({ active: newStatus });

  return newStatus;
}

module.exports = {
  registerUser,
  loginUser,
  requireLogin,
  requireAdmin,
  requireLabUser,
  updatePassword,
  adminResetUserPassword,
  deleteUser,
  toggleUser
};
