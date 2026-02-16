import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, MapPin, User, LogOut, Dumbbell, Utensils, Bot, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/workout', label: 'Treino', icon: Dumbbell },
  { path: '/diet', label: 'Dieta', icon: Utensils },
  { path: '/running', label: 'Corrida', icon: MapPin },
  { path: '/assistant', label: 'PERSONAL AMIGO', icon: Bot },
  { path: '/social', label: 'COMUNIDADE', icon: Users },
  { path: '/profile', label: 'Perfil', icon: User },
];

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { profile } = useProfile();

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <aside className="hidden md:flex flex-col w-64 min-h-screen bg-card border-r border-border p-4">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8 px-2">
        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
          <Dumbbell className="w-5 h-5 text-primary-foreground" />
        </div>
        <span className="text-xl font-bold gradient-text">FitTrack</span>
      </div>

      {/* User Info */}
      {(profile || user) && (
        <div className="glass-card p-3 mb-6">
          <p className="font-medium truncate">
            {profile?.name || user?.name || user?.email?.split('@')[0]}
          </p>
          <p className="text-sm text-muted-foreground truncate">
            {profile?.email || user?.email}
          </p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                isActive
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="flex items-center gap-3 px-4 py-3 rounded-xl text-destructive hover:bg-destructive/10 transition-all duration-300"
      >
        <LogOut className="w-5 h-5" />
        <span className="font-medium">Sair</span>
      </button>
    </aside>
  );
}
