import type { Knex } from 'knex';

// Items that have been replaced or are no longer stocked are marked discontinued instead of deleted
// (they keep their sales history), so they stop raising low-stock alerts and leave the selling lists.
export async function up(knex: Knex) {
  await knex.schema.alterTable('items', (tb) => { tb.boolean('active').notNullable().defaultTo(true); });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable('items', (tb) => { tb.dropColumn('active'); });
}
