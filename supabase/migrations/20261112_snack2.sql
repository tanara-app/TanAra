-- The rebuilt «امروز» (REDESIGN.md) has two snacks: 'snack' (میان‌وعده‌ی صبح, between breakfast and lunch)
-- and 'snack2' (میان‌وعده‌ی عصر, between lunch and dinner). Older snacks stay 'snack'; the app places
-- those by the hour they were logged. The same day 'snack1' was added too (20261112_snack1.sql).
alter table public.entries drop constraint if exists entries_meal_check;
alter table public.entries add constraint entries_meal_check
  check (meal = any (array['breakfast', 'lunch', 'dinner', 'snack', 'snack2']));
