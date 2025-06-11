const knex = require('knex');
const knexConfig = require('./knexfile');

async function migrateDB(configName) {
  const db = knex(knexConfig[configName]);
  try {
    await db.migrate.latest();
    console.log(`${configName} migrations complete`);
  } catch (err) {
    console.error(`${configName} migration error:`, err);
  } finally {
    await db.destroy();
  }
}

//migrateDB('lab_DB');
migrateDB('chat_DB');
