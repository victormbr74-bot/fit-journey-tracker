import { WeightEntry } from '@/types/user';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

interface WeightChartProps {
  data: WeightEntry[];
}

export function WeightChart({ data }: WeightChartProps) {
  const chartData = data.map((entry) => ({
    date: format(new Date(entry.date), 'dd/MM', { locale: ptBR }),
    weight: entry.weight,
  }));

  const minWeight = Math.min(...data.map(d => d.weight)) - 2;
  const maxWeight = Math.max(...data.map(d => d.weight)) + 2;

  return (
    <div className="stat-card">
      <h3 className="text-lg font-semibold mb-4">Evolução do Peso</h3>
      
      {data.length < 2 ? (
        <div className="h-48 flex items-center justify-center text-muted-foreground">
          <p className="text-center">
            Adicione mais registros de peso<br />para ver sua evolução
          </p>
        </div>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(82 84% 50%)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(82 84% 50%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="date" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(220 10% 60%)', fontSize: 12 }}
              />
              <YAxis 
                domain={[minWeight, maxWeight]}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(220 10% 60%)', fontSize: 12 }}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(220 20% 12%)',
                  border: '1px solid hsl(220 20% 18%)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                }}
                labelStyle={{ color: 'hsl(0 0% 98%)' }}
                itemStyle={{ color: 'hsl(82 84% 50%)' }}
              />
              <Area
                type="monotone"
                dataKey="weight"
                stroke="hsl(82 84% 50%)"
                strokeWidth={2}
                fill="url(#weightGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
