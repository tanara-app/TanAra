-- A food can have a second household unit besides its own (نان سنگک: کف‌دست and نان کامل),
-- with the weight of one in grams. Amounts in it go through grams, so it needs the food's weight too.

alter table public.foods add column unit2 text check (unit2 is null or length(unit2) between 1 and 40);
alter table public.foods add column grams2 numeric check (grams2 is null or grams2 > 0);
