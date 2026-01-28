import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useUser } from '@/context/UserContext';
import { Play, Pause, Square, MapPin, Clock, Zap, Route } from 'lucide-react';

interface Position {
  lat: number;
  lng: number;
}

export function RunningTracker() {
  const { addRunSession, runSessions } = useUser();
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [distance, setDistance] = useState(0);
  const [route, setRoute] = useState<Position[]>([]);
  const [currentPosition, setCurrentPosition] = useState<Position | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Calculate speed
  const speed = elapsedTime > 0 ? (distance / (elapsedTime / 3600)) : 0;

  // Calculate calories (rough estimate: 60 cal per km)
  const calories = Math.round(distance * 60);

  useEffect(() => {
    // Get initial position
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCurrentPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (error) => console.log('Geolocation error:', error),
        { enableHighAccuracy: true }
      );
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  const startRun = () => {
    setIsRunning(true);
    setIsPaused(false);
    setElapsedTime(0);
    setDistance(0);
    setRoute([]);

    // Start timer
    intervalRef.current = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);

    // Start tracking position
    if (navigator.geolocation) {
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
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  const resumeRun = () => {
    setIsPaused(false);
    intervalRef.current = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);

    if (navigator.geolocation) {
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

  const stopRun = () => {
    setIsRunning(false);
    setIsPaused(false);

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    // Save run session
    if (distance > 0.01) {
      addRunSession({
        date: new Date(),
        duration: elapsedTime,
        distance,
        avgSpeed: speed,
        route,
        calories,
      });
    }

    // Reset
    setElapsedTime(0);
    setDistance(0);
    setRoute([]);
  };

  const calculateDistance = (pos1: Position, pos2: Position): number => {
    const R = 6371; // Earth's radius in km
    const dLat = ((pos2.lat - pos1.lat) * Math.PI) / 180;
    const dLon = ((pos2.lng - pos1.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((pos1.lat * Math.PI) / 180) *
        Math.cos((pos2.lat * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Recent runs
  const recentRuns = runSessions.slice(-5).reverse();

  return (
    <div className="pb-24 md:pb-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">
          <span className="gradient-text">Corrida</span> 🏃
        </h1>
        <p className="text-muted-foreground mt-1">Rastreie suas corridas e evolução</p>
      </div>

      {/* Map placeholder */}
      <div className="glass-card p-4 mb-6 relative overflow-hidden">
        <div className="aspect-video bg-secondary/50 rounded-lg flex items-center justify-center relative">
          {/* Simulated map background */}
          <div className="absolute inset-0 opacity-30">
            <div className="absolute inset-0" style={{
              backgroundImage: `
                linear-gradient(90deg, hsl(220 20% 18%) 1px, transparent 1px),
                linear-gradient(hsl(220 20% 18%) 1px, transparent 1px)
              `,
              backgroundSize: '40px 40px'
            }} />
          </div>

          {/* Route visualization */}
          {route.length > 1 && (
            <svg className="absolute inset-0 w-full h-full">
              <path
                d={route.map((pos, i) => {
                  const x = ((pos.lng + 180) / 360) * 100;
                  const y = ((90 - pos.lat) / 180) * 100;
                  return `${i === 0 ? 'M' : 'L'} ${x}% ${y}%`;
                }).join(' ')}
                fill="none"
                stroke="hsl(82 84% 50%)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}

          {/* Current position marker */}
          {currentPosition && (
            <div className="absolute flex items-center justify-center z-10">
              <div className="w-4 h-4 bg-primary rounded-full animate-pulse-glow" />
              <div className="absolute w-8 h-8 bg-primary/30 rounded-full animate-ping" />
            </div>
          )}

          {!isRunning && (
            <div className="text-center z-10">
              <MapPin className="w-12 h-12 text-primary mx-auto mb-2" />
              <p className="text-muted-foreground">
                {currentPosition ? 'Pronto para começar' : 'Obtendo localização...'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="stat-card text-center">
          <Clock className="w-5 h-5 text-info mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Tempo</p>
          <p className="text-xl font-bold">{formatTime(elapsedTime)}</p>
        </div>
        <div className="stat-card text-center">
          <Route className="w-5 h-5 text-primary mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Distância</p>
          <p className="text-xl font-bold">{distance.toFixed(2)} <span className="text-sm font-normal">km</span></p>
        </div>
        <div className="stat-card text-center">
          <Zap className="w-5 h-5 text-warning mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Velocidade</p>
          <p className="text-xl font-bold">{speed.toFixed(1)} <span className="text-sm font-normal">km/h</span></p>
        </div>
      </div>

      {/* Control buttons */}
      <div className="flex gap-3 mb-8">
        {!isRunning ? (
          <Button
            variant="energy"
            size="xl"
            className="flex-1"
            onClick={startRun}
            disabled={!currentPosition}
          >
            <Play className="w-6 h-6" />
            Iniciar Corrida
          </Button>
        ) : (
          <>
            {isPaused ? (
              <Button
                variant="energy"
                size="xl"
                className="flex-1"
                onClick={resumeRun}
              >
                <Play className="w-6 h-6" />
                Retomar
              </Button>
            ) : (
              <Button
                variant="outline"
                size="xl"
                className="flex-1"
                onClick={pauseRun}
              >
                <Pause className="w-6 h-6" />
                Pausar
              </Button>
            )}
            <Button
              variant="destructive"
              size="xl"
              className="flex-1"
              onClick={stopRun}
            >
              <Square className="w-6 h-6" />
              Finalizar
            </Button>
          </>
        )}
      </div>

      {/* Recent Runs */}
      <div className="stat-card">
        <h3 className="text-lg font-semibold mb-4">Corridas Recentes</h3>
        {recentRuns.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            Nenhuma corrida registrada ainda
          </p>
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
