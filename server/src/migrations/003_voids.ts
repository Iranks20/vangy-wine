import type { Knex } from 'knex';

// Mistaken payments and cashbook entries are voided (kept, with a reason), never deleted.
export async function up(knex: Knex) {
  for (const t of ['payments', 'purchase_payments', 'cash_entries']) {
    await knex.schema.alterTable(t, (tb) => {
      tb.dateTime('voided_at', { precision: 3 });
      tb.string('void_reason', 500);
    });
  }
  // Links the two halves of a transfer so they are voided together.
  await knex.schema.alterTable('cash_entries', (tb) => { tb.string('group_ref', 40).index(); });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable('cash_entries', (tb) => { tb.dropColumn('group_ref'); });
  for (const t of ['payments', 'purchase_payments', 'cash_entries']) {
    await knex.schema.alterTable(t, (tb) => { tb.dropColumn('voided_at'); tb.dropColumn('void_reason'); });
  }
}
