-- Refuse invalid/duplicate live ISBNs before changing any stored book metadata.
BEGIN;
CREATE FUNCTION public.canonical_book_isbn(value TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE v TEXT := upper(regexp_replace(value, '[[:space:]-]', '', 'g')); total INTEGER := 0; i INTEGER;
BEGIN
 IF v ~ '^[0-9]{9}[0-9X]$' THEN
  FOR i IN 1..10 LOOP total := total + (CASE WHEN substr(v,i,1)='X' THEN 10 ELSE substr(v,i,1)::int END)*(11-i); END LOOP;
  IF total % 11 <> 0 THEN RETURN NULL; END IF;
  v := '978' || substr(v,1,9); total := 0;
  FOR i IN 1..12 LOOP total := total + substr(v,i,1)::int*(CASE WHEN i%2=1 THEN 1 ELSE 3 END); END LOOP;
  RETURN v || ((10-total%10)%10)::text;
 ELSIF v ~ '^(978|979)[0-9]{10}$' THEN
  FOR i IN 1..13 LOOP total := total + substr(v,i,1)::int*(CASE WHEN i%2=1 THEN 1 ELSE 3 END); END LOOP;
  IF total%10=0 THEN RETURN v; END IF;
 END IF;
 RETURN NULL;
END $$;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM book_titles WHERE deleted_at IS NULL AND isbn IS NOT NULL AND public.canonical_book_isbn(isbn) IS NULL) THEN
  RAISE EXCEPTION 'Invalid active ISBNs: review data before migration';
 END IF;
 IF EXISTS (SELECT 1 FROM book_titles WHERE deleted_at IS NULL AND isbn IS NOT NULL GROUP BY public.canonical_book_isbn(isbn) HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Duplicate active canonical ISBNs: review data before migration';
 END IF;
END $$;
UPDATE book_titles SET isbn=public.canonical_book_isbn(isbn) WHERE deleted_at IS NULL AND isbn IS NOT NULL;
CREATE UNIQUE INDEX book_titles_active_isbn_key ON book_titles(isbn) WHERE deleted_at IS NULL AND isbn IS NOT NULL;
ALTER TABLE book_titles ADD CONSTRAINT book_titles_isbn_canonical_check CHECK (deleted_at IS NOT NULL OR isbn IS NULL OR (public.canonical_book_isbn(isbn) IS NOT NULL AND isbn=public.canonical_book_isbn(isbn)));

CREATE TABLE book_purchase_orders (
 id SERIAL PRIMARY KEY,
 order_code VARCHAR(40) NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
 title_id INTEGER NOT NULL REFERENCES book_titles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 100),
 status VARCHAR(20) NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','ordered','completed','rejected')),
 decision_reason TEXT,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 deleted_at TIMESTAMPTZ(3)
);
CREATE INDEX book_purchase_orders_branch_id_title_id_status_idx ON book_purchase_orders(branch_id,title_id,status);
CREATE TABLE book_purchase_requests (
 id SERIAL PRIMARY KEY,
 request_code VARCHAR(40) NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
 title_id INTEGER NOT NULL REFERENCES book_titles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 order_id INTEGER REFERENCES book_purchase_orders(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 kind VARCHAR(20) NOT NULL CHECK (kind IN ('new','additional')),
 quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 100),
 reason TEXT,
 status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','ordered','completed','rejected','cancelled')),
 decision_reason TEXT,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 deleted_at TIMESTAMPTZ(3),
 CONSTRAINT book_purchase_requests_additional_reason CHECK (kind <> 'additional' OR length(trim(reason))>0 AND reason IS NOT NULL),
 CONSTRAINT book_purchase_requests_order_check CHECK (status NOT IN ('approved','ordered','completed') OR order_id IS NOT NULL)
);
CREATE INDEX book_purchase_requests_branch_id_title_id_status_idx ON book_purchase_requests(branch_id,title_id,status);
CREATE UNIQUE INDEX book_purchase_requests_active_person_title ON book_purchase_requests(title_id,branch_id,employee_id) WHERE deleted_at IS NULL AND status IN ('pending','approved','ordered');
ALTER TABLE book_copies ADD COLUMN purchase_order_id INTEGER REFERENCES book_purchase_orders(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TRIGGER book_purchase_requests_set_updated_at BEFORE UPDATE ON book_purchase_requests FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER book_purchase_orders_set_updated_at BEFORE UPDATE ON book_purchase_orders FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

INSERT INTO permissions(name) SELECT 'Operation: ' || code FROM unnest(ARRAY['books.purchases.read','books.purchases.create','books.purchases.cancel','books.purchases.manage']) code WHERE EXISTS(SELECT 1 FROM roles) ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT substring(name FROM 12),id FROM permissions WHERE name LIKE 'Operation: books.purchases.%' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
-- Grant the new operations to roles currently permitted to read books. Responsibility is additionally checked against branches on every management request.
INSERT INTO role_permissions(role_id,permission_id,scope_type)
SELECT DISTINCT rp.role_id, po.permission_id, 'global'
FROM role_permissions rp JOIN permission_operations read_op ON read_op.permission_id=rp.permission_id AND read_op.operation='books.read' AND read_op.deleted_at IS NULL
JOIN roles r ON r.id=rp.role_id AND r.deleted_at IS NULL
CROSS JOIN permission_operations po
WHERE rp.deleted_at IS NULL AND rp.scope_type='global' AND po.deleted_at IS NULL AND (po.operation LIKE 'books.purchases.%' OR po.operation='books.titles.create')
ON CONFLICT(role_id,permission_id) DO NOTHING;
COMMIT;
