import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Play, X, ExternalLink } from 'lucide-react';

// Exercise video database - YouTube video IDs for exercise demonstrations
const exerciseVideos: Record<string, { videoId: string; gifUrl?: string }> = {
  'Supino Reto': { 
    videoId: 'rT7DgCr-3pg',
    gifUrl: 'https://www.inspireusafoundation.org/wp-content/uploads/2022/03/barbell-bench-press.gif'
  },
  'Supino Inclinado': { 
    videoId: 'SrqOu55lrYU',
    gifUrl: 'https://www.inspireusafoundation.org/wp-content/uploads/2022/03/incline-barbell-bench-press.gif'
  },
  'Crucifixo': { 
    videoId: 'eozdVDA78K0',
    gifUrl: 'https://www.inspireusafoundation.org/wp-content/uploads/2022/10/dumbbell-chest-fly.gif'
  },
  'Flexão de Braço': { 
    videoId: 'IODxDxX7oi4',
    gifUrl: 'https://www.inspireusafoundation.org/wp-content/uploads/2022/10/push-up.gif'
  },
  'Puxada Frontal': { 
    videoId: 'CAwf7n6Luuc',
    gifUrl: 'https://www.inspireusafoundation.org/wp-content/uploads/2022/02/lat-pulldown.gif'
  },
  'Remada Curvada': { 
    videoId: 'FWJR5Ve8bnQ',
    gifUrl: 'https://www.inspireusafoundation.org/wp-content/uploads/2022/02/barbell-row.gif'
  },
  'Remada Unilateral': { 
    videoId: 'pYcpY20QaE8',
    gifUrl: 'https://www.inspireusafoundation.org/wp-content/uploads/2022/03/dumbbell-row.gif'
  },
  'Agachamento': { 
    videoId: 'ultWZbUMPL8',
    gifUrl: 'https://www.inspireusafoundation.org/wp-content/uploads/2021/10/barbell-full-squat.gif'
  },
  'Leg Press': { 
    videoId: 'IZxyjW7MPJQ',
    gifUrl: 'https://www.inspireusafoundation.org/wp-content/uploads/2023/10/leg-press.gif'
  },
  'Extensora': { 
    videoId: 'YyvSfVjQeL0',
    gifUrl: 'https://www.inspireusafoundation.org/wp-content/uploads/2022/02/leg-extension.gif'
  },
  'Flexora': { 
    videoId: 'ELOCsoDSmrg',
    gifUrl: 'https://www.inspireusafoundation.org/wp-content/uploads/2022/03/seated-leg-curl.gif'
  },
  'Panturrilha': { 
    videoId: 'c5Kv6-fnTj8',
    gifUrl: 'https://www.inspireusafoundation.org/wp-content/uploads/2022/06/standing-calf-raise.gif'
  },
  'Desenvolvimento': { 
    videoId: 'qEwKCR5JCog',
    gifUrl: 'https://www.inspireusafoundation.org/wp-content/uploads/2022/03/overhead-barbell-press.gif'
  },
  'Elevação Lateral': { 
    videoId: '3VcKaXpzqRo',
    gifUrl: 'https://www.inspireusafoundation.org/wp-content/uploads/2022/10/dumbbell-lateral-raise.gif'
  },
  'Elevação Frontal': { 
    videoId: '-t7fuZ0KhDA',
    gifUrl: 'https://www.inspireusafoundation.org/wp-content/uploads/2022/10/dumbbell-front-raise.gif'
  },
  'Rosca Direta': { 
    videoId: 'ykJmrZ5v0Oo',
    gifUrl: 'https://www.inspireusafoundation.org/wp-content/uploads/2022/03/barbell-curl.gif'
  },
  'Rosca Martelo': { 
    videoId: 'zC3nLlEvin4',
    gifUrl: 'https://www.inspireusafoundation.org/wp-content/uploads/2022/10/dumbbell-hammer-curl.gif'
  },
  'Tríceps Pulley': { 
    videoId: '2-LAMcpzODU',
    gifUrl: 'https://www.inspireusafoundation.org/wp-content/uploads/2022/10/cable-pushdown.gif'
  },
  'Tríceps Francês': { 
    videoId: 'ir5PsbniVSc',
    gifUrl: 'https://www.inspireusafoundation.org/wp-content/uploads/2022/11/lying-ez-bar-skull-crusher.gif'
  },
  'Abdominal Crunch': { 
    videoId: 'Xyd_fa5zoEU',
    gifUrl: 'https://www.inspireusafoundation.org/wp-content/uploads/2022/08/crunches.gif'
  },
  'Prancha': { 
    videoId: 'ASdvN_XEl_c',
    gifUrl: 'https://www.inspireusafoundation.org/wp-content/uploads/2022/08/plank.gif'
  },
  'Elevação de Pernas': { 
    videoId: 'JB2oyawG9KI',
    gifUrl: 'https://www.inspireusafoundation.org/wp-content/uploads/2022/04/lying-leg-raise.gif'
  },
};

interface ExerciseVideoProps {
  exerciseName: string;
  compact?: boolean;
}

export function ExerciseVideo({ exerciseName, compact = false }: ExerciseVideoProps) {
  const [showVideo, setShowVideo] = useState(false);
  const videoData = exerciseVideos[exerciseName];

  if (!videoData) {
    return null;
  }

  return (
    <Dialog open={showVideo} onOpenChange={setShowVideo}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size={compact ? "sm" : "default"}
          className="gap-2 text-primary hover:text-primary/80"
        >
          <Play className={compact ? "w-3 h-3" : "w-4 h-4"} />
          {!compact && "Ver execução"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="w-5 h-5 text-primary" />
            {exerciseName} - Como fazer
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* GIF Preview */}
          {videoData.gifUrl && (
            <div className="rounded-lg overflow-hidden bg-secondary/30">
              <img 
                src={videoData.gifUrl} 
                alt={`Demonstração de ${exerciseName}`}
                className="w-full h-auto max-h-[300px] object-contain"
                loading="lazy"
              />
            </div>
          )}

          {/* YouTube Video */}
          <div className="aspect-video rounded-lg overflow-hidden bg-secondary">
            <iframe
              width="100%"
              height="100%"
              src={`https://www.youtube.com/embed/${videoData.videoId}?rel=0`}
              title={`${exerciseName} - Tutorial`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="border-0"
            />
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => window.open(`https://www.youtube.com/watch?v=${videoData.videoId}`, '_blank')}
          >
            <ExternalLink className="w-4 h-4" />
            Abrir no YouTube
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
