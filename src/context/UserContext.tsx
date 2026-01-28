import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserProfile, WeightEntry, RunSession } from '@/types/user';

interface UserContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isOnboarded: boolean;
  weightHistory: WeightEntry[];
  runSessions: RunSession[];
  login: (email: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
  completeOnboarding: (data: { age: number; weight: number; height: number; goal: UserProfile['goal'] }) => void;
  addWeightEntry: (weight: number) => void;
  addRunSession: (session: Omit<RunSession, 'id'>) => void;
  addPoints: (points: number) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
  const [runSessions, setRunSessions] = useState<RunSession[]>([]);

  useEffect(() => {
    // Load from localStorage on mount
    const savedUser = localStorage.getItem('fittrack_user');
    const savedOnboarded = localStorage.getItem('fittrack_onboarded');
    const savedWeight = localStorage.getItem('fittrack_weight');
    const savedRuns = localStorage.getItem('fittrack_runs');

    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    if (savedOnboarded === 'true') {
      setIsOnboarded(true);
    }
    if (savedWeight) {
      setWeightHistory(JSON.parse(savedWeight));
    }
    if (savedRuns) {
      setRunSessions(JSON.parse(savedRuns));
    }
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    // Simulate login - in real app, this would call an API
    const savedUser = localStorage.getItem('fittrack_user');
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      if (parsedUser.email === email) {
        setUser(parsedUser);
        const savedOnboarded = localStorage.getItem('fittrack_onboarded');
        setIsOnboarded(savedOnboarded === 'true');
        return true;
      }
    }
    return false;
  };

  const register = async (name: string, email: string, password: string): Promise<boolean> => {
    const newUser: UserProfile = {
      id: crypto.randomUUID(),
      name,
      email,
      age: 0,
      weight: 0,
      height: 0,
      goal: 'maintain',
      points: 0,
      createdAt: new Date(),
    };
    setUser(newUser);
    localStorage.setItem('fittrack_user', JSON.stringify(newUser));
    setIsOnboarded(false);
    localStorage.setItem('fittrack_onboarded', 'false');
    return true;
  };

  const logout = () => {
    setUser(null);
    setIsOnboarded(false);
    localStorage.removeItem('fittrack_user');
    localStorage.removeItem('fittrack_onboarded');
  };

  const completeOnboarding = (data: { age: number; weight: number; height: number; goal: UserProfile['goal'] }) => {
    if (user) {
      const updatedUser = { ...user, ...data };
      setUser(updatedUser);
      localStorage.setItem('fittrack_user', JSON.stringify(updatedUser));
      setIsOnboarded(true);
      localStorage.setItem('fittrack_onboarded', 'true');
      
      // Add initial weight entry
      const initialWeight: WeightEntry = { date: new Date(), weight: data.weight };
      setWeightHistory([initialWeight]);
      localStorage.setItem('fittrack_weight', JSON.stringify([initialWeight]));
    }
  };

  const addWeightEntry = (weight: number) => {
    const entry: WeightEntry = { date: new Date(), weight };
    const newHistory = [...weightHistory, entry];
    setWeightHistory(newHistory);
    localStorage.setItem('fittrack_weight', JSON.stringify(newHistory));
    
    // Update user weight and add points
    if (user) {
      const updatedUser = { ...user, weight, points: user.points + 10 };
      setUser(updatedUser);
      localStorage.setItem('fittrack_user', JSON.stringify(updatedUser));
    }
  };

  const addRunSession = (session: Omit<RunSession, 'id'>) => {
    const newSession: RunSession = { ...session, id: crypto.randomUUID() };
    const newSessions = [...runSessions, newSession];
    setRunSessions(newSessions);
    localStorage.setItem('fittrack_runs', JSON.stringify(newSessions));
    
    // Add points based on distance
    if (user) {
      const pointsEarned = Math.floor(session.distance * 20);
      const updatedUser = { ...user, points: user.points + pointsEarned };
      setUser(updatedUser);
      localStorage.setItem('fittrack_user', JSON.stringify(updatedUser));
    }
  };

  const addPoints = (points: number) => {
    if (user) {
      const updatedUser = { ...user, points: user.points + points };
      setUser(updatedUser);
      localStorage.setItem('fittrack_user', JSON.stringify(updatedUser));
    }
  };

  return (
    <UserContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isOnboarded,
        weightHistory,
        runSessions,
        login,
        register,
        logout,
        completeOnboarding,
        addWeightEntry,
        addRunSession,
        addPoints,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
