const bcrypt = require('bcrypt');
const SALT_ROUNDS = 10;
const knex = require('./knex'); // assuming you export knex in a file like knex.js or similar

// Register a new user
async function registerUser(username, password) {
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  const [id] = await knex('users').insert({
    username,
    password: hashedPassword, // stored in 'password' column
  });

  return id;
}

// Login user
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

module.exports = {
  registerUser,
  loginUser,
};
