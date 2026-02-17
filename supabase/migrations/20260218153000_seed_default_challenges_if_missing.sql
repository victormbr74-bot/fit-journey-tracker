BEGIN;

WITH default_challenges (
  name,
  description,
  challenge_type,
  points_awarded,
  points_deducted,
  icon,
  target_value,
  category
) AS (
  VALUES
    ('Treino Completo', 'Complete um treino hoje', 'daily', 15, 5, 'Trophy', 1, 'workout'),
    ('Hidratacao', 'Beba 2L de agua hoje', 'daily', 10, 3, 'Water', 8, 'health'),
    ('Corrida Matinal', 'Corra pelo menos 2km', 'daily', 20, 5, 'Run', 1, 'cardio'),
    ('Registrar Peso', 'Registre seu peso hoje', 'daily', 5, 0, 'Scale', 1, 'tracking'),
    ('Seguir Dieta', 'Siga o plano de dieta do dia', 'daily', 15, 5, 'Food', 1, 'diet'),
    ('Meta Semanal de Treinos', 'Complete todos os treinos da semana', 'weekly', 50, 20, 'Target', 5, 'workout'),
    ('Corrida Semanal 10km', 'Corra 10km durante a semana', 'weekly', 40, 10, 'Medal', 1, 'cardio'),
    ('Consistencia de Peso', 'Registre seu peso todos os dias da semana', 'weekly', 30, 10, 'Chart', 7, 'tracking')
)
INSERT INTO public.challenges (
  name,
  description,
  challenge_type,
  points_awarded,
  points_deducted,
  icon,
  target_value,
  category,
  is_active
)
SELECT
  dc.name,
  dc.description,
  dc.challenge_type,
  dc.points_awarded,
  dc.points_deducted,
  dc.icon,
  dc.target_value,
  dc.category,
  TRUE
FROM default_challenges dc
WHERE NOT EXISTS (
  SELECT 1
  FROM public.challenges c
  WHERE lower(c.name) = lower(dc.name)
    AND c.challenge_type = dc.challenge_type
);

UPDATE public.challenges
SET is_active = TRUE
WHERE is_active IS NULL;

COMMIT;
