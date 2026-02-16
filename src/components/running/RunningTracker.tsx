import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProfile } from '@/hooks/useProfile';
import { Play, Pause, Square, MapPin, Clock, Zap, Route } from 'lucide-react';

interface Position {
  lat: number;
  lng: number;
}

type RunMode = 'outdoor' | 'treadmill';
type TreadmillDistanceMode = 'manual' | 'speed';

export function RunningTracker() {
  const { addRunSession, runSessions } = useProfile();
  const [runMode, setRunMode] = useState<RunMode>('outdoor');
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [distance, setDistance] = useState(0);
  const [treadmillDistanceMode, setTreadmillDistanceMode] = useState<TreadmillDistanceMode>('manual');
  const [treadmillDistanceInput, setTreadmillDistanceInput] = useState('');
  const [treadmillSpeedInput, setTreadmillSpeedInput] = useState('');
  const [treadmillSpeed, setTreadmillSpeed] = useState(0);
  const [route, setRoute] = useState<Position[]>([]);
  const [currentPosition, setCurrentPosition] = useState<Position | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const isTreadmillMode = runMode === 'treadmill';

  const speed = elapsedTime > 0 ? distance / (elapsedTime / 3600) : 0;
  const calories = Math.round(distance * 60);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCurrentPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (error) => console.log('Geolocation error:', error),
        { enableHighAccuracy: true }
      );
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isTreadmillMode || treadmillDistanceMode !== 'speed') return;

    if (elapsedTime === 0 || treadmillSpeed <= 0) {
      setDistance(0);
      return;
    }

    setDistance((treadmillSpeed * elapsedTime) / 3600);
  }, [elapsedTime, isTreadmillMode, treadmillDistanceMode, treadmillSpeed]);

  const startRun = () => {
    setIsRunning(true);
    setIsPaused(false);
    setElapsedTime(0);
    setDistance(0);
    setTreadmillDistanceInput('');
    setRoute([]);

    intervalRef.current = setInterval(() => setElapsedTime((prev) => prev + 1), 1000);

    if (!isTreadmillMode && navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCurrentPosition(newPos);
          setRoute((prev) => {
            if (prev.length > 0) {
              const lastPos = prev[prev.length - 1];
              const dist = calculateDistance(lastPos, newPos);
              setDistance((d) => d + dist);
            }
            return [...prev, newPos];
          });
        },
        (error) => console.log('Watch error:', error),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
      );
    }
  };

  const pauseRun = () => {
    setIsPaused(true);
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!isTreadmillMode && watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
  };

  const resumeRun = () => {
    setIsPaused(false);
    intervalRef.current = setInterval(() => setElapsedTime((prev) => prev + 1), 1000);

    if (!isTreadmillMode && navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const newPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCurrentPosition(newPos);
          setRoute((prev) => {
            if (prev.length > 0) {
              const dist = calculateDistance(prev[prev.length - 1], newPos);
              setDistance((d) => d + dist);
            }
            return [...prev, newPos];
          });
        },
        (error) => console.log('Watch error:', error),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
      );
    }
  };

  const stopRun = async () => {
    setIsRunning(false);
    setIsPaused(false);

    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!isTreadmillMode && watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);

    if (distance > 0.01) {
      await addRunSession({ date: new Date(), duration: elapsedTime, distance, avgSpeed: speed, route, calories });
    }

    setElapsedTime(0);
    setDistance(0);
    setTreadmillDistanceInput('');
    setRoute([]);
  };

  const handleTreadmillDistanceChange = (value: string) => {
    setTreadmillDistanceInput(value);
    const parsed = Number(value.replace(',', '.'));

    if (!Number.isNaN(parsed) && parsed >= 0) {
      setDistance(parsed);
    }
  };

  const handleTreadmillSpeedChange = (value: string) => {
    setTreadmillSpeedInput(value);
    const parsed = Number(value.replace(',', '.'));

    if (!Number.isNaN(parsed) && parsed >= 0) {
      setTreadmillSpeed(parsed);
      return;
    }

    if (!value) {
      setTreadmillSpeed(0);
    }
  };

  const canStartRun = isTreadmillMode
    ? treadmillDistanceMode === 'manual' || treadmillSpeed > 0
    : Boolean(currentPosition);

  const calculateDistance = (pos1: Position, pos2: Position): number => {
    const R = 6371;
    const dLat = ((pos2.lat - pos1.lat) * Math.PI) / 180;
    const dLon = ((pos2.lng - pos1.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((pos1.lat * Math.PI) / 180) *
        Math.cos((pos2.lat * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return hrs > 0
      ? `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      : `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const recentRuns = runSessions.slice(-5).reverse();

  return (
    <div className="pb-24 md:pb-8">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">
          <span className="gradient-text">Corrida</span> 🏃
        </h1>
        <p className="text-muted-foreground mt-1">Rastreie suas corridas e evolução</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Button
          type="button"
          variant={!isTreadmillMode ? 'energy' : 'outline'}
          className="w-full"
          disabled={isRunning}
          onClick={() => setRunMode('outdoor')}
        >
          Rua / GPS
        </Button>
        <Button
          type="button"
          variant={isTreadmillMode ? 'energy' : 'outline'}
          className="w-full"
          disabled={isRunning}
          onClick={() => setRunMode('treadmill')}
        >
          Esteira
        </Button>
      </div>

      <div className="glass-card p-4 mb-6 relative overflow-hidden">
        <div className="aspect-video bg-secondary/50 rounded-lg flex items-center justify-center relative">
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                'linear-gradient(90deg, hsl(220 20% 18%) 1px, transparent 1px), linear-gradient(hsl(220 20% 18%) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />

          {!isTreadmillMode && currentPosition && (
            <div className="absolute flex items-center justify-center z-10">
              <div className="w-4 h-4 bg-primary rounded-full animate-pulse-glow" />
              <div className="absolute w-8 h-8 bg-primary/30 rounded-full animate-ping" />
            </div>
          )}

          {!isRunning && (
            <div className="text-center z-10">
              <MapPin className="w-12 h-12 text-primary mx-auto mb-2" />
              <p className="text-muted-foreground">
                {isTreadmillMode
                  ? 'Modo esteira ativo'
                  : currentPosition
                    ? 'Pronto para começar'
                    : 'Obtendo localização...'}
              </p>
            </div>
          )}
        </div>
      </div>

      {isTreadmillMode && (
        <div className="stat-card mb-6">
          <p className="text-sm font-medium mb-3">Medição da esteira</p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <Button
              type="button"
              size="sm"
              variant={treadmillDistanceMode === 'manual' ? 'energy' : 'outline'}
              onClick={() => setTreadmillDistanceMode('manual')}
              disabled={isRunning}
            >
              Distância
            </Button>
            <Button
              type="button"
              size="sm"
              variant={treadmillDistanceMode === 'speed' ? 'energy' : 'outline'}
              onClick={() => setTreadmillDistanceMode('speed')}
              disabled={isRunning}
            >
              Tempo x Velocidade
            </Button>
          </div>

          {treadmillDistanceMode === 'manual' ? (
            <>
              <p className="text-sm font-medium mb-2">Distância da esteira (km)</p>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Ex: 3.50"
                value={treadmillDistanceInput}
                onChange={(event) => handleTreadmillDistanceChange(event.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-2">
                Atualize conforme o painel da esteira para medir o treino.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium mb-2">Velocidade da esteira (km/h)</p>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                placeholder="Ex: 9.5"
                value={treadmillSpeedInput}
                onChange={(event) => handleTreadmillSpeedChange(event.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-2">
                A distância é calculada automaticamente pelo tempo da corrida.
              </p>
            </>
          )}
        </div>
      )}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="stat-card text-center">
          <Clock className="w-5 h-5 text-info mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Tempo</p>
          <p className="text-xl font-bold">{formatTime(elapsedTime)}</p>
        </div>
        <div className="stat-card text-center">
          <Route className="w-5 h-5 text-primary mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Distância</p>
          <p className="text-xl font-bold">
            {distance.toFixed(2)} <span className="text-sm font-normal">km</span>
          </p>
        </div>
        <div className="stat-card text-center">
          <Zap className="w-5 h-5 text-warning mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Velocidade</p>
          <p className="text-xl font-bold">
            {speed.toFixed(1)} <span className="text-sm font-normal">km/h</span>
          </p>
        </div>
      </div>

      <div className="flex gap-3 mb-8">
        {!isRunning ? (
          <Button
            variant="energy"
            size="xl"
            className="flex-1"
            onClick={startRun}
            disabled={!canStartRun}
          >
            <Play className="w-6 h-6" />
            Iniciar Corrida
          </Button>
        ) : (
          <>
            {isPaused ? (
              <Button variant="energy" size="xl" className="flex-1" onClick={resumeRun}>
                <Play className="w-6 h-6" />
                Retomar
              </Button>
            ) : (
              <Button variant="outline" size="xl" className="flex-1" onClick={pauseRun}>
                <Pause className="w-6 h-6" />
                Pausar
              </Button>
            )}
            <Button variant="destructive" size="xl" className="flex-1" onClick={stopRun}>
              <Square className="w-6 h-6" />
              Finalizar
            </Button>
          </>
        )}
      </div>

      <div className="stat-card">
        <h3 className="text-lg font-semibold mb-4">Corridas Recentes</h3>
        {recentRuns.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">Nenhuma corrida registrada ainda</p>
        ) : (
          <div className="space-y-3">
            {recentRuns.map((run) => (
              <div key={run.id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                <div>
                  <p className="font-medium">{run.distance.toFixed(2)} km</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(run.date).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm">{formatTime(run.duration)}</p>
                  <p className="text-xs text-muted-foreground">{run.avgSpeed.toFixed(1)} km/h</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
