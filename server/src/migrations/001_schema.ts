import type { Knex } from 'knex';
import { DEFAULT_SETTINGS } from '../defaults';

// Conventions: money = BIGINT whole shillings; quantities = DECIMAL(14,3); unit costs = DECIMAL(16,4);
// timestamps = DATETIME(3) in UTC. Financial records are never deleted — they are cancelled or voided.
const METHODS = ['cash', 'mobile_money', 'bank'];

export async function up(knex: Knex) {
  await knex.schema.createTable('users', (t) => {
    t.increments('id');
    t.string('username', 60).notNullable().unique();
    t.string('name', 120).notNullable();
    t.string('password_hash', 100).notNullable();
    t.dateTime('created_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
    t.dateTime('last_login_at', { precision: 3 });
  });

  await knex.schema.createTable('settings', (t) => {
    t.tinyint('id').primary();
    t.json('data').notNullable();
    t.dateTime('last_backup_at', { precision: 3 });
  });

  await knex.schema.createTable('audit_log', (t) => {
    t.bigIncrements('id');
    t.dateTime('at', { precision: 3 }).notNullable().index();
    t.string('user_name', 120).notNullable();
    t.string('action', 80).notNullable();
    t.text('details');
  });

  await knex.schema.createTable('counters', (t) => {
    t.string('name', 30).primary();
    t.integer('value').unsigned().notNullable();
  });

  await knex.schema.createTable('suppliers', (t) => {
    t.increments('id');
    t.string('name', 150).notNullable();
    t.string('contact', 120).notNullable().defaultTo('');
    t.string('phone', 40).notNullable().defaultTo('');
    t.string('email', 150).notNullable().defaultTo('');
    t.string('supplies', 255).notNullable().defaultTo('');
    t.dateTime('created_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
  });

  await knex.schema.createTable('customers', (t) => {
    t.increments('id');
    t.string('name', 150).notNullable();
    t.string('phone', 40).notNullable().defaultTo('');
    t.enum('type', ['retail', 'wholesaler', 'bar', 'restaurant', 'hotel', 'event_planner', 'other']).notNullable().defaultTo('retail');
    t.string('location', 150).notNullable().defaultTo('');
    t.integer('terms').unsigned().notNullable().defaultTo(0);
    t.text('notes');
    t.date('follow_up');
    t.dateTime('created_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
  });

  await knex.schema.createTable('employees', (t) => {
    t.increments('id');
    t.string('name', 120).notNullable();
    t.string('phone', 40).notNullable().defaultTo('');
    t.string('position', 120).notNullable().defaultTo('');
    t.boolean('active').notNullable().defaultTo(true);
    t.dateTime('created_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
  });

  await knex.schema.createTable('items', (t) => {
    t.increments('id');
    t.string('code', 40).notNullable().unique();
    t.string('name', 150).notNullable();
    t.enum('category', ['finished', 'raw', 'packaging', 'other']).notNullable();
    t.string('unit', 30).notNullable();
    t.bigInteger('price').notNullable().defaultTo(0);
    t.decimal('cost', 16, 4).notNullable().defaultTo(0); // weighted-average unit cost
    t.decimal('qty', 14, 3).notNullable().defaultTo(0);  // kept in step with stock_movements
    t.decimal('min_level', 14, 3).notNullable().defaultTo(0);
    t.string('location', 120).notNullable().defaultTo('');
    t.dateTime('created_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
  });

  await knex.schema.createTable('lots', (t) => {
    t.increments('id');
    t.integer('item_id').unsigned().notNullable().references('items.id');
    t.string('lot_no', 40).notNullable();
    t.date('mfg');
    t.date('expiry');
    t.decimal('qty', 14, 3).notNullable();
    t.dateTime('created_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
    t.index(['item_id', 'expiry']);
  });

  await knex.schema.createTable('stock_movements', (t) => {
    t.bigIncrements('id');
    t.dateTime('at', { precision: 3 }).notNullable();
    t.integer('item_id').unsigned().notNullable().references('items.id');
    t.string('type', 60).notNullable();
    t.decimal('qty', 14, 3).notNullable(); // signed: + in, − out
    t.decimal('unit_cost', 16, 4).notNullable().defaultTo(0);
    t.string('ref', 40).notNullable();
    t.text('note');
    t.string('user_name', 120).notNullable();
    t.index(['item_id', 'at']);
    t.index(['at']);
  });

  await knex.schema.createTable('sales', (t) => {
    t.increments('id');
    t.string('invoice', 30).notNullable().unique();
    t.dateTime('date', { precision: 3 }).notNullable().index();
    t.integer('customer_id').unsigned().references('customers.id');
    t.string('customer_name', 150).notNullable();
    t.string('customer_phone', 40);
    t.string('salesperson', 120).notNullable();
    t.text('delivery');
    t.text('notes');
    t.enum('status', ['completed', 'cancelled']).notNullable().defaultTo('completed');
    t.date('due_date');
    t.dateTime('cancelled_at', { precision: 3 });
    t.string('idem_key', 64).unique();
    t.dateTime('created_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
  });

  await knex.schema.createTable('sale_lines', (t) => {
    t.increments('id');
    t.integer('sale_id').unsigned().notNullable().references('sales.id');
    t.integer('item_id').unsigned().notNullable().references('items.id');
    t.string('name', 150).notNullable();        // product name at time of sale
    t.decimal('qty', 14, 3).notNullable();
    t.bigInteger('price').notNullable();         // price at time of sale
    t.bigInteger('discount').notNullable().defaultTo(0);
    t.decimal('cost', 16, 4).notNullable();      // weighted-average cost at time of sale
  });

  await knex.schema.createTable('payments', (t) => {
    t.increments('id');
    t.string('receipt_no', 30).notNullable().unique();
    t.integer('sale_id').unsigned().notNullable().references('sales.id');
    t.dateTime('date', { precision: 3 }).notNullable().index();
    t.bigInteger('amount').notNullable();
    t.enum('method', METHODS).notNullable();
    t.string('ref', 80);
    t.string('idem_key', 64).unique();
  });

  await knex.schema.createTable('purchases', (t) => {
    t.increments('id');
    t.string('po', 30).notNullable().unique();
    t.integer('supplier_id').unsigned().notNullable().references('suppliers.id');
    t.string('supplier_invoice', 60);
    t.dateTime('date', { precision: 3 }).notNullable().index();
    t.bigInteger('transport').notNullable().defaultTo(0);
    t.enum('status', ['ordered', 'partial', 'received', 'cancelled']).notNullable().defaultTo('ordered');
    t.dateTime('created_at', { precision: 3 }).notNullable().defaultTo(knex.fn.now(3));
  });

  await knex.schema.createTable('purchase_lines', (t) => {
    t.increments('id');
    t.integer('purchase_id').unsigned().notNullable().references('purchases.id');
    t.integer('item_id').unsigned().notNullable().references('items.id');
    t.decimal('qty', 14, 3).notNullable();
    t.bigInteger('cost').notNullable();
    t.decimal('received', 14, 3).notNullable().defaultTo(0);
  });

  await knex.schema.createTable('purchase_payments', (t) => {
    t.increments('id');
    t.integer('purchase_id').unsigned().notNullable().references('purchases.id');
    t.dateTime('date', { precision: 3 }).notNullable();
    t.bigInteger('amount').notNullable();
    t.enum('method', METHODS).notNullable();
  });

  await knex.schema.createTable('recipes', (t) => {
    t.increments('id');
    t.string('name', 150).notNullable();
    t.decimal('base_litres', 10, 2).notNullable();
  });

  await knex.schema.createTable('recipe_lines', (t) => {
    t.increments('id');
    t.integer('recipe_id').unsigned().notNullable().references('recipes.id').onDelete('CASCADE');
    t.integer('item_id').unsigned().notNullable().references('items.id');
    t.decimal('qty', 14, 3).notNullable();
  });

  await knex.schema.createTable('batches', (t) => {
    t.increments('id');
    t.string('batch_no', 30).notNullable().unique();
    t.dateTime('start_date', { precision: 3 }).notNullable();
    t.string('responsible', 120).notNullable();
    t.decimal('expected_litres', 12, 2).notNullable();
    t.string('stage', 40).notNullable();
    t.decimal('loss_litres', 12, 2).notNullable().defaultTo(0);
    t.enum('qc', ['pending', 'passed', 'failed']).notNullable().defaultTo('pending');
    t.text('qc_notes');
    t.enum('status', ['in_progress', 'released', 'rejected']).notNullable().defaultTo('in_progress');
    t.date('bottling_date');
  });

  await knex.schema.createTable('batch_materials', (t) => {
    t.increments('id');
    t.integer('batch_id').unsigned().notNullable().references('batches.id');
    t.integer('item_id').unsigned().notNullable().references('items.id');
    t.decimal('qty', 14, 3).notNullable();
    t.decimal('cost', 16, 4).notNullable();
  });

  await knex.schema.createTable('batch_stages', (t) => {
    t.increments('id');
    t.integer('batch_id').unsigned().notNullable().references('batches.id');
    t.string('stage', 40).notNullable();
    t.dateTime('date', { precision: 3 }).notNullable();
    t.text('notes');
  });

  await knex.schema.createTable('batch_outputs', (t) => {
    t.increments('id');
    t.integer('batch_id').unsigned().notNullable().references('batches.id');
    t.integer('item_id').unsigned().notNullable().references('items.id');
    t.decimal('good', 14, 3).notNullable();
    t.decimal('rejected', 14, 3).notNullable().defaultTo(0);
    t.unique(['batch_id', 'item_id']);
  });

  await knex.schema.createTable('expenses', (t) => {
    t.increments('id');
    t.string('ref', 30).notNullable().unique();
    t.dateTime('date', { precision: 3 }).notNullable().index();
    t.string('category', 80).notNullable();
    t.string('description', 255).notNullable();
    t.bigInteger('amount').notNullable();
    t.enum('method', METHODS).notNullable();
    t.string('recipient', 150).notNullable().defaultTo('');
    t.string('reference', 80);
    t.enum('status', ['active', 'voided']).notNullable().defaultTo('active');
    t.text('void_reason');
  });

  await knex.schema.createTable('expense_attachments', (t) => {
    t.integer('expense_id').unsigned().primary().references('expenses.id');
    t.string('filename', 200).notNullable();
    t.string('mime', 100).notNullable();
    t.specificType('data', 'MEDIUMBLOB').notNullable();
  });

  await knex.schema.createTable('cash_entries', (t) => {
    t.increments('id');
    t.dateTime('date', { precision: 3 }).notNullable().index();
    t.enum('direction', ['in', 'out']).notNullable();
    t.bigInteger('amount').notNullable();
    t.enum('method', METHODS).notNullable();
    t.string('description', 255).notNullable();
    t.string('category', 60).notNullable();
  });

  await knex.schema.createTable('reconciliations', (t) => {
    t.increments('id');
    t.dateTime('date', { precision: 3 }).notNullable();
    t.enum('method', METHODS).notNullable();
    t.bigInteger('system_amount').notNullable();
    t.bigInteger('counted').notNullable();
    t.bigInteger('difference').notNullable();
    t.text('notes');
    t.string('user_name', 120).notNullable();
  });

  await knex('settings').insert({ id: 1, data: JSON.stringify(DEFAULT_SETTINGS) });
}

export async function down(knex: Knex) {
  for (const t of ['reconciliations', 'cash_entries', 'expense_attachments', 'expenses', 'batch_outputs', 'batch_stages',
    'batch_materials', 'batches', 'recipe_lines', 'recipes', 'purchase_payments', 'purchase_lines', 'purchases',
    'payments', 'sale_lines', 'sales', 'stock_movements', 'lots', 'items', 'employees', 'customers', 'suppliers',
    'counters', 'audit_log', 'settings', 'users']) {
    await knex.schema.dropTableIfExists(t);
  }
}
