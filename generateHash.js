const bcrypt = require('bcrypt');
const SALT_ROUNDS = 10;

async function hashPassword() {
  const hashedPassword = await bcrypt.hash('12345678', SALT_ROUNDS);
  console.log(hashedPassword);
}

hashPassword();
