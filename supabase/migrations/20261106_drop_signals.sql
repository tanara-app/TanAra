-- The daily observations (20261106_signals.sql) are removed the same day: nobody was going to
-- read them, and data nobody reads shouldn't be kept.
drop table if exists public.signals;
