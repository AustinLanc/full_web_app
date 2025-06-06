module.exports = {
  development: {
    client: 'mysql2',
    connection: {
      host: 'localhost',
      user: 'Martin',
      password: 'Martin123',
      database: 'message_history'
    },
    migrations: {
      directory: './migrations'
    }
  }
};
