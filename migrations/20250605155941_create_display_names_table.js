exports.up = function(knex) {
  return knex.schema.createTable('display_names', function(table) {
    table.increments('id').primary();
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.string('name').notNullable();
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('display_names');
};
