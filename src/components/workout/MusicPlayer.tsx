import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Music, Save, ExternalLink, Headphones } from 'lucide-react';
import { useProfile } from '@/hooks/useProfile';
import { toast } from 'sonner';

export function MusicPlayer() {
  const { profile, updateProfile } = useProfile();
  const [spotifyUrl, setSpotifyUrl] = useState(profile?.spotify_playlist || '');
  const [youtubeUrl, setYoutubeUrl] = useState(profile?.youtube_playlist || '');
  const [showSettings, setShowSettings] = useState(false);

  const extractSpotifyId = (url: string): string | null => {
    // Handle various Spotify URL formats
    const patterns = [
      /spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
      /spotify\.com\/embed\/playlist\/([a-zA-Z0-9]+)/,
      /^([a-zA-Z0-9]+)$/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const extractYoutubePlaylistId = (url: string): string | null => {
    // Handle various YouTube playlist URL formats
    const patterns = [
      /[?&]list=([a-zA-Z0-9_-]+)/,
      /youtube\.com\/playlist\?list=([a-zA-Z0-9_-]+)/,
      /^([a-zA-Z0-9_-]+)$/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const handleSave = async () => {
    const { error } = await updateProfile({
      spotify_playlist: spotifyUrl,
      youtube_playlist: youtubeUrl,
    });

    if (error) {
      toast.error('Erro ao salvar playlists');
    } else {
      toast.success('Playlists salvas com sucesso!');
      setShowSettings(false);
    }
  };

  const spotifyId = extractSpotifyId(profile?.spotify_playlist || '');
  const youtubeId = extractYoutubePlaylistId(profile?.youtube_playlist || '');

  const hasPlaylists = spotifyId || youtubeId;

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Headphones className="w-5 h-5 text-primary" />
            Música para Treinar
          </CardTitle>
          <Dialog open={showSettings} onOpenChange={setShowSettings}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm">
                <Music className="w-4 h-4" />
                Configurar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Configurar Playlists</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Playlist do Spotify
                  </label>
                  <Input
                    placeholder="Cole o link da playlist do Spotify"
                    value={spotifyUrl}
                    onChange={(e) => setSpotifyUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Ex: https://open.spotify.com/playlist/...
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Playlist do YouTube
                  </label>
                  <Input
                    placeholder="Cole o link da playlist do YouTube"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Ex: https://www.youtube.com/playlist?list=...
                  </p>
                </div>
                <Button variant="energy" className="w-full" onClick={handleSave}>
                  <Save className="w-4 h-4" />
                  Salvar Playlists
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {hasPlaylists ? (
          <Tabs defaultValue={spotifyId ? "spotify" : "youtube"} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="spotify" disabled={!spotifyId}>
                <span className="mr-2">🎧</span> Spotify
              </TabsTrigger>
              <TabsTrigger value="youtube" disabled={!youtubeId}>
                <span className="mr-2">▶️</span> YouTube
              </TabsTrigger>
            </TabsList>
            
            {spotifyId && (
              <TabsContent value="spotify" className="mt-0">
                <div className="rounded-lg overflow-hidden">
                  <iframe
                    src={`https://open.spotify.com/embed/playlist/${spotifyId}?theme=0`}
                    width="100%"
                    height="352"
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"
                    className="border-0"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                  onClick={() => window.open(`https://open.spotify.com/playlist/${spotifyId}`, '_blank')}
                >
                  <ExternalLink className="w-4 h-4" />
                  Abrir no Spotify
                </Button>
              </TabsContent>
            )}
            
            {youtubeId && (
              <TabsContent value="youtube" className="mt-0">
                <div className="aspect-video rounded-lg overflow-hidden">
                  <iframe
                    width="100%"
                    height="100%"
                    src={`https://www.youtube.com/embed/videoseries?list=${youtubeId}`}
                    title="YouTube Playlist"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="border-0"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                  onClick={() => window.open(`https://www.youtube.com/playlist?list=${youtubeId}`, '_blank')}
                >
                  <ExternalLink className="w-4 h-4" />
                  Abrir no YouTube
                </Button>
              </TabsContent>
            )}
          </Tabs>
        ) : (
          <div className="text-center py-8">
            <Music className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground text-sm mb-3">
              Adicione suas playlists favoritas para treinar com música
            </p>
            <Button variant="outline" onClick={() => setShowSettings(true)}>
              <Music className="w-4 h-4" />
              Adicionar Playlist
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
