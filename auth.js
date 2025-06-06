const bcrypt = require('bcrypt');
const SALT_ROUNDS = 10;

// Register a new user
async function registerUser(username, password) {
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  const [user] = await knex('users').insert({
    username,
    password: hashedPassword,
  });

  return user;
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

  return user; // or token/session info
}

module.exports = {
  registerUser,
  loginUser,
};