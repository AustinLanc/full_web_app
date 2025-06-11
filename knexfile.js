require('dotenv').config();

module.exports = {
  lab_DB: {
    client: 'mysql2',
    connection: {
      host: process.env.LABDB_HOST,
      user: process.env.LABDB_USER,
      password: process.env.LABDB_PASSWORD,
      database: process.env.LABDB_DATABASE
    }
  },
  chat_DB: {
    client: 'mysql2',
    connection: {
      host: process.env.CHATDB_HOST,
      user: process.env.CHATDB_USER,
      password: process.env.CHATDB_PASSWORD,
      database: process.env.CHATDB_DATABASE
    }
  }
};
