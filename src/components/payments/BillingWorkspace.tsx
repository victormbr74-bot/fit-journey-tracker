import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Copy, QrCode, Receipt, RefreshCcw, Upload, Wallet } from 'lucide-react';
import { toast } from 'sonner';

import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import {
  PAYMENT_PRODUCTS,
  PaymentProductKey,
  formatCountdown,
  formatCurrencyBRL,
  formatOrderStatus,
  isManualProvider,
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
import { Skeleton } from '@/components/ui/skeleton';

type LinkedProfessional = {
  id: string;
  name: string;
  handle: string | null;
  profile_type: string;
};

type OrderRow = {
  id: string;
  product_key: string;
  amount_cents: number;
  currency: string;
  status: string;
  provider: string;
  pix_copy_paste: string | null;
  pix_qr_image_url: string | null;
  expires_at: string | null;
  created_at: string;
  paid_at: string | null;
  professional_id: string | null;
};

type FeatureFlagRow = {
  id: string;
  feature_key: string;
  enabled: boolean;
};

type ManualProofRow = {
  id: string;
  file_path: string;
  status: 'submitted' | 'approved' | 'rejected';
  created_at: string;
};

type PricePreview = {
  product_key: string;
  price_cents: number;
  currency: string;
  source_scope: string;
  source_owner_id: string | null;
};

type CreatePixOrderResponse = {
  order_id: string;
  status: string;
  provider: string;
  amount_cents: number;
  currency: string;
  pix_copy_paste: string | null;
  pix_qr_image_url: string | null;
  expires_at: string | null;
  manual_pix: {
    key: string | null;
    copy_paste: string | null;
    display_name: string;
    instructions: string;
    proof_required: boolean;
  } | null;
};

const DB = supabase as any;
const GLOBAL_OPTION_VALUE = '__global__';

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
};

const getPriceSourceLabel = (scope: string | null | undefined) => {
  if (scope === 'client_override') return 'Preco customizado para voce';
  if (scope === 'professional') return 'Preco do profissional';
  if (scope === 'global') return 'Preco global';
  return 'Preco';
};

export function BillingWorkspace() {
  const { profile, refetch } = useProfile();
  const [loadingBaseData, setLoadingBaseData] = useState(true);
  const [linkedProfessionals, setLinkedProfessionals] = useState<LinkedProfessional[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlagRow[]>([]);
  const [manualProofs, setManualProofs] = useState<ManualProofRow[]>([]);
  const [selectedProductKey, setSelectedProductKey] = useState<PaymentProductKey>('personal_package');
  const [selectedProfessionalValue, setSelectedProfessionalValue] = useState<string>(GLOBAL_OPTION_VALUE);
  const [pricePreview, setPricePreview] = useState<PricePreview | null>(null);
  const [pricePreviewLoading, setPricePreviewLoading] = useState(false);
  const [pricePreviewError, setPricePreviewError] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<OrderRow | null>(null);
  const [activeOrderManualInfo, setActiveOrderManualInfo] = useState<CreatePixOrderResponse['manual_pix']>(null);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [refreshingOrderStatus, setRefreshingOrderStatus] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [countdownTick, setCountdownTick] = useState(0);
  const proofInputRef = useRef<HTMLInputElement | null>(null);

  const selectedProfessionalId =
    selectedProfessionalValue === GLOBAL_OPTION_VALUE ? null : selectedProfessionalValue;

  const sortedOrders = useMemo(
    () =>
      [...orders].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [orders]
  );

  const activeOrderCountdown = useMemo(
    () => formatCountdown(activeOrder?.expires_at || null),
    [activeOrder?.expires_at, countdownTick]
  );

  const selectedProduct = useMemo(
    () => PAYMENT_PRODUCTS.find((product) => product.key === selectedProductKey) || PAYMENT_PRODUCTS[0],
    [selectedProductKey]
  );

  const loadLinkedProfessionals = async (profileId: string) => {
    const { data: links, error: linksError } = await DB
      .from('professional_client_links')
      .select('professional_id, status')
      .eq('client_id', profileId)
      .eq('status', 'active');

    if (linksError) {
      throw new Error(linksError.message || 'Falha ao carregar vinculos');
    }

    const professionalIds = Array.from(
      new Set(
        (Array.isArray(links) ? links : [])
          .map((row: { professional_id?: string | null }) => row.professional_id || null)
          .filter((value: string | null): value is string => Boolean(value))
      )
    );

    if (professionalIds.length === 0) {
      setLinkedProfessionals([]);
      return;
    }

    const { data: professionals, error: professionalsError } = await DB
      .from('profiles')
      .select('id, name, handle, profile_type')
      .in('id', professionalIds);

    if (professionalsError) {
      throw new Error(professionalsError.message || 'Falha ao carregar profissionais');
    }

    const rows = (Array.isArray(professionals) ? professionals : []) as LinkedProfessional[];
    setLinkedProfessionals(
      rows.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'))
    );
  };

  const loadOrders = async (profileId: string) => {
    const { data, error } = await DB
      .from('orders')
      .select(
        'id, product_key, amount_cents, currency, status, provider, pix_copy_paste, pix_qr_image_url, expires_at, created_at, paid_at, professional_id'
      )
      .eq('client_id', profileId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      throw new Error(error.message || 'Falha ao carregar pedidos');
    }

    const rows = (Array.isArray(data) ? data : []) as OrderRow[];
    setOrders(rows);

    setActiveOrder((previous) => {
      if (previous) {
        const updated = rows.find((row) => row.id === previous.id);
        if (updated) return updated;
      }
      return rows.find((row) => row.status === 'pending' || row.status === 'manual_review') || previous || null;
    });
  };

  const loadFeatureFlags = async (profileId: string) => {
    const { data, error } = await DB
      .from('client_feature_flags')
      .select('id, feature_key, enabled')
      .eq('client_id', profileId)
      .eq('enabled', true)
      .order('feature_key', { ascending: true });

    if (error) {
      throw new Error(error.message || 'Falha ao carregar feature flags');
    }

    setFeatureFlags((Array.isArray(data) ? data : []) as FeatureFlagRow[]);
  };

  const loadManualProofs = async (orderId: string) => {
    const { data, error } = await DB
      .from('manual_pix_proofs')
      .select('id, file_path, status, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message || 'Falha ao carregar comprovantes');
    }

    setManualProofs((Array.isArray(data) ? data : []) as ManualProofRow[]);
  };

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;

    const run = async () => {
      setLoadingBaseData(true);
      try {
        await Promise.all([
          loadLinkedProfessionals(profile.id),
          loadOrders(profile.id),
          loadFeatureFlags(profile.id),
        ]);
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          toast.error(error instanceof Error ? error.message : 'Falha ao carregar pagamentos');
        }
      } finally {
        if (!cancelled) {
          setLoadingBaseData(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  useEffect(() => {
    let mounted = true;
    if (!profile?.id) return;

    const loadPrice = async () => {
      setPricePreviewLoading(true);
      setPricePreviewError(null);

      const { data, error } = await DB.rpc('get_effective_product_price', {
        p_product_key: selectedProductKey,
        p_professional_id: selectedProfessionalId,
      });

      if (!mounted) return;

      if (error) {
        setPricePreview(null);
        setPricePreviewError(error.message || 'Nao foi possivel calcular o preco');
        setPricePreviewLoading(false);
        return;
      }

      const row = (Array.isArray(data) ? data[0] : data) as PricePreview | undefined;
      setPricePreview(row || null);
      setPricePreviewLoading(false);
    };

    void loadPrice();
    return () => {
      mounted = false;
    };
  }, [profile?.id, selectedProductKey, selectedProfessionalId]);

  useEffect(() => {
    if (!activeOrder || activeOrder.status !== 'pending' || !activeOrder.expires_at) return;

    const intervalId = window.setInterval(() => {
      setCountdownTick((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [activeOrder]);

  useEffect(() => {
    if (!activeOrder || !isManualProvider(activeOrder.provider)) {
      setManualProofs([]);
      return;
    }

    void loadManualProofs(activeOrder.id).catch((error) => {
      console.error(error);
    });
  }, [activeOrder?.id, activeOrder?.provider]);

  const handleGeneratePix = async () => {
    if (!profile?.id) return;
    setCreatingOrder(true);

    try {
      const { data, error } = await supabase.functions.invoke('create_pix_order', {
        body: {
          product_key: selectedProductKey,
          professional_id: selectedProfessionalId,
        },
      });

      if (error) {
        throw new Error(error.message || 'Falha ao gerar Pix');
      }

      const payload = data as CreatePixOrderResponse;
      if (!payload?.order_id) {
        throw new Error('Resposta invalida ao gerar Pix');
      }

      const nextOrder: OrderRow = {
        id: payload.order_id,
        product_key: selectedProductKey,
        amount_cents: payload.amount_cents,
        currency: payload.currency || 'BRL',
        status: payload.status,
        provider: payload.provider,
        pix_copy_paste: payload.pix_copy_paste,
        pix_qr_image_url: payload.pix_qr_image_url,
        expires_at: payload.expires_at,
        created_at: new Date().toISOString(),
        paid_at: null,
        professional_id: selectedProfessionalId,
      };

      setActiveOrder(nextOrder);
      setActiveOrderManualInfo(payload.manual_pix || null);
      setProofFile(null);
      if (proofInputRef.current) {
        proofInputRef.current.value = '';
      }
      toast.success('Pedido Pix gerado com sucesso.');

      await loadOrders(profile.id);
      if (payload.provider === 'manual') {
        await loadManualProofs(payload.order_id);
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Nao foi possivel gerar o Pix');
    } finally {
      setCreatingOrder(false);
    }
  };

  const handleCopyPix = async () => {
    if (!activeOrder?.pix_copy_paste) return;
    try {
      await navigator.clipboard.writeText(activeOrder.pix_copy_paste);
      toast.success('Codigo Pix copiado.');
    } catch (error) {
      console.error(error);
      toast.error('Nao foi possivel copiar o codigo Pix.');
    }
  };

  const handleRefreshOrderStatus = async () => {
    if (!profile?.id || !activeOrder?.id) return;
    setRefreshingOrderStatus(true);

    try {
      const { data, error } = await DB
        .from('orders')
        .select(
          'id, product_key, amount_cents, currency, status, provider, pix_copy_paste, pix_qr_image_url, expires_at, created_at, paid_at, professional_id'
        )
        .eq('id', activeOrder.id)
        .eq('client_id', profile.id)
        .maybeSingle();

      if (error) {
        throw new Error(error.message || 'Falha ao consultar pedido');
      }
      if (!data) {
        throw new Error('Pedido nao encontrado');
      }

      const nextOrder = data as OrderRow;
      setActiveOrder(nextOrder);

      await Promise.all([
        loadOrders(profile.id),
        nextOrder.status === 'paid'
          ? Promise.all([refetch.profile(), loadFeatureFlags(profile.id)]).then(() => undefined)
          : Promise.resolve(),
      ]);

      if (isManualProvider(nextOrder.provider)) {
        await loadManualProofs(nextOrder.id);
      }

      if (nextOrder.status === 'paid') {
        toast.success('Pagamento confirmado.');
      } else {
        toast.message(`Status atual: ${formatOrderStatus(nextOrder.status)}`);
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Nao foi possivel atualizar o status');
    } finally {
      setRefreshingOrderStatus(false);
    }
  };

  const handleProofFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setProofFile(file);
  };

  const handleSubmitManualProof = async () => {
    if (!profile?.id || !activeOrder || !isManualProvider(activeOrder.provider)) return;
    if (!proofFile) {
      toast.error('Selecione um comprovante para enviar.');
      return;
    }

    setUploadingProof(true);
    try {
      const safeName = proofFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${profile.id}/${activeOrder.id}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('manual-pix-proofs')
        .upload(filePath, proofFile, {
          upsert: false,
          contentType: proofFile.type || 'application/octet-stream',
        });

      if (uploadError) {
        throw new Error(uploadError.message || 'Falha ao enviar comprovante');
      }

      const { error: insertProofError } = await DB.from('manual_pix_proofs').insert({
        order_id: activeOrder.id,
        uploaded_by: profile.id,
        file_path: filePath,
        status: 'submitted',
      });

      if (insertProofError) {
        throw new Error(insertProofError.message || 'Falha ao registrar comprovante');
      }

      toast.success('Comprovante enviado para aprovacao.');
      setProofFile(null);
      if (proofInputRef.current) {
        proofInputRef.current.value = '';
      }
      await loadManualProofs(activeOrder.id);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Nao foi possivel enviar o comprovante');
    } finally {
      setUploadingProof(false);
    }
  };

  const openProofFile = async (proof: ManualProofRow) => {
    try {
      const { data, error } = await supabase.storage
        .from('manual-pix-proofs')
        .createSignedUrl(proof.file_path, 60 * 10);

      if (error || !data?.signedUrl) {
        throw new Error(error?.message || 'Falha ao abrir comprovante');
      }

      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Nao foi possivel abrir o comprovante');
    }
  };

  const linkedProfessionalOptions = useMemo(() => {
    return linkedProfessionals;
  }, [linkedProfessionals]);

  const entitlementBadges = useMemo(() => {
    const badges: Array<{ label: string; active: boolean }> = [
      { label: 'Pacote Personal', active: Boolean(profile?.has_personal_package) },
      { label: 'Pacote Nutricionista', active: Boolean(profile?.has_nutritionist_package) },
    ];

    for (const flag of featureFlags) {
      badges.push({
        label: flag.feature_key,
        active: Boolean(flag.enabled),
      });
    }
    return badges;
  }, [featureFlags, profile?.has_nutritionist_package, profile?.has_personal_package]);

  if (!profile) return null;

  return (
    <div className="space-y-6 pb-24 md:pb-8">
      <Card className="glass-card border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Wallet className="h-5 w-5 text-primary" />
            Assinatura e Pagamentos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Gere um Pix dinamico para ativar pacotes e features. A confirmacao ocorre automaticamente via webhook.
          </p>
          <div className="flex flex-wrap gap-2">
            {entitlementBadges.map((badge) => (
              <Badge key={badge.label} variant={badge.active ? 'default' : 'outline'}>
                {badge.label}: {badge.active ? 'ativo' : 'inativo'}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <QrCode className="h-4 w-4" />
            Gerar Pix
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingBaseData ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="billing-product">Produto</Label>
                  <Select
                    value={selectedProductKey}
                    onValueChange={(value) => setSelectedProductKey(value as PaymentProductKey)}
                  >
                    <SelectTrigger id="billing-product">
                      <SelectValue placeholder="Selecione um produto" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_PRODUCTS.map((product) => (
                        <SelectItem key={product.key} value={product.key}>
                          {product.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{selectedProduct.description}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="billing-professional">Profissional (opcional)</Label>
                  <Select
                    value={
                      selectedProfessionalValue !== GLOBAL_OPTION_VALUE &&
                      !linkedProfessionalOptions.some((professional) => professional.id === selectedProfessionalValue)
                        ? GLOBAL_OPTION_VALUE
                        : selectedProfessionalValue
                    }
                    onValueChange={setSelectedProfessionalValue}
                  >
                    <SelectTrigger id="billing-professional">
                      <SelectValue placeholder="Sem profissional (preco global)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={GLOBAL_OPTION_VALUE}>Sem profissional (preco global)</SelectItem>
                      {linkedProfessionalOptions.map((professional) => (
                        <SelectItem key={professional.id} value={professional.id}>
                          {professional.name}
                          {professional.handle ? ` (${professional.handle})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Mostra preco global, do profissional, ou override custom para voce.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background/50 p-4">
                {pricePreviewLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-56" />
                  </div>
                ) : pricePreview ? (
                  <div className="space-y-1">
                    <p className="text-lg font-semibold">
                      {formatCurrencyBRL(pricePreview.price_cents, pricePreview.currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {getPriceSourceLabel(pricePreview.source_scope)}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {pricePreviewError || 'Nao foi possivel resolver o preco para este produto.'}
                  </p>
                )}
              </div>

              <Button
                type="button"
                variant="energy"
                onClick={handleGeneratePix}
                disabled={creatingOrder || pricePreviewLoading || !pricePreview}
                className="gap-2"
              >
                <QrCode className="h-4 w-4" />
                {creatingOrder ? 'Gerando Pix...' : 'Gerar Pix'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {activeOrder && (
        <Card className="glass-card border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Receipt className="h-4 w-4" />
              Pedido ativo
              <Badge variant={activeOrder.status === 'paid' ? 'default' : 'outline'}>
                {formatOrderStatus(activeOrder.status)}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">{formatCurrencyBRL(activeOrder.amount_cents, activeOrder.currency)}</Badge>
              <Badge variant="outline">Provider: {activeOrder.provider}</Badge>
              <Badge variant="outline">Criado em {formatDateTime(activeOrder.created_at)}</Badge>
              {activeOrder.paid_at ? (
                <Badge variant="outline">Pago em {formatDateTime(activeOrder.paid_at)}</Badge>
              ) : null}
            </div>

            {activeOrder.status !== 'paid' && activeOrderCountdown ? (
              <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-sm">
                Expiracao: <span className="font-medium">{activeOrderCountdown}</span>
              </div>
            ) : null}

            {activeOrder.pix_qr_image_url ? (
              <div className="rounded-xl border border-border/70 bg-white p-3">
                <img
                  src={activeOrder.pix_qr_image_url}
                  alt="QR Code Pix"
                  className="mx-auto w-full max-w-[280px] rounded-md"
                />
              </div>
            ) : null}

            {activeOrder.pix_copy_paste ? (
              <div className="space-y-2">
                <Label htmlFor="pix-copy-paste">Pix copia e cola</Label>
                <Input
                  id="pix-copy-paste"
                  value={activeOrder.pix_copy_paste}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button type="button" variant="outline" onClick={handleCopyPix} className="gap-2">
                  <Copy className="h-4 w-4" />
                  Copiar codigo
                </Button>
              </div>
            ) : null}

            {isManualProvider(activeOrder.provider) && (
              <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="text-sm font-medium">Pix Manual (fallback)</p>
                <p className="text-xs text-muted-foreground">
                  {activeOrderManualInfo?.instructions ||
                    'Pague usando a chave/copia e cola acima e envie o comprovante para aprovacao do admin.'}
                </p>
                {activeOrderManualInfo?.display_name ? (
                  <p className="text-xs text-muted-foreground">
                    Recebedor: {activeOrderManualInfo.display_name}
                  </p>
                ) : null}
                {activeOrderManualInfo?.key ? (
                  <p className="text-xs text-muted-foreground break-all">
                    Chave Pix: {activeOrderManualInfo.key}
                  </p>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="manual-proof">Comprovante</Label>
                  <Input
                    id="manual-proof"
                    ref={proofInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleProofFileChange}
                  />
                  {proofFile ? (
                    <p className="text-xs text-muted-foreground">
                      Arquivo selecionado: {proofFile.name}
                    </p>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={handleSubmitManualProof}
                    disabled={uploadingProof}
                  >
                    <Upload className="h-4 w-4" />
                    {uploadingProof ? 'Enviando comprovante...' : 'Enviar comprovante'}
                  </Button>
                </div>

                {manualProofs.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Comprovantes enviados</p>
                    {manualProofs.map((proof) => (
                      <div
                        key={proof.id}
                        className="flex flex-col gap-2 rounded-lg border border-border/70 bg-background/60 p-3 md:flex-row md:items-center md:justify-between"
                      >
                        <div className="space-y-1">
                          <p className="text-sm">{proof.file_path.split('/').pop() || proof.file_path}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(proof.created_at)}
                          </p>
                          <Badge variant={proof.status === 'approved' ? 'default' : 'outline'}>
                            {proof.status}
                          </Badge>
                        </div>
                        <Button type="button" size="sm" variant="outline" onClick={() => openProofFile(proof)}>
                          Abrir
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleRefreshOrderStatus}
                disabled={refreshingOrderStatus}
                className="gap-2"
              >
                <RefreshCcw className="h-4 w-4" />
                {refreshingOrderStatus ? 'Atualizando...' : 'Ja paguei (revalidar status)'}
              </Button>
              {activeOrder.status === 'paid' ? (
                <Badge className="gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Liberado
                </Badge>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Historico de pedidos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sortedOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum pedido encontrado.</p>
          ) : (
            sortedOrders.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => {
                  setActiveOrder(order);
                  if (!isManualProvider(order.provider)) {
                    setActiveOrderManualInfo(null);
                  }
                }}
                className="w-full rounded-xl border border-border/70 bg-background/50 p-4 text-left transition-colors hover:border-primary/40"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">
                    {PAYMENT_PRODUCTS.find((product) => product.key === order.product_key)?.label || order.product_key}
                  </p>
                  <Badge variant={order.status === 'paid' ? 'default' : 'outline'}>
                    {formatOrderStatus(order.status)}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatCurrencyBRL(order.amount_cents, order.currency)} - {order.provider} - {formatDateTime(order.created_at)}
                </p>
              </button>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
