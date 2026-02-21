import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { Mail, Lock, User, ArrowRight, Loader2, Eye, EyeOff, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import soufitLogo from '@/assets/soufit-logo.png';
import { ProfileType, PROFILE_TYPES } from '@/types/user';

export function AuthForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [profileType, setProfileType] = useState<ProfileType>('client');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        const { error: signInError } = await signIn(email, password);
        if (signInError) {
          if (signInError.message.includes('Invalid login credentials')) {
            setError('Email ou senha incorretos');
          } else if (signInError.message.includes('Email not confirmed')) {
            setError('Por favor, confirme seu email antes de entrar');
          } else {
            setError('Email ou senha incorretos');
          }
        } else {
          toast.success('Bem-vindo de volta!');
          navigate('/dashboard');
        }
      } else {
        if (!name.trim()) {
          setError('Nome obrigatorio');
          setLoading(false);
          return;
        }

        const normalizedPhone = phone.trim();
        if (normalizedPhone && !/^[0-9()+\-\s]{8,20}$/.test(normalizedPhone)) {
          setError('Celular invalido. Use apenas numeros e sinais comuns.');
          setLoading(false);
          return;
        }

        const { data, error: signUpError } = await signUp(
          email,
          password,
          name,
          normalizedPhone,
          profileType
        );
        if (signUpError) {
          if (signUpError.message.includes('already registered')) {
            setError('Este email ja esta cadastrado');
          } else {
            setError(`Erro ao criar conta: ${signUpError.message}`);
          }
        } else if (data) {
          toast.success('Conta criada! Verifique seu email para confirmar.');
          setIsLogin(true);
          setError('');
          setPhone('');
          setProfileType('client');
        }
      }
    } catch {
      setError('Ocorreu um erro. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary/30 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-primary/20 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-md relative z-10 slide-up">
        <div className="flex flex-col items-center mb-8">
          <div className="w-24 h-24 mb-4">
            <img src={soufitLogo} alt="SouFit" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-4xl font-black tracking-tight">
            <span className="gradient-text">SouFit</span>
          </h1>
          <p className="text-muted-foreground mt-2">Sua jornada fitness comeca aqui</p>
        </div>

        <div className="glass-card p-6 md:p-8">
          <div className="flex mb-6 bg-secondary/50 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2.5 rounded-md text-sm font-medium transition-all duration-300 ${
                isLogin ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2.5 rounded-md text-sm font-medium transition-all duration-300 ${
                !isLogin ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Cadastrar
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="fade-in space-y-2">
                <label htmlFor="account-type" className="block text-sm font-medium text-foreground/90">
                  Tipo de conta
                </label>
                <select
                  id="account-type"
                  value={profileType}
                  onChange={(event) => setProfileType(event.target.value as ProfileType)}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {PROFILE_TYPES.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {PROFILE_TYPES.find((option) => option.id === profileType)?.description}
                </p>
              </div>
            )}

            {!isLogin && (
              <div className="relative fade-in">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Seu nome"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-12"
                  required={!isLogin}
                />
              </div>
            )}

            {!isLogin && (
              <div className="relative fade-in">
                <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  type="tel"
                  placeholder="Seu celular (opcional)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="pl-12"
                  autoComplete="tel"
                />
              </div>
            )}

            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="email"
                placeholder="Seu email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-12"
                required
                autoComplete="email"
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-12 pr-12"
                required
                minLength={6}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            {error && <p className="text-destructive text-sm text-center fade-in">{error}</p>}

            <Button type="submit" variant="energy" size="lg" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  {isLogin ? 'Entrar' : 'Criar conta'}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </Button>
          </form>

          {isLogin && (
            <p className="text-center text-sm text-muted-foreground mt-6">
              Nao tem conta?{' '}
              <button
                type="button"
                onClick={() => setIsLogin(false)}
                className="text-primary hover:underline font-medium"
              >
                Cadastre-se gratis
              </button>
            </p>
          )}
        </div>

        <div className="mt-8 grid grid-cols-3 gap-4 text-center">
          <div className="p-3">
            <span className="text-2xl mb-2 block">??</span>
            <p className="text-xs text-muted-foreground">Treinos Personalizados</p>
          </div>
          <div className="p-3">
            <span className="text-2xl mb-2 block">??</span>
            <p className="text-xs text-muted-foreground">Rastreie Corridas</p>
          </div>
          <div className="p-3">
            <span className="text-2xl mb-2 block">??</span>
            <p className="text-xs text-muted-foreground">Desafios Diarios</p>
          </div>
        </div>
      </div>
    </div>
  );
}
