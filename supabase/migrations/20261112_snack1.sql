-- The two snacks of the rebuilt «امروز» each get their own name: 'snack1' (میان‌وعده‌ی صبح, between breakfast
-- and lunch) and 'snack2' (میان‌وعده‌ی عصر, between lunch and dinner). 'snack' stays for the four-meal views
-- and for older entries, which the five-meal view places by the hour they were logged (js/domain/meals.js).
alter table public.entries drop constraint if exists entries_meal_check;
alter table public.entries add constraint entries_meal_check
  check (meal = any (array['breakfast', 'lunch', 'dinner', 'snack', 'snack1', 'snack2']));
