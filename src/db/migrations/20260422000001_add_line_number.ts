import type { Knex } from 'knex';

/**
 * Adds a line_number column to transaction_lines so lines can be
 * returned in their original posting order.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('transaction_lines', (table) => {
    table.integer('line_number').notNullable().defaultTo(0);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('transaction_lines', (table) => {
    table.dropColumn('line_number');
  });
}
