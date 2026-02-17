BEGIN;

UPDATE public.challenges
SET icon = lower(icon)
WHERE icon IN ('Trophy', 'Water', 'Run', 'Scale', 'Food', 'Target', 'Medal', 'Chart');

UPDATE public.challenges
SET icon = 'chart'
WHERE lower(name) = lower('Consistencia de Peso')
  AND challenge_type = 'weekly'
  AND (icon IS NULL OR trim(icon) = '');

UPDATE public.challenges
SET icon = 'run'
WHERE lower(name) = lower('Corrida Semanal 10km')
  AND challenge_type = 'weekly'
  AND (icon IS NULL OR trim(icon) = '');

UPDATE public.challenges
SET icon = 'target'
WHERE lower(name) = lower('Meta Semanal de Treinos')
  AND challenge_type = 'weekly'
  AND (icon IS NULL OR trim(icon) = '');

COMMIT;
