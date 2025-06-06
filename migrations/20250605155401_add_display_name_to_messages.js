exports.up = function(knex) {
  return knex.schema.table('messages', function(table) {
    table.string('display_name').nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('messages');
};