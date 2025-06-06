exports.up = function(knex) {
  return knex.schema.createTable('messages', function(table) {
    table.increments('id').primary();
    table.string('room').nullable();
    table.string('sender');
    table.string('recipient').nullable(); // null for group messages
    table.text('message');
    table.timestamp('timestamp').defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('messages');
};
