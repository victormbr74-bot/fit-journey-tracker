import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Tags, WalletCards } from 'lucide-react';
import { toast } from 'sonner';

import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import {
  PAYMENT_PRODUCTS,
  PaymentProductKey,
  formatCurrencyBRL,
  formatOrderStatus,
  parseCurrencyInputToCents,
} from '@/lib/payments';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

const DB = supabase as any;

type PricingRuleRow = {
  id: string;
  scope: 'global' | 'professional' | 'client_override';
  owner_id: string | null;
  client_id: string | null;
  product_key: string;
  price_cents: number;
  currency: string;
  active: boolean;
  updated_at: string;
};

type LinkedClient = { id: string; name: string; handle: string | null };
type ManualProofRow = { id: string; order_id: string; file_path: string; status: string; created_at: string };
type OrderRow = {
  id: string;
  client_id: string;
  professional_id: string | null;
  product_key: string;
  amount_cents: number;
  currency: string;
  status: string;
  provider: string;
  created_at: string;
  paid_at: string | null;
};
type ProviderSettings = {
  active_provider: 'mercadopago' | 'pagarme' | 'efi' | 'pagbank' | 'manual';
  manual_pix_key: string | null;
  manual_pix_copy_paste: string | null;
  manual_pix_display_name: string | null;
  manual_pix_instructions: string | null;
};

const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  active_provider: 'manual',
  manual_pix_key: '',
  manual_pix_copy_paste: '',
  manual_pix_display_name: '',
  manual_pix_instructions: '',
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('pt-BR');
};

const productLabel = (key: string) => PAYMENT_PRODUCTS.find((item) => item.key === key)?.label || key;

type RuleForm = {
  productKey: PaymentProductKey;
  priceInput: string;
  active: boolean;
};

export function PricingWorkspace() {
  const { profile } = useProfile();
  const isProfessional = profile?.profile_type === 'personal_trainer' || profile?.profile_type === 'nutritionist';
  const isAdmin = Boolean(profile?.is_admin);
  const canAccess = Boolean(isProfessional || isAdmin);

  const [loading, setLoading] = useState(true);
  const [pricingRules, setPricingRules] = useState<PricingRuleRow[]>([]);
  const [linkedClients, setLinkedClients] = useState<LinkedClient[]>([]);
  const [providerSettings, setProviderSettings] = useState<ProviderSettings>(DEFAULT_PROVIDER_SETTINGS);
  const [pendingProofs, setPendingProofs] = useState<ManualProofRow[]>([]);
  const [recentOrders, setRecentOrders] = useState<OrderRow[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, { name: string; handle?: string | null }>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [reviewingKey, setReviewingKey] = useState<string | null>(null);

  const [globalForm, setGlobalForm] = useState<RuleForm>({
    productKey: 'personal_package',
    priceInput: '',
    active: true,
  });
  const [professionalForm, setProfessionalForm] = useState<RuleForm>({
    productKey: 'personal_package',
    priceInput: '',
    active: true,
  });
  const [overrideClientId, setOverrideClientId] = useState('');
  const [overrideForm, setOverrideForm] = useState<RuleForm>({
    productKey: 'personal_package',
    priceInput: '',
    active: true,
  });

  const myProfessionalRules = useMemo(
    () => pricingRules.filter((rule) => rule.scope === 'professional' && rule.owner_id === profile?.id),
    [pricingRules, profile?.id]
  );
  const myClientOverrides = useMemo(
    () => pricingRules.filter((rule) => rule.scope === 'client_override' && rule.owner_id === profile?.id),
    [pricingRules, profile?.id]
  );
  const globalRules = useMemo(
    () => pricingRules.filter((rule) => rule.scope === 'global'),
    [pricingRules]
  );

  const loadPricingRules = async () => {
    const { data, error } = await DB
      .from('pricing_rules')
      .select('id, scope, owner_id, client_id, product_key, price_cents, currency, active, updated_at')
      .order('updated_at', { ascending: false });
    if (error) throw new Error(error.message || 'Falha ao carregar regras');
    setPricingRules((Array.isArray(data) ? data : []) as PricingRuleRow[]);
  };

  const loadLinkedClients = async () => {
    if (!profile?.id || !isProfessional) {
      setLinkedClients([]);
      return;
    }
    const { data: links, error: linksError } = await DB
      .from('professional_client_links')
      .select('client_id')
      .eq('professional_id', profile.id)
      .eq('status', 'active');
    if (linksError) throw new Error(linksError.message || 'Falha ao carregar clientes vinculados');

    const clientIds = Array.from(
      new Set((Array.isArray(links) ? links : []).map((row: any) => row.client_id).filter(Boolean))
    ) as string[];
    if (!clientIds.length) {
      setLinkedClients([]);
      return;
    }
    const { data, error } = await DB.from('profiles').select('id, name, handle').in('id', clientIds);
    if (error) throw new Error(error.message || 'Falha ao carregar perfis dos clientes');
    setLinkedClients(((Array.isArray(data) ? data : []) as LinkedClient[]).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
  };

  const loadAdminData = async () => {
    if (!isAdmin) return;

    const [settingsRes, proofsRes, ordersRes] = await Promise.all([
      DB.from('payment_provider_settings')
        .select('active_provider, manual_pix_key, manual_pix_copy_paste, manual_pix_display_name, manual_pix_instructions')
        .eq('id', true)
        .maybeSingle(),
      DB.from('manual_pix_proofs')
        .select('id, order_id, file_path, status, created_at')
        .eq('status', 'submitted')
        .order('created_at', { ascending: false })
        .limit(20),
      DB.from('orders')
        .select('id, client_id, professional_id, product_key, amount_cents, currency, status, provider, created_at, paid_at')
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

    if (settingsRes.error) throw new Error(settingsRes.error.message || 'Falha ao carregar provider');
    if (proofsRes.error) throw new Error(proofsRes.error.message || 'Falha ao carregar comprovantes');
    if (ordersRes.error) throw new Error(ordersRes.error.message || 'Falha ao carregar pedidos');

    setProviderSettings({ ...DEFAULT_PROVIDER_SETTINGS, ...(settingsRes.data || {}) });
    const proofs = (Array.isArray(proofsRes.data) ? proofsRes.data : []) as ManualProofRow[];
    const orders = (Array.isArray(ordersRes.data) ? ordersRes.data : []) as OrderRow[];
    setPendingProofs(proofs);
    setRecentOrders(orders);

    const profileIds = Array.from(
      new Set(
        orders.flatMap((order) => [order.client_id, order.professional_id || null]).filter(Boolean)
      )
    ) as string[];
    if (!profileIds.length) {
      setProfilesById({});
      return;
    }
    const { data: profilesData, error: profilesError } = await DB
      .from('profiles')
      .select('id, name, handle')
      .in('id', profileIds);
    if (profilesError) throw new Error(profilesError.message || 'Falha ao carregar perfis');
    const mapped: Record<string, { name: string; handle?: string | null }> = {};
    for (const row of Array.isArray(profilesData) ? profilesData : []) {
      mapped[row.id] = { name: row.name, handle: row.handle || null };
    }
    setProfilesById(mapped);
  };

  const reload = async () => {
    if (!profile?.id || !canAccess) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      await Promise.all([loadPricingRules(), loadLinkedClients(), loadAdminData()]);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Falha ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [profile?.id, canAccess]);

  useEffect(() => {
    if (!overrideClientId && linkedClients.length) {
      setOverrideClientId(linkedClients[0].id);
    }
  }, [linkedClients, overrideClientId]);

  const findRule = async (scope: PricingRuleRow['scope'], ownerId: string | null, clientId: string | null, productKey: string) => {
    let query = DB.from('pricing_rules').select('id').eq('scope', scope).eq('product_key', productKey);
    query = ownerId ? query.eq('owner_id', ownerId) : query.is('owner_id', null);
    query = clientId ? query.eq('client_id', clientId) : query.is('client_id', null);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(error.message || 'Falha ao localizar regra');
    return (data as { id: string } | null) || null;
  };

  const saveRule = async (scope: PricingRuleRow['scope'], ownerId: string | null, clientId: string | null, form: RuleForm, key: string) => {
    const priceCents = parseCurrencyInputToCents(form.priceInput);
    if (priceCents === null) {
      toast.error('Preco invalido. Use formato ex: 99,90');
      return;
    }
    setSavingKey(key);
    try {
      const existing = await findRule(scope, ownerId, clientId, form.productKey);
      if (existing) {
        const { error } = await DB
          .from('pricing_rules')
          .update({ price_cents: priceCents, currency: 'BRL', active: form.active, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) throw new Error(error.message || 'Falha ao atualizar regra');
      } else {
        const { error } = await DB.from('pricing_rules').insert({
          scope,
          owner_id: ownerId,
          client_id: clientId,
          product_key: form.productKey,
          price_cents: priceCents,
          currency: 'BRL',
          active: form.active,
        });
        if (error) throw new Error(error.message || 'Falha ao criar regra');
      }
      toast.success('Regra salva.');
      await loadPricingRules();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar regra');
    } finally {
      setSavingKey(null);
    }
  };

  const saveProviderSettings = async () => {
    if (!isAdmin) return;
    setSavingKey('provider');
    try {
      const { error } = await DB
        .from('payment_provider_settings')
        .update({
          active_provider: providerSettings.active_provider,
          manual_pix_key: providerSettings.manual_pix_key || null,
          manual_pix_copy_paste: providerSettings.manual_pix_copy_paste || null,
          manual_pix_display_name: providerSettings.manual_pix_display_name || null,
          manual_pix_instructions: providerSettings.manual_pix_instructions || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', true);
      if (error) throw new Error(error.message || 'Falha ao salvar provider');
      toast.success('Configuracao de provider salva.');
      await loadAdminData();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar provider');
    } finally {
      setSavingKey(null);
    }
  };

  const openProof = async (proof: ManualProofRow) => {
    try {
      const { data, error } = await supabase.storage.from('manual-pix-proofs').createSignedUrl(proof.file_path, 600);
      if (error || !data?.signedUrl) throw new Error(error?.message || 'Falha ao abrir comprovante');
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Erro ao abrir comprovante');
    }
  };

  const reviewProof = async (proofId: string, action: 'approve' | 'reject') => {
    setReviewingKey(`${action}:${proofId}`);
    try {
      const { data, error } = await supabase.functions.invoke('admin_approve_manual', {
        body: { proof_id: proofId, action },
      });
      if (error) throw new Error(error.message || 'Falha ao revisar comprovante');
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(action === 'approve' ? 'Comprovante aprovado.' : 'Comprovante rejeitado.');
      await loadAdminData();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Erro ao revisar comprovante');
    } finally {
      setReviewingKey(null);
    }
  };

  const ruleList = (rules: PricingRuleRow[], showClient = false) => (
    <div className="space-y-2">
      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma regra encontrada.</p>
      ) : (
        rules.map((rule) => {
          const client = showClient ? linkedClients.find((item) => item.id === rule.client_id) : null;
          return (
            <div key={rule.id} className="rounded-lg border border-border/70 bg-background/50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{productLabel(rule.product_key)}</p>
                <Badge variant={rule.active ? 'default' : 'outline'}>{rule.active ? 'ativo' : 'inativo'}</Badge>
                <Badge variant="outline">{rule.scope}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {formatCurrencyBRL(rule.price_cents, rule.currency)}
                {showClient && client ? ` - Cliente: ${client.name}${client.handle ? ` (${client.handle})` : ''}` : ''}
              </p>
              <p className="text-xs text-muted-foreground">Atualizado em {formatDateTime(rule.updated_at)}</p>
            </div>
          );
        })
      )}
    </div>
  );

  if (!profile) return null;
  if (!canAccess) {
    return (
      <Card className="glass-card">
        <CardHeader><CardTitle>Precificacao e Pagamentos</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Acesso restrito a profissionais e administradores.</CardContent>
      </Card>
    );
  }

  const defaultTab = isProfessional ? 'professional' : 'admin';

  return (
    <div className="space-y-6 pb-24 md:pb-8">
      <Card className="glass-card border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <WalletCards className="h-5 w-5 text-primary" />
            Precificacao e Pagamentos
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Configure precos, provider Pix e aprovacoes manuais.
        </CardContent>
      </Card>

      {loading ? (
        <Card className="glass-card"><CardContent className="py-8 text-sm text-muted-foreground">Carregando...</CardContent></Card>
      ) : (
        <Tabs defaultValue={defaultTab} className="space-y-4">
          <TabsList className={`grid h-auto w-full ${isProfessional && isAdmin ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {isProfessional ? <TabsTrigger value="professional" className="py-2">Profissional</TabsTrigger> : null}
            {isAdmin ? <TabsTrigger value="admin" className="py-2">Admin</TabsTrigger> : null}
          </TabsList>

          {isProfessional ? (
            <TabsContent value="professional" className="space-y-4 mt-0">
              <Card className="glass-card">
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Tags className="h-4 w-4" />Minha regra de preco</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Produto</Label>
                      <Select value={professionalForm.productKey} onValueChange={(value) => setProfessionalForm((prev) => ({ ...prev, productKey: value as PaymentProductKey }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{PAYMENT_PRODUCTS.map((product) => <SelectItem key={product.key} value={product.key}>{product.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Preco (BRL)</Label>
                      <Input value={professionalForm.priceInput} onChange={(e) => setProfessionalForm((prev) => ({ ...prev, priceInput: e.target.value }))} placeholder="99,90" />
                    </div>
                    <div className="flex items-center gap-2 pt-8">
                      <Switch checked={professionalForm.active} onCheckedChange={(checked) => setProfessionalForm((prev) => ({ ...prev, active: checked }))} />
                      <span className="text-sm">Ativa</span>
                    </div>
                  </div>
                  <Button type="button" variant="energy" disabled={savingKey === 'professional-form'} onClick={() => void saveRule('professional', profile.id, null, professionalForm, 'professional-form')}>
                    {savingKey === 'professional-form' ? 'Salvando...' : 'Salvar regra profissional'}
                  </Button>
                  {ruleList(myProfessionalRules)}
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader className="pb-3"><CardTitle className="text-base">Override por cliente vinculado</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {linkedClients.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum cliente vinculado ativo.</p>
                  ) : (
                    <>
                      <div className="grid gap-4 md:grid-cols-4">
                        <div className="space-y-2">
                          <Label>Cliente</Label>
                          <Select value={overrideClientId} onValueChange={setOverrideClientId}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{linkedClients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}{client.handle ? ` (${client.handle})` : ''}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Produto</Label>
                          <Select value={overrideForm.productKey} onValueChange={(value) => setOverrideForm((prev) => ({ ...prev, productKey: value as PaymentProductKey }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{PAYMENT_PRODUCTS.map((product) => <SelectItem key={product.key} value={product.key}>{product.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Preco (BRL)</Label>
                          <Input value={overrideForm.priceInput} onChange={(e) => setOverrideForm((prev) => ({ ...prev, priceInput: e.target.value }))} placeholder="79,90" />
                        </div>
                        <div className="flex items-center gap-2 pt-8">
                          <Switch checked={overrideForm.active} onCheckedChange={(checked) => setOverrideForm((prev) => ({ ...prev, active: checked }))} />
                          <span className="text-sm">Ativa</span>
                        </div>
                      </div>
                      <Button type="button" variant="outline" disabled={!overrideClientId || savingKey === 'override-form'} onClick={() => void saveRule('client_override', profile.id, overrideClientId, overrideForm, 'override-form')}>
                        {savingKey === 'override-form' ? 'Salvando...' : 'Salvar override'}
                      </Button>
                      {ruleList(myClientOverrides, true)}
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ) : null}

          {isAdmin ? (
            <TabsContent value="admin" className="space-y-4 mt-0">
              <Card className="glass-card">
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" />Preco global</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Produto</Label>
                      <Select value={globalForm.productKey} onValueChange={(value) => setGlobalForm((prev) => ({ ...prev, productKey: value as PaymentProductKey }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{PAYMENT_PRODUCTS.map((product) => <SelectItem key={product.key} value={product.key}>{product.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Preco (BRL)</Label>
                      <Input value={globalForm.priceInput} onChange={(e) => setGlobalForm((prev) => ({ ...prev, priceInput: e.target.value }))} placeholder="99,90" />
                    </div>
                    <div className="flex items-center gap-2 pt-8">
                      <Switch checked={globalForm.active} onCheckedChange={(checked) => setGlobalForm((prev) => ({ ...prev, active: checked }))} />
                      <span className="text-sm">Ativa</span>
                    </div>
                  </div>
                  <Button type="button" variant="energy" disabled={savingKey === 'global-form'} onClick={() => void saveRule('global', null, null, globalForm, 'global-form')}>
                    {savingKey === 'global-form' ? 'Salvando...' : 'Salvar regra global'}
                  </Button>
                  {ruleList(globalRules)}
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader className="pb-3"><CardTitle className="text-base">Provider Pix + fallback manual</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Provider ativo (DB)</Label>
                      <Select value={providerSettings.active_provider} onValueChange={(value) => setProviderSettings((prev) => ({ ...prev, active_provider: value as ProviderSettings['active_provider'] }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mercadopago">Mercado Pago</SelectItem>
                          <SelectItem value="manual">Manual</SelectItem>
                          <SelectItem value="pagarme">Pagar.me (fallback manual)</SelectItem>
                          <SelectItem value="efi">Efi (fallback manual)</SelectItem>
                          <SelectItem value="pagbank">PagBank (fallback manual)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Recebedor manual</Label>
                      <Input value={providerSettings.manual_pix_display_name || ''} onChange={(e) => setProviderSettings((prev) => ({ ...prev, manual_pix_display_name: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Chave Pix manual</Label>
                      <Input value={providerSettings.manual_pix_key || ''} onChange={(e) => setProviderSettings((prev) => ({ ...prev, manual_pix_key: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Copia e cola manual</Label>
                      <Input value={providerSettings.manual_pix_copy_paste || ''} onChange={(e) => setProviderSettings((prev) => ({ ...prev, manual_pix_copy_paste: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Instrucoes</Label>
                    <Textarea value={providerSettings.manual_pix_instructions || ''} onChange={(e) => setProviderSettings((prev) => ({ ...prev, manual_pix_instructions: e.target.value }))} rows={3} />
                  </div>
                  <div className="rounded-lg border border-border/70 bg-background/50 p-3 text-xs text-muted-foreground space-y-1">
                    <p>`PIX_PROVIDER` no ambiente tem prioridade sobre o valor salvo no banco.</p>
                    <p>Mercado Pago automatizado requer `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` e `PIX_WEBHOOK_URL`.</p>
                  </div>
                  <Button type="button" variant="outline" disabled={savingKey === 'provider'} onClick={() => void saveProviderSettings()}>
                    {savingKey === 'provider' ? 'Salvando...' : 'Salvar provider'}
                  </Button>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader className="pb-3"><CardTitle className="text-base">Comprovantes manuais pendentes</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {pendingProofs.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum comprovante pendente.</p> : pendingProofs.map((proof) => {
                    const order = recentOrders.find((item) => item.id === proof.order_id);
                    const client = order ? profilesById[order.client_id] : null;
                    const approveBusy = reviewingKey === `approve:${proof.id}`;
                    const rejectBusy = reviewingKey === `reject:${proof.id}`;
                    return (
                      <div key={proof.id} className="rounded-lg border border-border/70 bg-background/50 p-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{proof.status}</Badge>
                          <Badge variant="outline">{formatDateTime(proof.created_at)}</Badge>
                          {order ? <Badge variant="outline">{formatOrderStatus(order.status)}</Badge> : null}
                        </div>
                        <p className="text-sm">
                          {client?.name || order?.client_id || '-'} - {order ? `${productLabel(order.product_key)} (${formatCurrencyBRL(order.amount_cents, order.currency)})` : proof.order_id}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => void openProof(proof)}>Abrir</Button>
                          <Button type="button" size="sm" variant="energy" disabled={approveBusy || rejectBusy} onClick={() => void reviewProof(proof.id, 'approve')}>
                            {approveBusy ? 'Aprovando...' : 'Aprovar'}
                          </Button>
                          <Button type="button" size="sm" variant="outline" disabled={approveBusy || rejectBusy} onClick={() => void reviewProof(proof.id, 'reject')}>
                            {rejectBusy ? 'Rejeitando...' : 'Rejeitar'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader className="pb-3"><CardTitle className="text-base">Pedidos recentes</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {recentOrders.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum pedido encontrado.</p> : recentOrders.map((order) => (
                    <div key={order.id} className="rounded-lg border border-border/70 bg-background/50 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{productLabel(order.product_key)}</p>
                        <Badge variant={order.status === 'paid' ? 'default' : 'outline'}>{formatOrderStatus(order.status)}</Badge>
                        <Badge variant="outline">{order.provider}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrencyBRL(order.amount_cents, order.currency)} - {formatDateTime(order.created_at)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Cliente: {profilesById[order.client_id]?.name || order.client_id}
                        {order.professional_id ? ` | Profissional: ${profilesById[order.professional_id]?.name || order.professional_id}` : ''}
                        {order.paid_at ? ` | Pago em ${formatDateTime(order.paid_at)}` : ''}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
          ) : null}
        </Tabs>
      )}
    </div>
  );
}
