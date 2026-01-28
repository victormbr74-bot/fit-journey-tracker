import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUser } from '@/context/UserContext';
import { Dumbbell, Mail, Lock, User, ArrowRight, Loader2 } from 'lucide-react';
export function AuthForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const {
    login,
    register
  } = useUser();
  const navigate = useNavigate();
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isLogin) {
        const success = await login(email, password);
        if (success) {
          navigate('/dashboard');
        } else {
          setError('Email ou senha incorretos');
        }
      } else {
        if (!name.trim()) {
          setError('Nome é obrigatório');
          setLoading(false);
          return;
        }
        const success = await register(name, email, password);
        if (success) {
          navigate('/onboarding');
        } else {
          setError('Erro ao criar conta');
        }
      }
    } catch (err) {
      setError('Ocorreu um erro. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };
  return <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-64 h-64 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10 slide-up">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mb-4 animate-pulse-glow">
            <Dumbbell className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold gradient-text">SouFIT</h1>
          <p className="text-muted-foreground mt-2">Sua jornada fitness começa aqui</p>
        </div>

        {/* Form Card */}
        <div className="glass-card p-6 md:p-8">
          <div className="flex mb-6 bg-secondary/50 rounded-lg p-1">
            <button type="button" onClick={() => setIsLogin(true)} className={`flex-1 py-2.5 rounded-md text-sm font-medium transition-all duration-300 ${isLogin ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              Entrar
            </button>
            <button type="button" onClick={() => setIsLogin(false)} className={`flex-1 py-2.5 rounded-md text-sm font-medium transition-all duration-300 ${!isLogin ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              Cadastrar
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && <div className="relative fade-in">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input type="text" placeholder="Seu nome" value={name} onChange={e => setName(e.target.value)} className="pl-12" required={!isLogin} />
              </div>}

            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input type="email" placeholder="Seu email" value={email} onChange={e => setEmail(e.target.value)} className="pl-12" required />
            </div>

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input type="password" placeholder="Sua senha" value={password} onChange={e => setPassword(e.target.value)} className="pl-12" required minLength={6} />
            </div>

            {error && <p className="text-destructive text-sm text-center fade-in">{error}</p>}

            <Button type="submit" variant="energy" size="lg" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>
                  {isLogin ? 'Entrar' : 'Criar conta'}
                  <ArrowRight className="w-5 h-5" />
                </>}
            </Button>
          </form>

          {isLogin && <p className="text-center text-sm text-muted-foreground mt-6">
              Não tem conta?{' '}
              <button type="button" onClick={() => setIsLogin(false)} className="text-primary hover:underline font-medium">
                Cadastre-se grátis
              </button>
            </p>}
        </div>
      </div>
    </div>;
}