-- A packaged food can carry the barcode it was scanned from, so scanning it again opens it straight from the bank.

-- the digits under the barcode (EAN-13, EAN-8, UPC-A); null = not a scanned product
alter table public.foods add column barcode text check (barcode is null or barcode ~ '^[0-9]{8,14}$');
