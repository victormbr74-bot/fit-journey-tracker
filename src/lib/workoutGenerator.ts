import { WorkoutPlan, WorkoutDay, Exercise } from '@/types/workout';
import { UserProfile } from '@/types/user';

const exerciseDatabase: Record<string, Exercise[]> = {
  chest: [
    { id: '1', name: 'Supino Reto', sets: 4, reps: '8-12', restSeconds: 90, muscleGroup: 'Peito', icon: '🏋️' },
    { id: '2', name: 'Supino Inclinado', sets: 3, reps: '10-12', restSeconds: 60, muscleGroup: 'Peito', icon: '🏋️' },
    { id: '3', name: 'Crucifixo', sets: 3, reps: '12-15', restSeconds: 60, muscleGroup: 'Peito', icon: '💪' },
    { id: '4', name: 'Flexão de Braço', sets: 3, reps: '15-20', restSeconds: 45, muscleGroup: 'Peito', icon: '🤸' },
  ],
  back: [
    { id: '5', name: 'Puxada Frontal', sets: 4, reps: '8-12', restSeconds: 90, muscleGroup: 'Costas', icon: '💪' },
    { id: '6', name: 'Remada Curvada', sets: 4, reps: '8-12', restSeconds: 90, muscleGroup: 'Costas', icon: '🏋️' },
    { id: '7', name: 'Remada Unilateral', sets: 3, reps: '10-12', restSeconds: 60, muscleGroup: 'Costas', icon: '💪' },
    { id: '8', name: 'Pulldown', sets: 3, reps: '12-15', restSeconds: 60, muscleGroup: 'Costas', icon: '💪' },
  ],
  legs: [
    { id: '9', name: 'Agachamento', sets: 4, reps: '8-12', restSeconds: 120, muscleGroup: 'Pernas', icon: '🦵' },
    { id: '10', name: 'Leg Press', sets: 4, reps: '10-12', restSeconds: 90, muscleGroup: 'Pernas', icon: '🦵' },
    { id: '11', name: 'Extensora', sets: 3, reps: '12-15', restSeconds: 60, muscleGroup: 'Pernas', icon: '🦵' },
    { id: '12', name: 'Flexora', sets: 3, reps: '12-15', restSeconds: 60, muscleGroup: 'Pernas', icon: '🦵' },
    { id: '13', name: 'Panturrilha', sets: 4, reps: '15-20', restSeconds: 45, muscleGroup: 'Pernas', icon: '🦵' },
  ],
  shoulders: [
    { id: '14', name: 'Desenvolvimento', sets: 4, reps: '8-12', restSeconds: 90, muscleGroup: 'Ombros', icon: '💪' },
    { id: '15', name: 'Elevação Lateral', sets: 3, reps: '12-15', restSeconds: 60, muscleGroup: 'Ombros', icon: '💪' },
    { id: '16', name: 'Elevação Frontal', sets: 3, reps: '12-15', restSeconds: 60, muscleGroup: 'Ombros', icon: '💪' },
  ],
  arms: [
    { id: '17', name: 'Rosca Direta', sets: 3, reps: '10-12', restSeconds: 60, muscleGroup: 'Bíceps', icon: '💪' },
    { id: '18', name: 'Rosca Martelo', sets: 3, reps: '10-12', restSeconds: 60, muscleGroup: 'Bíceps', icon: '💪' },
    { id: '19', name: 'Tríceps Pulley', sets: 3, reps: '10-12', restSeconds: 60, muscleGroup: 'Tríceps', icon: '💪' },
    { id: '20', name: 'Tríceps Francês', sets: 3, reps: '10-12', restSeconds: 60, muscleGroup: 'Tríceps', icon: '💪' },
  ],
  core: [
    { id: '21', name: 'Abdominal Crunch', sets: 3, reps: '15-20', restSeconds: 45, muscleGroup: 'Abdômen', icon: '🏋️' },
    { id: '22', name: 'Prancha', sets: 3, reps: '30-60s', restSeconds: 45, muscleGroup: 'Abdômen', icon: '🏋️' },
    { id: '23', name: 'Elevação de Pernas', sets: 3, reps: '12-15', restSeconds: 45, muscleGroup: 'Abdômen', icon: '🏋️' },
  ],
  cardio: [
    { id: '24', name: 'Esteira', sets: 1, reps: '20-30min', restSeconds: 0, muscleGroup: 'Cardio', icon: '🏃' },
    { id: '25', name: 'Bicicleta', sets: 1, reps: '20-30min', restSeconds: 0, muscleGroup: 'Cardio', icon: '🚴' },
    { id: '26', name: 'HIIT', sets: 1, reps: '15-20min', restSeconds: 0, muscleGroup: 'Cardio', icon: '⚡' },
  ],
};

function generateLoseWeightPlan(): WorkoutDay[] {
  return [
    {
      id: '1',
      dayName: 'Segunda-feira',
      focus: 'Corpo Inteiro + Cardio',
      exercises: [
        ...exerciseDatabase.chest.slice(0, 2),
        ...exerciseDatabase.back.slice(0, 2),
        ...exerciseDatabase.legs.slice(0, 2),
        ...exerciseDatabase.cardio.slice(2, 3),
      ],
      estimatedMinutes: 60,
    },
    {
      id: '2',
      dayName: 'Terça-feira',
      focus: 'Cardio + Core',
      exercises: [
        ...exerciseDatabase.cardio.slice(0, 1),
        ...exerciseDatabase.core,
      ],
      estimatedMinutes: 45,
    },
    {
      id: '3',
      dayName: 'Quarta-feira',
      focus: 'Descanso Ativo',
      exercises: [
        { id: 'rest1', name: 'Caminhada Leve', sets: 1, reps: '30min', restSeconds: 0, muscleGroup: 'Cardio', icon: '🚶' },
        { id: 'rest2', name: 'Alongamento', sets: 1, reps: '15min', restSeconds: 0, muscleGroup: 'Flexibilidade', icon: '🧘' },
      ],
      estimatedMinutes: 45,
    },
    {
      id: '4',
      dayName: 'Quinta-feira',
      focus: 'Corpo Inteiro + Cardio',
      exercises: [
        ...exerciseDatabase.shoulders.slice(0, 2),
        ...exerciseDatabase.arms.slice(0, 2),
        ...exerciseDatabase.legs.slice(2, 4),
        ...exerciseDatabase.cardio.slice(1, 2),
      ],
      estimatedMinutes: 60,
    },
    {
      id: '5',
      dayName: 'Sexta-feira',
      focus: 'HIIT + Core',
      exercises: [
        ...exerciseDatabase.cardio.slice(2, 3),
        ...exerciseDatabase.core,
      ],
      estimatedMinutes: 40,
    },
  ];
}

function generateGainMusclePlan(): WorkoutDay[] {
  return [
    {
      id: '1',
      dayName: 'Segunda-feira',
      focus: 'Peito + Tríceps',
      exercises: [
        ...exerciseDatabase.chest,
        ...exerciseDatabase.arms.slice(2, 4),
      ],
      estimatedMinutes: 60,
    },
    {
      id: '2',
      dayName: 'Terça-feira',
      focus: 'Costas + Bíceps',
      exercises: [
        ...exerciseDatabase.back,
        ...exerciseDatabase.arms.slice(0, 2),
      ],
      estimatedMinutes: 60,
    },
    {
      id: '3',
      dayName: 'Quarta-feira',
      focus: 'Pernas',
      exercises: exerciseDatabase.legs,
      estimatedMinutes: 70,
    },
    {
      id: '4',
      dayName: 'Quinta-feira',
      focus: 'Ombros + Core',
      exercises: [
        ...exerciseDatabase.shoulders,
        ...exerciseDatabase.core,
      ],
      estimatedMinutes: 50,
    },
    {
      id: '5',
      dayName: 'Sexta-feira',
      focus: 'Full Body',
      exercises: [
        exerciseDatabase.chest[0],
        exerciseDatabase.back[0],
        exerciseDatabase.legs[0],
        exerciseDatabase.shoulders[0],
        ...exerciseDatabase.arms.slice(0, 2),
      ],
      estimatedMinutes: 60,
    },
  ];
}

function generateMaintainPlan(): WorkoutDay[] {
  return [
    {
      id: '1',
      dayName: 'Segunda-feira',
      focus: 'Superior',
      exercises: [
        ...exerciseDatabase.chest.slice(0, 2),
        ...exerciseDatabase.back.slice(0, 2),
        ...exerciseDatabase.shoulders.slice(0, 1),
      ],
      estimatedMinutes: 50,
    },
    {
      id: '2',
      dayName: 'Quarta-feira',
      focus: 'Inferior + Core',
      exercises: [
        ...exerciseDatabase.legs.slice(0, 3),
        ...exerciseDatabase.core.slice(0, 2),
      ],
      estimatedMinutes: 50,
    },
    {
      id: '3',
      dayName: 'Sexta-feira',
      focus: 'Full Body + Cardio',
      exercises: [
        exerciseDatabase.chest[0],
        exerciseDatabase.back[0],
        exerciseDatabase.legs[0],
        ...exerciseDatabase.arms.slice(0, 2),
        exerciseDatabase.cardio[0],
      ],
      estimatedMinutes: 60,
    },
  ];
}

function generateEndurancePlan(): WorkoutDay[] {
  return [
    {
      id: '1',
      dayName: 'Segunda-feira',
      focus: 'Corrida Longa',
      exercises: [
        { id: 'run1', name: 'Corrida Moderada', sets: 1, reps: '45-60min', restSeconds: 0, muscleGroup: 'Cardio', icon: '🏃' },
        ...exerciseDatabase.core.slice(0, 2),
      ],
      estimatedMinutes: 70,
    },
    {
      id: '2',
      dayName: 'Terça-feira',
      focus: 'Força + Resistência',
      exercises: [
        ...exerciseDatabase.legs.slice(0, 3),
        exerciseDatabase.chest[3],
        ...exerciseDatabase.core,
      ],
      estimatedMinutes: 50,
    },
    {
      id: '3',
      dayName: 'Quarta-feira',
      focus: 'Descanso Ativo',
      exercises: [
        { id: 'swim', name: 'Natação ou Bike Leve', sets: 1, reps: '30min', restSeconds: 0, muscleGroup: 'Cardio', icon: '🏊' },
      ],
      estimatedMinutes: 30,
    },
    {
      id: '4',
      dayName: 'Quinta-feira',
      focus: 'Intervalado',
      exercises: [
        { id: 'interval', name: 'Treino Intervalado', sets: 8, reps: '400m rápido + 200m leve', restSeconds: 60, muscleGroup: 'Cardio', icon: '⚡' },
      ],
      estimatedMinutes: 40,
    },
    {
      id: '5',
      dayName: 'Sexta-feira',
      focus: 'Força Funcional',
      exercises: [
        ...exerciseDatabase.legs.slice(0, 2),
        ...exerciseDatabase.back.slice(0, 2),
        ...exerciseDatabase.core,
      ],
      estimatedMinutes: 55,
    },
    {
      id: '6',
      dayName: 'Sábado',
      focus: 'Corrida Longa',
      exercises: [
        { id: 'longrun', name: 'Corrida Longa', sets: 1, reps: '60-90min', restSeconds: 0, muscleGroup: 'Cardio', icon: '🏃' },
      ],
      estimatedMinutes: 90,
    },
  ];
}

export function generateWorkoutPlan(user: UserProfile): WorkoutPlan {
  let days: WorkoutDay[];
  let name: string;
  let description: string;

  switch (user.goal) {
    case 'lose_weight':
      days = generateLoseWeightPlan();
      name = 'Plano Queima de Gordura';
      description = `Treino focado em queima calórica com combinação de musculação e cardio. Ideal para ${user.name} atingir seu objetivo de perda de peso.`;
      break;
    case 'gain_muscle':
      days = generateGainMusclePlan();
      name = 'Plano Hipertrofia';
      description = `Treino focado em ganho de massa muscular com divisão por grupos musculares. Projetado para maximizar o crescimento muscular.`;
      break;
    case 'maintain':
      days = generateMaintainPlan();
      name = 'Plano Manutenção';
      description = `Treino equilibrado para manter a forma física atual. 3 dias por semana com foco em manutenção da massa muscular.`;
      break;
    case 'endurance':
      days = generateEndurancePlan();
      name = 'Plano Resistência';
      description = `Treino focado em aumentar capacidade cardiorrespiratória e resistência. Ideal para corredores e atletas de endurance.`;
      break;
    default:
      days = generateMaintainPlan();
      name = 'Plano Geral';
      description = 'Treino balanceado para condicionamento geral.';
  }

  return {
    id: crypto.randomUUID(),
    name,
    description,
    daysPerWeek: days.length,
    days,
    goal: user.goal,
  };
}
