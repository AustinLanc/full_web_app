module.exports = {
  development: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'Martin',
      password: process.env.DB_PASSWORD || 'Martin123',
      database: process.env.DB_NAME || 'message_history',
    },
    migrations: {
      directory: './migrations',
    },
  },
};
