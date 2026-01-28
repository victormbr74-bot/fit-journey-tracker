interface BMIGaugeProps {
  bmi: number;
}

function getBMICategory(bmi: number): { label: string; color: string } {
  if (bmi < 18.5) return { label: 'Abaixo do peso', color: 'text-info' };
  if (bmi < 25) return { label: 'Peso normal', color: 'text-success' };
  if (bmi < 30) return { label: 'Sobrepeso', color: 'text-warning' };
  return { label: 'Obesidade', color: 'text-destructive' };
}

export function BMIGauge({ bmi }: BMIGaugeProps) {
  const category = getBMICategory(bmi);
  
  // Calculate position on the gauge (BMI 15-40 range)
  const minBMI = 15;
  const maxBMI = 40;
  const clampedBMI = Math.max(minBMI, Math.min(maxBMI, bmi));
  const percentage = ((clampedBMI - minBMI) / (maxBMI - minBMI)) * 100;

  return (
    <div className="stat-card">
      <h3 className="text-lg font-semibold mb-4">Índice de Massa Corporal</h3>
      
      <div className="relative h-4 rounded-full overflow-hidden bg-gradient-to-r from-info via-success via-warning to-destructive mb-4">
        <div
          className="absolute top-0 w-1 h-full bg-foreground shadow-lg"
          style={{ left: `${percentage}%`, transform: 'translateX(-50%)' }}
        />
      </div>

      <div className="flex justify-between text-xs text-muted-foreground mb-6">
        <span>15</span>
        <span>18.5</span>
        <span>25</span>
        <span>30</span>
        <span>40</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-3xl font-bold">{bmi.toFixed(1)}</p>
          <p className={`text-sm font-medium ${category.color}`}>{category.label}</p>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <p>IMC ideal: 18.5 - 24.9</p>
        </div>
      </div>
    </div>
  );
}
