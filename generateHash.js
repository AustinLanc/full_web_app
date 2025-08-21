// Used to manually generate password hashes so accounts can be manually created if needed
// Should not be used after the first Admin account is made
const bcrypt = require('bcrypt');
const SALT_ROUNDS = 10;

async function hashPassword() {
  const hashedPassword = await bcrypt.hash('12345678', SALT_ROUNDS); // Change 12345678 to the actual password to hash
  console.log(hashedPassword);
}

hashPassword();
