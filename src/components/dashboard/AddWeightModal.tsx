import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProfile } from '@/hooks/useProfile';
import { ASSISTANT_BODY_COMPOSITION_STORAGE_PREFIX } from '@/lib/storageKeys';
import { FileText, Loader2, Plus, Ruler, Scale, Upload } from 'lucide-react';
import { toast } from 'sonner';

interface AddWeightModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type MeasurementMode = 'none' | 'skinfold' | 'bioimpedance_pdf';
type SkinfoldSex = 'male' | 'female';
type BioimpedanceSource = 'app' | 'clinic';

const skinfoldFields = [
  { id: 'chest', label: 'Peitoral' },
  { id: 'midaxillary', label: 'Axilar media' },
  { id: 'triceps', label: 'Triceps' },
  { id: 'subscapular', label: 'Subescapular' },
  { id: 'abdomen', label: 'Abdomen' },
  { id: 'suprailiac', label: 'Suprailiaca' },
  { id: 'thigh', label: 'Coxa' },
] as const;

type SkinfoldFieldId = (typeof skinfoldFields)[number]['id'];
type SkinfoldValues = Record<SkinfoldFieldId, number>;

interface SkinfoldFormState {
  sex: SkinfoldSex;
  weightKg: string;
  chest: string;
  midaxillary: string;
  triceps: string;
  subscapular: string;
  abdomen: string;
  suprailiac: string;
  thigh: string;
}

interface SkinfoldHistoryEntry {
  id: string;
  type: 'skinfold';
  createdAt: string;
  sex: SkinfoldSex;
  weightKg: number;
  age: number;
  foldsMm: SkinfoldValues;
  sumMm: number;
  bodyDensity: number;
  bodyFatPercent: number;
  fatMassKg: number;
  leanMassKg: number;
}

interface BioimpedanceMetric {
  label: string;
  value: string;
}

interface BioimpedancePdfHistoryEntry {
  id: string;
  type: 'bioimpedance_pdf';
  createdAt: string;
  source: BioimpedanceSource;
  fileName: string;
  fileSize: number;
  summary: string;
  metrics: BioimpedanceMetric[];
}

type BodyCompositionHistoryEntry = SkinfoldHistoryEntry | BioimpedancePdfHistoryEntry;

const nowIso = () => new Date().toISOString();

const buildDefaultSkinfoldForm = (weight = 0): SkinfoldFormState => ({
  sex: 'male',
  weightKg: weight > 0 ? weight.toString() : '',
  chest: '',
  midaxillary: '',
  triceps: '',
  subscapular: '',
  abdomen: '',
  suprailiac: '',
  thigh: '',
});

const parsePositiveDecimal = (value: string): number | null => {
  const cleaned = value.replace(',', '.').trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const roundTo = (value: number, digits: number) => Number(value.toFixed(digits));

const getSkinfoldValuesFromForm = (form: SkinfoldFormState): SkinfoldValues | null => {
  const folds: Partial<SkinfoldValues> = {};

  for (const field of skinfoldFields) {
    const parsedValue = parsePositiveDecimal(form[field.id]);
    if (parsedValue === null) return null;
    folds[field.id] = parsedValue;
  }

  return folds as SkinfoldValues;
};

const calculateSkinfoldBodyComposition = ({
  sex,
  age,
  weightKg,
  foldsMm,
}: {
  sex: SkinfoldSex;
  age: number;
  weightKg: number;
  foldsMm: SkinfoldValues;
}) => {
  const foldsArray = Object.values(foldsMm);
  const sumMm = foldsArray.reduce((sum, fold) => sum + fold, 0);
  const sumSquared = sumMm * sumMm;
  const safeAge = Math.max(10, Math.min(99, age));

  const bodyDensity =
    sex === 'male'
      ? 1.112 - 0.00043499 * sumMm + 0.00000055 * sumSquared - 0.00028826 * safeAge
      : 1.097 - 0.00046971 * sumMm + 0.00000056 * sumSquared - 0.00012828 * safeAge;

  const bodyFatPercent = Math.max(2, Math.min(60, (495 / bodyDensity) - 450));
  const fatMassKg = weightKg * (bodyFatPercent / 100);
  const leanMassKg = Math.max(0, weightKg - fatMassKg);

  return {
    sumMm: roundTo(sumMm, 1),
    bodyDensity: roundTo(bodyDensity, 4),
    bodyFatPercent: roundTo(bodyFatPercent, 1),
    fatMassKg: roundTo(fatMassKg, 1),
    leanMassKg: roundTo(leanMassKg, 1),
  };
};

const extractTextFromPdfFile = async (file: File): Promise<string> => {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const fileBuffer = await file.arrayBuffer();
  const loadingTask = getDocument({
    data: new Uint8Array(fileBuffer),
    disableWorker: true,
    isEvalSupported: false,
  });
  const pdfDocument = await loadingTask.promise;
  const maxPages = Math.min(pdfDocument.numPages, 25);
  const pageTexts: string[] = [];
  let totalLength = 0;

  for (let pageIndex = 1; pageIndex <= maxPages; pageIndex += 1) {
    const page = await pdfDocument.getPage(pageIndex);
    const textContent = await page.getTextContent();
    const pageText = (textContent.items as Array<{ str?: string }>)
      .map((item) => item.str || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!pageText) continue;

    pageTexts.push(pageText);
    totalLength += pageText.length;
    if (totalLength >= 20000) break;
  }

  return pageTexts.join('\n').trim();
};

const parseBioimpedanceMetrics = (reportText: string): BioimpedanceMetric[] => {
  const compact = reportText.replace(/\s+/g, ' ').trim();
  const metrics: BioimpedanceMetric[] = [];

  const pushMetric = (label: string, value: string | null, unit?: string) => {
    if (!value) return;
    const normalizedValue = value.replace(',', '.');
    metrics.push({
      label,
      value: unit ? `${normalizedValue} ${unit}` : normalizedValue,
    });
  };

  pushMetric(
    'Peso',
    compact.match(/(?:peso|weight)\s*[:-]?\s*(\d{2,3}(?:[.,]\d+)?)/i)?.[1] || null,
    'kg'
  );
  pushMetric(
    '% Gordura corporal',
    compact.match(/(?:gordura corporal|body fat|pbf)\s*[:-]?\s*(\d{1,2}(?:[.,]\d+)?)\s*%/i)?.[1] || null,
    '%'
  );
  pushMetric(
    'Massa muscular',
    compact.match(/(?:massa muscular|skeletal muscle)\s*[:-]?\s*(\d{1,3}(?:[.,]\d+)?)/i)?.[1] || null,
    'kg'
  );
  pushMetric(
    'Massa magra',
    compact.match(/(?:massa magra|lean mass|ffm)\s*[:-]?\s*(\d{1,3}(?:[.,]\d+)?)/i)?.[1] || null,
    'kg'
  );
  pushMetric(
    'IMC',
    compact.match(/(?:imc|bmi)\s*[:-]?\s*(\d{1,2}(?:[.,]\d+)?)/i)?.[1] || null
  );
  pushMetric(
    'Agua corporal',
    compact.match(/(?:agua corporal|body water|tbw)\s*[:-]?\s*(\d{1,2}(?:[.,]\d+)?)\s*%/i)?.[1] || null,
    '%'
  );
  pushMetric(
    'Gordura visceral',
    compact.match(/(?:gordura visceral|visceral fat)\s*[:-]?\s*(\d{1,2}(?:[.,]\d+)?)/i)?.[1] || null
  );
  pushMetric(
    'TMB',
    compact.match(/(?:taxa metabolica basal|metabolismo basal|bmr|tmb)\s*[:-]?\s*(\d{3,5})/i)?.[1] || null,
    'kcal'
  );

  return metrics.slice(0, 8);
};

const buildBioimpedanceSummary = (source: BioimpedanceSource, metrics: BioimpedanceMetric[]): string => {
  const sourceLabel = source === 'clinic' ? 'clinica' : 'app';
  if (metrics.length === 0) {
    return `PDF de bioimpedancia (${sourceLabel}) lido, mas sem metricas estruturadas automaticamente.`;
  }

  const highlights = metrics.slice(0, 4).map((metric) => `${metric.label}: ${metric.value}`);
  return `PDF de bioimpedancia (${sourceLabel}) analisado. Destaques: ${highlights.join(' | ')}.`;
};

const parseBodyCompositionHistory = (value: string | null): BodyCompositionHistoryEntry[] => {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is BodyCompositionHistoryEntry => {
        if (!entry || typeof entry !== 'object') return false;
        const candidate = entry as Partial<BodyCompositionHistoryEntry>;
        if (typeof candidate.id !== 'string') return false;
        return candidate.type === 'skinfold' || candidate.type === 'bioimpedance_pdf';
      })
      .slice(0, 30);
  } catch {
    return [];
  }
};

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatFileSize = (value: number) => {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
};

export function AddWeightModal({ isOpen, onClose }: AddWeightModalProps) {
  const { addWeightEntry, profile } = useProfile();

  const [weight, setWeight] = useState('');
  const [measurementMode, setMeasurementMode] = useState<MeasurementMode>('none');
  const [skinfoldForm, setSkinfoldForm] = useState<SkinfoldFormState>(() =>
    buildDefaultSkinfoldForm(profile?.weight || 0)
  );
  const [bioimpedanceSource, setBioimpedanceSource] = useState<BioimpedanceSource>('app');
  const [bioimpedancePdf, setBioimpedancePdf] = useState<File | null>(null);
  const [recentEntries, setRecentEntries] = useState<BodyCompositionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const bioimpedancePdfInputRef = useRef<HTMLInputElement | null>(null);

  const bodyCompositionStorageKey = useMemo(
    () => (profile ? `${ASSISTANT_BODY_COMPOSITION_STORAGE_PREFIX}${profile.id}` : ''),
    [profile]
  );

  useEffect(() => {
    if (!isOpen) return;

    if (profile?.weight && !weight) {
      setWeight(profile.weight.toString());
      setSkinfoldForm((current) => ({ ...current, weightKg: profile.weight.toString() }));
    }

    if (!bodyCompositionStorageKey) {
      setRecentEntries([]);
      return;
    }

    const stored = window.localStorage.getItem(bodyCompositionStorageKey);
    const parsed = parseBodyCompositionHistory(stored).slice(0, 3);
    setRecentEntries(parsed);
  }, [isOpen, profile?.weight, weight, bodyCompositionStorageKey]);

  const updateSkinfoldField = (field: keyof SkinfoldFormState, value: string) => {
    setSkinfoldForm((current) => ({ ...current, [field]: value }));
  };

  const appendBodyCompositionEntry = (entry: BodyCompositionHistoryEntry) => {
    if (!bodyCompositionStorageKey) return;

    const current = parseBodyCompositionHistory(window.localStorage.getItem(bodyCompositionStorageKey));
    const next = [entry, ...current].slice(0, 30);
    window.localStorage.setItem(bodyCompositionStorageKey, JSON.stringify(next));
    setRecentEntries(next.slice(0, 3));
  };

  const handleBioimpedancePdfSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      toast.error('Selecione um arquivo PDF valido.');
      return;
    }

    setBioimpedancePdf(file);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsedWeight = parsePositiveDecimal(weight);
    if (parsedWeight === null) {
      toast.error('Por favor, insira um peso valido.');
      return;
    }

    const age = profile?.age && profile.age > 0 ? profile.age : 25;

    let validatedFolds: SkinfoldValues | null = null;
    if (measurementMode === 'skinfold') {
      validatedFolds = getSkinfoldValuesFromForm(skinfoldForm);
      if (!validatedFolds) {
        toast.error('Preencha as 7 dobras cutaneas com valores validos em mm.');
        return;
      }
    }

    if (measurementMode === 'bioimpedance_pdf' && !bioimpedancePdf) {
      toast.error('Selecione um PDF de bioimpedancia para analisar.');
      return;
    }

    setLoading(true);
    const { error } = await addWeightEntry(parsedWeight);

    if (error) {
      toast.error('Erro ao registrar peso.');
      setLoading(false);
      return;
    }

    let measurementMessage = '';

    try {
      if (measurementMode === 'skinfold' && validatedFolds) {
        const calculation = calculateSkinfoldBodyComposition({
          sex: skinfoldForm.sex,
          age,
          weightKg: parsedWeight,
          foldsMm: validatedFolds,
        });

        const entry: SkinfoldHistoryEntry = {
          id: crypto.randomUUID(),
          type: 'skinfold',
          createdAt: nowIso(),
          sex: skinfoldForm.sex,
          weightKg: parsedWeight,
          age,
          foldsMm: validatedFolds,
          sumMm: calculation.sumMm,
          bodyDensity: calculation.bodyDensity,
          bodyFatPercent: calculation.bodyFatPercent,
          fatMassKg: calculation.fatMassKg,
          leanMassKg: calculation.leanMassKg,
        };

        appendBodyCompositionEntry(entry);
        measurementMessage = ` Dobras: ${entry.bodyFatPercent}% gordura, ${entry.leanMassKg}kg massa magra.`;
      }

      if (measurementMode === 'bioimpedance_pdf' && bioimpedancePdf) {
        const extractedText = await extractTextFromPdfFile(bioimpedancePdf);
        if (extractedText.length < 80) {
          throw new Error('Nao foi possivel extrair texto util do PDF.');
        }

        const metrics = parseBioimpedanceMetrics(extractedText);
        const summary = buildBioimpedanceSummary(bioimpedanceSource, metrics);

        const entry: BioimpedancePdfHistoryEntry = {
          id: crypto.randomUUID(),
          type: 'bioimpedance_pdf',
          createdAt: nowIso(),
          source: bioimpedanceSource,
          fileName: bioimpedancePdf.name,
          fileSize: bioimpedancePdf.size,
          summary,
          metrics,
        };

        appendBodyCompositionEntry(entry);
        measurementMessage = ' PDF de bioimpedancia analisado e salvo.';
      }

      toast.success(`Peso registrado! +10 pontos.${measurementMessage}`);
    } catch (measurementError) {
      console.error('Erro ao salvar medidas no registro de peso:', measurementError);
      toast.warning('Peso registrado, mas nao foi possivel salvar as medidas selecionadas.');
    } finally {
      setLoading(false);
      setWeight('');
      setMeasurementMode('none');
      setBioimpedancePdf(null);
      setSkinfoldForm(buildDefaultSkinfoldForm(profile?.weight || 0));
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-primary" />
            Registrar Peso e Medidas
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {profile && (
            <p className="text-sm text-muted-foreground">
              Peso atual: <span className="text-foreground font-medium">{profile.weight} kg</span>
            </p>
          )}

          <div className="relative">
            <Input
              type="number"
              placeholder="Seu peso atual"
              value={weight}
              onChange={(event) => {
                setWeight(event.target.value);
                if (measurementMode === 'skinfold') {
                  updateSkinfoldField('weightKg', event.target.value);
                }
              }}
              className="text-center text-2xl h-16 pr-12"
              min="1"
              step="0.1"
              autoFocus
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">kg</span>
          </div>

          <Tabs value={measurementMode} onValueChange={(value) => setMeasurementMode(value as MeasurementMode)}>
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="none">Sem medidas</TabsTrigger>
              <TabsTrigger value="skinfold">Dobras cutaneas</TabsTrigger>
              <TabsTrigger value="bioimpedance_pdf">PDF bioimpedancia</TabsTrigger>
            </TabsList>

            <TabsContent value="none" className="mt-4 rounded-xl border border-border/70 bg-secondary/20 p-4 text-sm text-muted-foreground">
              Registra somente o peso agora. Se quiser, selecione um dos modos acima para incluir medidas no mesmo momento.
            </TabsContent>

            <TabsContent value="skinfold" className="mt-4 rounded-xl border border-border/70 bg-secondary/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Ruler className="w-4 h-4 text-primary" />
                <p className="font-medium text-sm">Dobras cutaneas (7 pontos)</p>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={skinfoldForm.sex === 'male' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => updateSkinfoldField('sex', 'male')}
                >
                  Masculino
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={skinfoldForm.sex === 'female' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => updateSkinfoldField('sex', 'female')}
                >
                  Feminino
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {skinfoldFields.map((field) => (
                  <div key={field.id} className="space-y-1">
                    <p className="text-xs text-muted-foreground">{field.label} (mm)</p>
                    <Input
                      type="number"
                      step="0.1"
                      min="1"
                      value={skinfoldForm[field.id]}
                      onChange={(event) => updateSkinfoldField(field.id, event.target.value)}
                      placeholder="0.0"
                    />
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="bioimpedance_pdf" className="mt-4 rounded-xl border border-border/70 bg-secondary/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                <p className="font-medium text-sm">Analise de bioimpedancia por PDF</p>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={bioimpedanceSource === 'app' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setBioimpedanceSource('app')}
                >
                  App
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={bioimpedanceSource === 'clinic' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setBioimpedanceSource('clinic')}
                >
                  Clinica
                </Button>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => bioimpedancePdfInputRef.current?.click()}
                disabled={loading}
              >
                <Upload className="w-4 h-4" />
                Selecionar PDF
              </Button>
              <input
                ref={bioimpedancePdfInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleBioimpedancePdfSelected}
              />

              {bioimpedancePdf ? (
                <div className="rounded-lg border border-border bg-background/70 p-2 text-xs">
                  <p className="font-medium">{bioimpedancePdf.name}</p>
                  <p className="text-muted-foreground">{formatFileSize(bioimpedancePdf.size)}</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhum arquivo PDF selecionado.</p>
              )}
            </TabsContent>
          </Tabs>

          <div className="rounded-xl border border-border/70 bg-background/60 p-3">
            <p className="text-sm font-medium mb-2">Ultimos registros de medidas</p>
            {recentEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma medida registrada ainda.</p>
            ) : (
              <div className="space-y-2">
                {recentEntries.map((entry) => (
                  <div key={entry.id} className="rounded-md border border-border/70 bg-secondary/20 p-2 text-xs">
                    <p className="font-medium">
                      {entry.type === 'skinfold' ? 'Dobras cutaneas' : 'Bioimpedancia PDF'} - {formatDateTime(entry.createdAt)}
                    </p>
                    {entry.type === 'skinfold' ? (
                      <p className="text-muted-foreground">
                        Gordura: {entry.bodyFatPercent}% | Massa magra: {entry.leanMassKg}kg
                      </p>
                    ) : (
                      <p className="text-muted-foreground">{entry.summary}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button type="submit" variant="energy" className="w-full" disabled={loading || !weight || parseFloat(weight) <= 0}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Salvando registro...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Registrar peso{measurementMode !== 'none' ? ' e medidas' : ''}
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

