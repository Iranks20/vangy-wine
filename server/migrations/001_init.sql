-- Vangy Wine Company Limited — initial schema
-- Conventions:
--   * Money is stored as INTEGER Uganda Shillings (UGX has no minor unit in practice).
--   * Quantities are REAL so bulk wine (litres) and raw materials (kg) are supported.
--   * Timestamps are ISO-8601 UTC strings; the UI shows them in local time.
--   * Financial records are never deleted: they are cancelled / voided / reversed.
-- The SQL is kept to portable types so it can be moved to PostgreSQL later.

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE counters (
  name  TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','sales','storekeeper','production','finance')),
  phone         TEXT,
  position      TEXT,
  password_hash TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE TABLE sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE audit_log (
  id        INTEGER PRIMARY KEY,
  at        TEXT NOT NULL,
  user_id   INTEGER REFERENCES users(id),
  action    TEXT NOT NULL,
  entity    TEXT,
  entity_id INTEGER,
  details   TEXT,
  reason    TEXT
);
CREATE INDEX idx_audit_at ON audit_log(at);

CREATE TABLE suppliers (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  contact_person TEXT,
  phone          TEXT,
  email          TEXT,
  address        TEXT,
  supplies       TEXT,
  notes          TEXT,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL
);

CREATE TABLE customers (
  id                 INTEGER PRIMARY KEY,
  name               TEXT NOT NULL,
  phone              TEXT,
  email              TEXT,
  type               TEXT NOT NULL DEFAULT 'retail'
                     CHECK (type IN ('retail','wholesaler','bar','restaurant','hotel','event_planner','other')),
  location           TEXT,
  payment_terms_days INTEGER NOT NULL DEFAULT 0,
  referred_by        TEXT,
  follow_up_date     TEXT,
  follow_up_note     TEXT,
  notes              TEXT,
  active             INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL
);

CREATE TABLE items (
  id               INTEGER PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name             TEXT NOT NULL,
  category         TEXT NOT NULL CHECK (category IN ('finished','raw','packaging','other')),
  unit             TEXT NOT NULL,
  volume_l         REAL,                       -- litres of wine per unit (finished goods only)
  sell_price       INTEGER NOT NULL DEFAULT 0, -- default (retail) selling price
  avg_cost         REAL NOT NULL DEFAULT 0,    -- weighted-average unit cost
  qty              REAL NOT NULL DEFAULT 0,    -- current balance (kept in step with stock_movements)
  min_level        REAL NOT NULL DEFAULT 0,
  shelf_life_days  INTEGER,
  location         TEXT,
  supplier_id      INTEGER REFERENCES suppliers(id),
  active           INTEGER NOT NULL DEFAULT 1,
  notes            TEXT,
  created_at       TEXT NOT NULL
);

-- Price per customer category (falls back to items.sell_price)
CREATE TABLE item_prices (
  item_id       INTEGER NOT NULL REFERENCES items(id),
  customer_type TEXT NOT NULL,
  price         INTEGER NOT NULL CHECK (price >= 0),
  PRIMARY KEY (item_id, customer_type)
);

-- Batches / lots of stock (for traceability and expiry)
CREATE TABLE lots (
  id          INTEGER PRIMARY KEY,
  item_id     INTEGER NOT NULL REFERENCES items(id),
  lot_no      TEXT,
  mfg_date    TEXT,
  expiry_date TEXT,
  qty_in      REAL NOT NULL,
  qty_left    REAL NOT NULL,
  unit_cost   REAL NOT NULL DEFAULT 0,
  source_type TEXT,
  source_id   INTEGER,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_lots_item ON lots(item_id);

-- The stock ledger: every change of stock has exactly one source here
CREATE TABLE stock_movements (
  id        INTEGER PRIMARY KEY,
  at        TEXT NOT NULL,
  item_id   INTEGER NOT NULL REFERENCES items(id),
  lot_id    INTEGER REFERENCES lots(id),
  type      TEXT NOT NULL CHECK (type IN ('opening','purchase','production_in','production_use',
                                          'sale','sale_return','adjustment_in','adjustment_out',
                                          'damage','expired')),
  qty       REAL NOT NULL,     -- signed: + in, - out
  unit_cost REAL NOT NULL DEFAULT 0,
  ref_type  TEXT,
  ref_id    INTEGER,
  ref_no    TEXT,
  note      TEXT,
  user_id   INTEGER REFERENCES users(id)
);
CREATE INDEX idx_mov_item ON stock_movements(item_id, at);
CREATE INDEX idx_mov_ref ON stock_movements(ref_type, ref_id);

CREATE TABLE stock_adjustments (
  id           INTEGER PRIMARY KEY,
  adj_no       TEXT NOT NULL UNIQUE,
  item_id      INTEGER NOT NULL REFERENCES items(id),
  lot_id       INTEGER REFERENCES lots(id),
  kind         TEXT NOT NULL CHECK (kind IN ('increase','decrease','damage','expired','count')),
  qty          REAL NOT NULL CHECK (qty >= 0),  -- magnitude, or counted quantity for 'count'
  unit_cost    REAL,
  system_qty   REAL,                            -- balance when approved (counts)
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_by INTEGER REFERENCES users(id),
  requested_at TEXT NOT NULL,
  decided_by   INTEGER REFERENCES users(id),
  decided_at   TEXT,
  decision_note TEXT
);

CREATE TABLE sales (
  id               INTEGER PRIMARY KEY,
  invoice_no       TEXT NOT NULL UNIQUE,
  date             TEXT NOT NULL,
  customer_id      INTEGER REFERENCES customers(id),
  customer_name    TEXT NOT NULL,
  customer_phone   TEXT,
  customer_type    TEXT,
  salesperson_id   INTEGER REFERENCES users(id),
  subtotal         INTEGER NOT NULL,  -- after line discounts, before tax
  discount         INTEGER NOT NULL DEFAULT 0,
  tax_rate         REAL NOT NULL DEFAULT 0,
  tax              INTEGER NOT NULL DEFAULT 0,
  total            INTEGER NOT NULL,
  due_date         TEXT,
  delivery_details TEXT,
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','cancelled')),
  cancel_reason    TEXT,
  created_by       INTEGER REFERENCES users(id),
  created_at       TEXT NOT NULL,
  idem_key         TEXT UNIQUE
);
CREATE INDEX idx_sales_date ON sales(date);

CREATE TABLE sale_items (
  id           INTEGER PRIMARY KEY,
  sale_id      INTEGER NOT NULL REFERENCES sales(id),
  item_id      INTEGER NOT NULL REFERENCES items(id),
  description  TEXT NOT NULL,
  qty          REAL NOT NULL CHECK (qty > 0),
  unit_price   INTEGER NOT NULL CHECK (unit_price >= 0),
  discount     INTEGER NOT NULL DEFAULT 0 CHECK (discount >= 0),
  line_total   INTEGER NOT NULL,
  unit_cost    REAL NOT NULL DEFAULT 0,    -- weighted-average cost at time of sale
  returned_qty REAL NOT NULL DEFAULT 0
);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);

CREATE TABLE sale_returns (
  id         INTEGER PRIMARY KEY,
  return_no  TEXT NOT NULL UNIQUE,
  sale_id    INTEGER NOT NULL REFERENCES sales(id),
  date       TEXT NOT NULL,
  amount     INTEGER NOT NULL,   -- credit given against the invoice (incl. tax)
  restocked  INTEGER NOT NULL DEFAULT 1,
  reason     TEXT NOT NULL,
  user_id    INTEGER REFERENCES users(id)
);

CREATE TABLE sale_return_items (
  id           INTEGER PRIMARY KEY,
  return_id    INTEGER NOT NULL REFERENCES sale_returns(id),
  sale_item_id INTEGER NOT NULL REFERENCES sale_items(id),
  qty          REAL NOT NULL CHECK (qty > 0),
  amount       INTEGER NOT NULL
);

CREATE TABLE purchases (
  id                  INTEGER PRIMARY KEY,
  po_no               TEXT NOT NULL UNIQUE,
  supplier_id         INTEGER NOT NULL REFERENCES suppliers(id),
  supplier_invoice_no TEXT,
  date                TEXT NOT NULL,
  expected_date       TEXT,
  transport_cost      INTEGER NOT NULL DEFAULT 0 CHECK (transport_cost >= 0),
  other_cost          INTEGER NOT NULL DEFAULT 0 CHECK (other_cost >= 0),
  goods_total         INTEGER NOT NULL,
  total               INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'ordered'
                      CHECK (status IN ('ordered','partial','received','closed','cancelled')),
  notes               TEXT,
  created_by          INTEGER REFERENCES users(id),
  created_at          TEXT NOT NULL,
  idem_key            TEXT UNIQUE
);

CREATE TABLE purchase_items (
  id           INTEGER PRIMARY KEY,
  purchase_id  INTEGER NOT NULL REFERENCES purchases(id),
  item_id      INTEGER NOT NULL REFERENCES items(id),
  qty          REAL NOT NULL CHECK (qty > 0),
  unit_cost    INTEGER NOT NULL CHECK (unit_cost >= 0),
  qty_received REAL NOT NULL DEFAULT 0
);

CREATE TABLE purchase_receipts (
  id               INTEGER PRIMARY KEY,
  purchase_id      INTEGER NOT NULL REFERENCES purchases(id),
  purchase_item_id INTEGER NOT NULL REFERENCES purchase_items(id),
  date             TEXT NOT NULL,
  qty              REAL NOT NULL CHECK (qty > 0),
  landed_unit_cost REAL NOT NULL,
  lot_id           INTEGER REFERENCES lots(id),
  note             TEXT,
  user_id          INTEGER REFERENCES users(id)
);

CREATE TABLE expenses (
  id          INTEGER PRIMARY KEY,
  expense_no  TEXT NOT NULL UNIQUE,
  date        TEXT NOT NULL,
  category    TEXT NOT NULL,
  description TEXT NOT NULL,
  amount      INTEGER NOT NULL CHECK (amount > 0),
  method      TEXT NOT NULL CHECK (method IN ('cash','mobile_money','bank')),
  recipient   TEXT,
  reference   TEXT,
  attachment  TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','voided')),
  void_reason TEXT,
  user_id     INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL,
  idem_key    TEXT UNIQUE
);

-- The cashbook: every shilling in or out of cash / mobile money / bank
CREATE TABLE payments (
  id          INTEGER PRIMARY KEY,
  pay_no      TEXT NOT NULL UNIQUE,
  date        TEXT NOT NULL,
  direction   TEXT NOT NULL CHECK (direction IN ('in','out')),
  amount      INTEGER NOT NULL CHECK (amount > 0),
  method      TEXT NOT NULL CHECK (method IN ('cash','mobile_money','bank')),
  category    TEXT NOT NULL CHECK (category IN ('sale','refund','supplier','expense','opening',
                                                'other_in','other_out','transfer')),
  sale_id     INTEGER REFERENCES sales(id),
  purchase_id INTEGER REFERENCES purchases(id),
  expense_id  INTEGER REFERENCES expenses(id),
  party       TEXT,
  reference   TEXT,
  notes       TEXT,
  voided      INTEGER NOT NULL DEFAULT 0,
  void_reason TEXT,
  user_id     INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL,
  idem_key    TEXT UNIQUE
);
CREATE INDEX idx_pay_date ON payments(date);
CREATE INDEX idx_pay_sale ON payments(sale_id);
CREATE INDEX idx_pay_purchase ON payments(purchase_id);

CREATE TABLE reconciliations (
  id            INTEGER PRIMARY KEY,
  date          TEXT NOT NULL,
  method        TEXT NOT NULL CHECK (method IN ('cash','mobile_money','bank')),
  system_amount INTEGER NOT NULL,
  counted       INTEGER NOT NULL,
  difference    INTEGER NOT NULL,
  notes         TEXT,
  user_id       INTEGER REFERENCES users(id)
);

-- Production
CREATE TABLE recipes (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,
  product_item_id INTEGER REFERENCES items(id),
  base_litres     REAL NOT NULL CHECK (base_litres > 0),  -- quantities below are for this many litres
  notes           TEXT,
  active          INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE recipe_items (
  id        INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id),
  item_id   INTEGER NOT NULL REFERENCES items(id),
  qty       REAL NOT NULL CHECK (qty > 0)
);

CREATE TABLE batches (
  id               INTEGER PRIMARY KEY,
  batch_no         TEXT NOT NULL UNIQUE,
  recipe_id        INTEGER REFERENCES recipes(id),
  start_date       TEXT NOT NULL,
  responsible      TEXT,
  expected_litres  REAL NOT NULL DEFAULT 0,
  actual_litres    REAL,
  loss_litres      REAL NOT NULL DEFAULT 0,
  stage            TEXT NOT NULL DEFAULT 'preparation',
  bottling_date    TEXT,
  labour_cost      INTEGER NOT NULL DEFAULT 0,
  overhead_cost    INTEGER NOT NULL DEFAULT 0,
  qc_status        TEXT NOT NULL DEFAULT 'pending' CHECK (qc_status IN ('pending','passed','failed')),
  qc_notes         TEXT,
  qc_by            INTEGER REFERENCES users(id),
  qc_at            TEXT,
  status           TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','released','rejected')),
  released_by      INTEGER REFERENCES users(id),
  released_at      TEXT,
  expiry_date      TEXT,
  notes            TEXT,
  created_by       INTEGER REFERENCES users(id),
  created_at       TEXT NOT NULL
);

CREATE TABLE batch_materials (
  id        INTEGER PRIMARY KEY,
  batch_id  INTEGER NOT NULL REFERENCES batches(id),
  item_id   INTEGER NOT NULL REFERENCES items(id),
  qty       REAL NOT NULL CHECK (qty > 0),
  unit_cost REAL NOT NULL,
  date      TEXT NOT NULL,
  user_id   INTEGER REFERENCES users(id)
);

CREATE TABLE batch_stages (
  id       INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES batches(id),
  stage    TEXT NOT NULL,
  date     TEXT NOT NULL,
  readings TEXT,
  notes    TEXT,
  user_id  INTEGER REFERENCES users(id)
);

CREATE TABLE batch_outputs (
  id           INTEGER PRIMARY KEY,
  batch_id     INTEGER NOT NULL REFERENCES batches(id),
  item_id      INTEGER NOT NULL REFERENCES items(id),
  qty_good     REAL NOT NULL CHECK (qty_good >= 0),
  qty_rejected REAL NOT NULL DEFAULT 0 CHECK (qty_rejected >= 0),
  unit_cost    REAL,
  UNIQUE (batch_id, item_id)
);

-- Convenience views: balances are always derived, never typed in
CREATE VIEW v_sales AS
SELECT s.*,
  COALESCE((SELECT SUM(CASE p.direction WHEN 'in' THEN p.amount ELSE -p.amount END)
            FROM payments p WHERE p.sale_id = s.id AND p.voided = 0), 0) AS paid,
  COALESCE((SELECT SUM(r.amount) FROM sale_returns r WHERE r.sale_id = s.id), 0) AS returns_total
FROM sales s;

CREATE VIEW v_sales_bal AS
SELECT v.*,
  CASE WHEN v.status = 'cancelled' THEN 0 ELSE v.total - v.returns_total - v.paid END AS balance
FROM v_sales v;

CREATE VIEW v_purchases AS
SELECT p.*,
  COALESCE((SELECT ROUND(SUM(pi.qty_received * pi.unit_cost)) FROM purchase_items pi WHERE pi.purchase_id = p.id), 0)
    + CASE WHEN EXISTS (SELECT 1 FROM purchase_receipts r WHERE r.purchase_id = p.id)
           THEN p.transport_cost + p.other_cost ELSE 0 END AS billed,
  COALESCE((SELECT SUM(CASE x.direction WHEN 'out' THEN x.amount ELSE -x.amount END)
            FROM payments x WHERE x.purchase_id = p.id AND x.voided = 0), 0) AS paid
FROM purchases p;
