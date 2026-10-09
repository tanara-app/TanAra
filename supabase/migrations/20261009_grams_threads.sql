-- Household units get a weight, so food can be logged in grams too; chat gets conversations.

-- grams in one household unit of this food (null = not known yet). kcal/protein stay per unit.
alter table public.foods add column grams numeric check (grams is null or grams > 0);

-- which conversation a chat message belongs to (null = the single thread from before threads)
alter table public.chat add column thread uuid;
create index chat_user_thread on public.chat (user_id, thread, created_at);
