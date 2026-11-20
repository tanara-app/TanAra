-- «سهم وعده», phase 1 (SAHM.md): a food logged from the meal sheet keeps what the app suggested beside
-- what was logged, so we can measure how often the suggestion is taken as it is. Null for everything
-- logged any other way. Shape (portion.js fitMark): { v, sug, sugKcal, qty, hand, budget,
-- proteinMin?, proteinMax?, carbMax? }; sug and qty are in the entry's unit at the time it was logged.
alter table public.entries add column if not exists fit jsonb;
