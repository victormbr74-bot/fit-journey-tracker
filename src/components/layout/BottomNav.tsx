import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, MapPin, User, LogOut, Dumbbell, Utensils, Bot, Users, Search } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const navItems = [
  { path: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { path: '/search', label: 'Pesquisa', icon: Search },
  { path: '/workout', label: 'Treino', icon: Dumbbell },
  { path: '/diet', label: 'Dieta', icon: Utensils },
  { path: '/running', label: 'Corrida', icon: MapPin },
  { path: '/assistant', label: 'P.AMIGO', icon: Bot },
  { path: '/social', label: 'Social', icon: Users },
  { path: '/profile', label: 'Perfil', icon: User },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      <div className="bg-card/95 backdrop-blur-xl border-t border-border px-4 py-2 safe-area-inset-bottom">
        <div className="flex justify-around items-center">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs">{item.label}</span>
              </button>
            );
          })}
          <button
            onClick={handleLogout}
            className="nav-item text-destructive"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-xs">Sair</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
