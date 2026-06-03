-- Add medicines snapshot to invoices.
-- This is an immutable per-bill snapshot — independent of any future
-- store_inventory / medicines_master table. Each entry MAY contain a
-- soft pointer "medicineId" for forward-compatibility, but it is not
-- enforced as a foreign key on purpose so historical bills remain stable
-- even if inventory rows are renamed, repriced, or deleted later.
--
-- Shape per entry (validated by API layer, not DB):
--   {
--     "medicineId":         "uuid|null",
--     "name":               "Crocin 500mg",
--     "manufacturer":       "GSK|null",
--     "packSize":           "10 tablets|null",
--     "mrp":                35.0 | null,
--     "quantity":           2,
--     "unitPrice":          32.0,
--     "lineTotal":          64.0,
--     "isPriceOverridden":  true|false,
--     "source":             "local|remote|manual|null"
--   }

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS medicines JSONB NOT NULL DEFAULT '[]'::jsonb;

-- GIN index helps future analytics like:
--   SELECT m->>'name', SUM((m->>'lineTotal')::numeric)
--   FROM invoices, jsonb_array_elements(medicines) m
--   GROUP BY 1;
CREATE INDEX IF NOT EXISTS idx_invoices_medicines_gin
  ON invoices USING gin (medicines jsonb_path_ops);
