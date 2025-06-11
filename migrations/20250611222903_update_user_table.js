exports.up = function(knex) {
  return knex.schema.table('messages', function(table) {
    table.string('display_name').nullable();
    // You might want to make it not nullable if you always provide a value
    // table.string('display_name').notNullable();
  });
};

exports.down = function(knex) {
  return knex.schema.table('messages', function(table) {
    table.dropColumn('display_name');
  });
};
