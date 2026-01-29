-- Create profiles table
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    birthdate DATE,
    age INTEGER,
    weight NUMERIC(5,2),
    height NUMERIC(5,2),
    goal TEXT DEFAULT 'maintain',
    muscle_groups TEXT[] DEFAULT '{}',
    training_frequency INTEGER DEFAULT 3,
    points INTEGER DEFAULT 0,
    spotify_playlist TEXT,
    youtube_playlist TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create helper function to check if user owns the profile
CREATE OR REPLACE FUNCTION public.is_own_profile(profile_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT profile_id = auth.uid()
$$;

-- RLS policies for profiles
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (is_own_profile(id));

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (is_own_profile(id));

CREATE POLICY "Users can delete their own profile"
ON public.profiles FOR DELETE
USING (is_own_profile(id));

-- Create challenges table
CREATE TABLE public.challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    challenge_type TEXT NOT NULL CHECK (challenge_type IN ('daily', 'weekly')),
    points_awarded INTEGER DEFAULT 10,
    points_deducted INTEGER DEFAULT 5,
    icon TEXT DEFAULT '🏆',
    target_value INTEGER DEFAULT 1,
    category TEXT DEFAULT 'general',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on challenges
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

-- Everyone can read challenges
CREATE POLICY "Anyone can view challenges"
ON public.challenges FOR SELECT
TO authenticated
USING (is_active = true);

-- Create user_challenge_progress table
CREATE TABLE public.user_challenge_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
    current_value INTEGER DEFAULT 0,
    is_completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP WITH TIME ZONE,
    assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, challenge_id, assigned_date)
);

-- Enable RLS on user_challenge_progress
ALTER TABLE public.user_challenge_progress ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_challenge_progress
CREATE POLICY "Users can view their own challenge progress"
ON public.user_challenge_progress FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own challenge progress"
ON public.user_challenge_progress FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own challenge progress"
ON public.user_challenge_progress FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own challenge progress"
ON public.user_challenge_progress FOR DELETE
USING (user_id = auth.uid());

-- Create weight_history table
CREATE TABLE public.weight_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    weight NUMERIC(5,2) NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on weight_history
ALTER TABLE public.weight_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for weight_history
CREATE POLICY "Users can view their own weight history"
ON public.weight_history FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own weight history"
ON public.weight_history FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Create run_sessions table
CREATE TABLE public.run_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    duration INTEGER NOT NULL,
    distance NUMERIC(10,2) NOT NULL,
    avg_speed NUMERIC(5,2),
    calories INTEGER,
    route JSONB DEFAULT '[]',
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on run_sessions
ALTER TABLE public.run_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies for run_sessions
CREATE POLICY "Users can view their own run sessions"
ON public.run_sessions FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own run sessions"
ON public.run_sessions FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_challenge_progress_updated_at
    BEFORE UPDATE ON public.user_challenge_progress
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default challenges
INSERT INTO public.challenges (name, description, challenge_type, points_awarded, points_deducted, icon, target_value, category) VALUES
('Treino Completo', 'Complete um treino hoje', 'daily', 15, 5, '💪', 1, 'workout'),
('Hidratação', 'Beba 2L de água hoje', 'daily', 10, 3, '💧', 8, 'health'),
('Corrida Matinal', 'Corra pelo menos 2km', 'daily', 20, 5, '🏃', 1, 'cardio'),
('Registrar Peso', 'Registre seu peso hoje', 'daily', 5, 0, '⚖️', 1, 'tracking'),
('Seguir Dieta', 'Siga o plano de dieta do dia', 'daily', 15, 5, '🥗', 1, 'diet'),
('Meta Semanal de Treinos', 'Complete todos os treinos da semana', 'weekly', 50, 20, '🎯', 5, 'workout'),
('Corrida Semanal 10km', 'Corra 10km durante a semana', 'weekly', 40, 10, '🏅', 1, 'cardio'),
('Consistência de Peso', 'Registre seu peso todos os dias da semana', 'weekly', 30, 10, '📊', 7, 'tracking');