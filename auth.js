// This file is used to store all the functions involving user accounts, such as login, registration, updating, etc.
const bcrypt = require('bcrypt');
const SALT_ROUNDS = 10;
const knexConfig = require('./knexfile');
// Three different database connections. If database structure is different, these will have to be updated appropriately. See knexfile.js to see their configs
const lab_DB = require('knex')(knexConfig.lab_DB);
const chat_DB = require('knex')(knexConfig.chat_DB);
const user_DB = require('knex')(knexConfig.user_DB);

// Function to register a new user. Will take the Admin request and store the information in the user table with a hashed password incase of database leaks. New users are not lab members unless specified by the Admin
async function registerUser(username, password, isLabMember = false) {
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  // Tries to insert the new user record
  const inserted = await user_DB('users').insert({
    username,
    password: hashedPassword,
    is_lab: isLabMember,
    active: true // New users are active by default
  });

  const id = Array.isArray(inserted) ? inserted[0] : inserted;

  return id;
}

// Function to log the user in. Probably the most called function in this file since every route redirects to the login page if the user is not already logged in
async function loginUser(username, inputPassword) {
  try {
    const user = await user_DB('users').where({ username }).first();

    // If the user does not exist or if they have been set to inactive, will not let the user proceed
    if (!user || user.active === false) {
      return null;
    }

    // Checks the provided password with the stored hashed password
    const isMatch = await bcrypt.compare(inputPassword, user.password);

    // Again, stops if the password is not a match
    if (!isMatch) {
      return null;
    }

    return user; // User credentials exist and match
  } catch (err) {
    console.error('loginUser error:', err);
    return null;
  }
}

// The purpose of this function is to make sure non-lab members are unable to access lab specific pages. This is mainly done as a preventative measure to ensure data integrity
function requireLabUser(req, res, next) {
  if (!req.session.user || !req.session.user.username) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  user_DB('users')
    .where({ id: req.session.user.id })
    .first()
    .then(user => {
      if (!user.is_lab) {
        return res.status(403).json({ error: 'Forbidden: Not a lab user' });  // Sends out error if a non-lab user attempts to access lab specific page
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
