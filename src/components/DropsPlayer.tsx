import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Heart, MessageCircle, Share2 } from "lucide-react";

interface Drop {
  id: string;
  video_url: string;
  thumbnail_url: string;
  music_url?: string;
  music_volume?: number;
  duration: string;
  author: string;
  avatar: string;
  views: number;
  likes: number;
  comments: number;
}

interface DropsPlayerProps {
  drop: Drop;
  isVisible: boolean;
  onLike?: (dropId: string) => void;
}

export function DropsPlayer({ drop, isVisible, onLike }: DropsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [musicVolume, setMusicVolume] = useState(drop.music_volume || 70);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Autoplay quando visível
  useEffect(() => {
    if (!videoRef.current) return;
    
    if (isVisible) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, [isVisible]);

  // Sync música com vídeo
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = musicVolume / 100;
  }, [musicVolume]);

  return (
    <div className="relative w-full h-screen bg-black flex items-center justify-center overflow-hidden group">
      
      {/* Video */}
      <div className="relative w-full h-full flex items-center justify-center aspect-video max-h-screen">
        <video
          ref={videoRef}
          src={drop.video_url}
          poster={drop.thumbnail_url}
          className="w-full h-full object-cover"
          onClick={() => {
            if (videoRef.current) {
              isPlaying ? videoRef.current.pause() : videoRef.current.play();
              setIsPlaying(!isPlaying);
            }
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={() => {
            setCurrentTime(videoRef.current?.currentTime || 0);
            if (audioRef.current && videoRef.current) {
              audioRef.current.currentTime = videoRef.current.currentTime;
            }
          }}
          onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
        />

        {/* Audio */}
        {drop.music_url && (
          <audio
            ref={audioRef}
            src={drop.music_url}
            loop
          />
        )}

        {/* Overlay - Autor Info */}
        <div className="absolute bottom-20 left-4 right-4 text-white drop-shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <img src={drop.avatar} alt={drop.author} className="w-10 h-10 rounded-full object-cover" />
            <div>
              <p className="text-sm font-bold">{drop.author}</p>
              <p className="text-xs opacity-80">🔒 Drop exclusivo • Expira em {drop.duration}</p>
            </div>
            <button className="ml-auto px-3 py-1 bg-white/20 hover:bg-white/40 rounded-full text-xs font-bold transition">
              Seguir
            </button>
          </div>
        </div>

        {/* Center Play Button */}
        {!isPlaying && (
          <button onClick={() => videoRef.current?.play()}
            className="absolute inset-0 flex items-center justify-center hover:bg-black/20 transition">
            <Play className="h-16 w-16 text-white opacity-70 hover:opacity-100" />
          </button>
        )}

        {/* Right Side Actions */}
        <div className="absolute right-4 bottom-20 flex flex-col gap-4">
          <button onClick={() => onLike?.(drop.id)}
            className="flex flex-col items-center gap-1 text-white hover:scale-110 transition">
            <div className="p-3 rounded-full hover:bg-white/20 transition">
              <Heart className="h-6 w-6" />
            </div>
            <p className="text-xs font-bold">{drop.likes}</p>
          </button>

          <button className="flex flex-col items-center gap-1 text-white hover:scale-110 transition">
            <div className="p-3 rounded-full hover:bg-white/20 transition">
              <MessageCircle className="h-6 w-6" />
            </div>
            <p className="text-xs font-bold">{drop.comments}</p>
          </button>

          <button className="flex flex-col items-center gap-1 text-white hover:scale-110 transition">
            <div className="p-3 rounded-full hover:bg-white/20 transition">
              <Share2 className="h-6 w-6" />
            </div>
            <p className="text-xs font-bold">Partilhar</p>
          </button>
        </div>

        {/* Bottom Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
          {/* Progress Bar */}
          <div className="flex items-center gap-2 mb-3 text-white text-xs">
            <span>{Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, "0")}</span>
            <div className="flex-1 h-1 rounded-full overflow-hidden bg-white/20">
              <div className="h-full bg-white" style={{ width: `${(currentTime / duration) * 100}%` }} />
            </div>
            <span>{Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, "0")}</span>
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={() => {
                if (videoRef.current) {
                  isPlaying ? videoRef.current.pause() : videoRef.current.play();
                  setIsPlaying(!isPlaying);
                }
              }}
                className="p-2 hover:bg-white/20 rounded-full transition">
                {isPlaying ? <Pause className="h-5 w-5 text-white" /> : <Play className="h-5 w-5 text-white" />}
              </button>

              {drop.music_url && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setIsMuted(!isMuted)}
                    className="p-2 hover:bg-white/20 rounded-full transition">
                    {isMuted ? <VolumeX className="h-5 w-5 text-white" /> : <Volume2 className="h-5 w-5 text-white" />}
                  </button>
                  <input type="range" min="0" max="100" value={musicVolume}
                    onChange={(e) => setMusicVolume(parseInt(e.target.value))}
                    className="w-20 h-1 accent-white"
                  />
                </div>
              )}
            </div>

            <p className="text-xs text-white">👁️ {drop.views.toLocaleString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
