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
  const user = await user_DB('users').where({ username }).first();

  if (!user || user.active === false) {
    throw new Error('User not found');
  }

  const isMatch = await bcrypt.compare(inputPassword, user.password);

  if (!isMatch) {
    throw new Error('Incorrect password');
  }

  return user;
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
    return res.status(401).json({ error: 'Not logged in' });
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
  const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

  if (!isMatch) {
    throw new Error('Incorrect password');
  }

  const updated = await chat_DB('users')
  .where({ id: user.id })
  .update({
    password: hashedPassword,
  });

  return id;
}


module.exports = {
  registerUser,
  loginUser,
  requireLogin,
  requireAdmin,
  requireLabUser,
  updatePassword
};
