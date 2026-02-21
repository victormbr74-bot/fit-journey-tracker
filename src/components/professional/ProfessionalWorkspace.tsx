import { useCallback, useEffect, useMemo, useState } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { generateWorkoutPlan } from '@/lib/workoutGenerator';
import { generateDietPlan } from '@/lib/dietGenerator';
import { Goal } from '@/types/user';
import { Link2, Search, ShieldCheck, Trash2, UserRound, UsersRound } from 'lucide-react';

type ClientSearchResult = {
  profile_id: string;
  name: string;
  handle: string;
  goal: string | null;
  already_linked: boolean;
};

type ManagedClient = {
  linkId: string;
  linkedAt: string;
  id: string;
  name: string;
  handle: string;
  email: string;
  goal: string;
  weight: number;
  height: number;
  age: number;
};

const resolveGoal = (value: string | null | undefined): Goal['id'] => {
  if (value === 'lose_weight' || value === 'gain_muscle' || value === 'endurance') {
    return value;
  }
  return 'maintain';
};

const getGoalLabel = (goal: Goal['id']) => {
  if (goal === 'lose_weight') return 'Perder peso';
  if (goal === 'gain_muscle') return 'Ganhar massa';
  if (goal === 'endurance') return 'Resistencia';
  return 'Manter forma';
};

const formatDateTime = (isoDate: string) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
};

export function ProfessionalWorkspace() {
  const { profile } = useProfile();
  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);
  const [linkingHandle, setLinkingHandle] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<ClientSearchResult[]>([]);
  const [managedClients, setManagedClients] = useState<ManagedClient[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [busyClientAction, setBusyClientAction] = useState<string | null>(null);

  const isProfessionalAccount = useMemo(
    () =>
      profile?.profile_type === 'personal_trainer' ||
      profile?.profile_type === 'nutritionist',
    [profile?.profile_type]
  );

  const loadManagedClients = useCallback(async () => {
    if (!profile?.id || !isProfessionalAccount) {
      setManagedClients([]);
      setLoadingClients(false);
      return;
    }

    setLoadingClients(true);
    const { data: links, error: linksError } = await supabase
      .from('professional_client_links')
      .select('id, client_id, created_at, status')
      .eq('professional_id', profile.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (linksError) {
      console.error('Erro ao carregar clientes vinculados:', linksError);
      toast.error('Nao foi possivel carregar seus clientes.');
      setManagedClients([]);
      setLoadingClients(false);
      return;
    }

    const linkRows = links || [];
    if (linkRows.length === 0) {
      setManagedClients([]);
      setLoadingClients(false);
      return;
    }

    const clientIds = linkRows.map((link) => link.client_id);
    const { data: clientsData, error: clientsError } = await supabase
      .from('profiles')
      .select('id, name, handle, email, goal, weight, height, age')
      .in('id', clientIds);

    if (clientsError) {
      console.error('Erro ao carregar perfis dos clientes:', clientsError);
      toast.error('Nao foi possivel carregar os perfis dos clientes.');
      setManagedClients([]);
      setLoadingClients(false);
      return;
    }

    const clientsById = new Map((clientsData || []).map((client) => [client.id, client]));
    const mergedClients: ManagedClient[] = linkRows
      .map((link) => {
        const client = clientsById.get(link.client_id);
        if (!client) return null;
        return {
          linkId: link.id,
          linkedAt: link.created_at,
          id: client.id,
          name: client.name || 'Cliente',
          handle: client.handle || '@cliente',
          email: client.email || '',
          goal: client.goal || 'maintain',
          weight: Number(client.weight) || 0,
          height: Number(client.height) || 0,
          age: Number(client.age) || 0,
        };
      })
      .filter((value): value is ManagedClient => Boolean(value));

    setManagedClients(mergedClients);
    setLoadingClients(false);
  }, [isProfessionalAccount, profile?.id]);

  useEffect(() => {
    void loadManagedClients();
  }, [loadManagedClients]);

  const handleSearchClients = async () => {
    if (!isProfessionalAccount) return;

    setSearching(true);
    const { data, error } = await supabase.rpc('search_client_profiles', {
      query_text: searchText.trim(),
      limit_count: 20,
    });

    if (error) {
      console.error('Erro ao buscar clientes:', error);
      toast.error('Nao foi possivel buscar clientes agora.');
      setSearching(false);
      return;
    }

    setSearchResults(Array.isArray(data) ? data : []);
    setSearching(false);
  };

  const handleLinkClient = async (clientHandle: string) => {
    if (!profile?.id || !isProfessionalAccount) return;
    setLinkingHandle(clientHandle);

    const { error } = await supabase.rpc('link_client_by_handle', {
      client_handle_input: clientHandle,
    });

    if (error) {
      console.error('Erro ao vincular cliente:', error);
      toast.error(error.message || 'Nao foi possivel vincular o cliente.');
      setLinkingHandle(null);
      return;
    }

    toast.success('Cliente vinculado com sucesso.');
    setSearchResults((previous) =>
      previous.map((result) =>
        result.handle === clientHandle ? { ...result, already_linked: true } : result
      )
    );
    setLinkingHandle(null);
    void loadManagedClients();
  };

  const handleUnlinkClient = async (client: ManagedClient) => {
    if (!profile?.id) return;
    const confirmed = window.confirm(`Deseja desvincular ${client.name}?`);
    if (!confirmed) return;

    setBusyClientAction(`unlink:${client.id}`);
    const { error } = await supabase
      .from('professional_client_links')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', client.linkId)
      .eq('professional_id', profile.id);

    if (error) {
      console.error('Erro ao desvincular cliente:', error);
      toast.error('Nao foi possivel desvincular o cliente.');
      setBusyClientAction(null);
      return;
    }

    toast.success('Cliente desvinculado.');
    setBusyClientAction(null);
    void loadManagedClients();
  };

  const handlePublishWorkoutPlan = async (client: ManagedClient) => {
    if (!profile?.id) return;

    setBusyClientAction(`workout:${client.id}`);
    const generatedPlan = generateWorkoutPlan({
      name: client.name,
      goal: resolveGoal(client.goal),
    });

    const timestamp = new Date().toLocaleDateString('pt-BR');
    const title = `Treino personalizado - ${timestamp}`;
    const description = `Treino criado por ${profile.name} para ${client.name}.`;

    const { error: clearError } = await supabase
      .from('client_workout_plans')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('professional_id', profile.id)
      .eq('client_id', client.id)
      .eq('is_active', true);

    if (clearError) {
      console.error('Erro ao desativar treino antigo:', clearError);
      toast.error('Nao foi possivel atualizar o treino ativo.');
      setBusyClientAction(null);
      return;
    }

    const { error } = await supabase.from('client_workout_plans').insert({
      professional_id: profile.id,
      client_id: client.id,
      title,
      description,
      plan_data: generatedPlan,
      is_active: true,
    });

    if (error) {
      console.error('Erro ao publicar treino do cliente:', error);
      toast.error('Nao foi possivel publicar o treino do cliente.');
      setBusyClientAction(null);
      return;
    }

    toast.success(`Treino publicado para ${client.name}.`);
    setBusyClientAction(null);
  };

  const handlePublishDietPlan = async (client: ManagedClient) => {
    if (!profile?.id) return;

    setBusyClientAction(`diet:${client.id}`);
    const generatedPlan = generateDietPlan({
      weight: client.weight > 0 ? client.weight : 70,
      height: client.height > 0 ? client.height : 170,
      age: client.age > 0 ? client.age : 30,
      goal: resolveGoal(client.goal),
    });

    const timestamp = new Date().toLocaleDateString('pt-BR');
    const title = `Dieta personalizada - ${timestamp}`;
    const description = `Dieta criada por ${profile.name} para ${client.name}.`;

    const { error: clearError } = await supabase
      .from('client_diet_plans')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('professional_id', profile.id)
      .eq('client_id', client.id)
      .eq('is_active', true);

    if (clearError) {
      console.error('Erro ao desativar dieta antiga:', clearError);
      toast.error('Nao foi possivel atualizar a dieta ativa.');
      setBusyClientAction(null);
      return;
    }

    const { error } = await supabase.from('client_diet_plans').insert({
      professional_id: profile.id,
      client_id: client.id,
      title,
      description,
      plan_data: generatedPlan,
      is_active: true,
    });

    if (error) {
      console.error('Erro ao publicar dieta do cliente:', error);
      toast.error('Nao foi possivel publicar a dieta do cliente.');
      setBusyClientAction(null);
      return;
    }

    toast.success(`Dieta publicada para ${client.name}.`);
    setBusyClientAction(null);
  };

  if (!isProfessionalAccount) {
    return (
      <Card className="glass-card border-border/70">
        <CardHeader>
          <CardTitle className="text-lg">Acesso profissional</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Esta area e exclusiva para contas `Personal Trainer` e `Nutricionista`.
          </p>
          <p>
            Se desejar mudar seu tipo de conta, crie um novo cadastro com perfil profissional.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 pb-24 md:pb-8">
      <Card className="glass-card border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Area privada do profissional
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>Busque clientes, vincule e publique treino/dieta personalizados.</p>
          <p>Apenas clientes vinculados recebem e visualizam os planos.</p>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="w-4 h-4" />
            Buscar cliente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 md:flex-row">
            <Input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Digite nome ou @usuario do cliente"
            />
            <Button
              type="button"
              variant="energy"
              onClick={handleSearchClients}
              disabled={searching}
              className="gap-2 md:w-40"
            >
              <Search className="w-4 h-4" />
              {searching ? 'Buscando...' : 'Buscar'}
            </Button>
          </div>

          <div className="space-y-2">
            {searchResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum resultado carregado ainda.
              </p>
            ) : (
              searchResults.map((result) => (
                <div
                  key={result.profile_id}
                  className="flex flex-col gap-3 rounded-lg border border-border/70 bg-background/60 p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-medium">{result.name}</p>
                    <p className="text-sm text-muted-foreground">{result.handle}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={result.already_linked ? 'outline' : 'energy'}
                    className="gap-2"
                    onClick={() => handleLinkClient(result.handle)}
                    disabled={result.already_linked || linkingHandle === result.handle}
                  >
                    <Link2 className="w-4 h-4" />
                    {result.already_linked
                      ? 'Ja vinculado'
                      : linkingHandle === result.handle
                        ? 'Vinculando...'
                        : 'Vincular'}
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <UsersRound className="w-5 h-5 text-primary" />
          Clientes vinculados
        </h2>

        {loadingClients ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : managedClients.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="py-8 text-sm text-muted-foreground text-center">
              Nenhum cliente vinculado. Use a busca acima para iniciar.
            </CardContent>
          </Card>
        ) : (
          managedClients.map((client) => {
            const unlinkBusy = busyClientAction === `unlink:${client.id}`;
            const workoutBusy = busyClientAction === `workout:${client.id}`;
            const dietBusy = busyClientAction === `diet:${client.id}`;

            return (
              <Card key={client.id} className="glass-card">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <UserRound className="w-4 h-4 text-primary" />
                    {client.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="outline">{client.handle}</Badge>
                    <Badge variant="outline">{client.email}</Badge>
                    <Badge variant="outline">Meta: {getGoalLabel(resolveGoal(client.goal))}</Badge>
                    <Badge variant="outline">
                      Vinculado em {formatDateTime(client.linkedAt)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="energy"
                      size="sm"
                      onClick={() => handlePublishWorkoutPlan(client)}
                      disabled={workoutBusy || dietBusy || unlinkBusy}
                    >
                      {workoutBusy ? 'Publicando treino...' : 'Publicar treino'}
                    </Button>
                    <Button
                      type="button"
                      variant="energy"
                      size="sm"
                      onClick={() => handlePublishDietPlan(client)}
                      disabled={workoutBusy || dietBusy || unlinkBusy}
                    >
                      {dietBusy ? 'Publicando dieta...' : 'Publicar dieta'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2 text-destructive hover:text-destructive"
                      onClick={() => handleUnlinkClient(client)}
                      disabled={workoutBusy || dietBusy || unlinkBusy}
                    >
                      <Trash2 className="w-4 h-4" />
                      {unlinkBusy ? 'Desvinculando...' : 'Desvincular'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
