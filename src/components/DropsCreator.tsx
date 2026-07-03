import React, { useState, useRef } from "react";
import { X, Upload, Play, Pause, Volume2, VolumeX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import toast from "react-hot-toast";

interface DropsCreatorProps {
  onClose: () => void;
  onPublish: (videoUrl: string, thumbnail: string) => void;
}

export function DropsCreator({ onClose, onPublish }: DropsCreatorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [thumbnail, setThumbnail] = useState<string>("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      toast.error("Apenas vídeos são permitidos");
      return;
    }

    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
  };

  // Generate thumbnail
  const generateThumbnail = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);
    
    const thumbUrl = canvas.toDataURL("image/jpeg");
    setThumbnail(thumbUrl);
    toast.success("Thumbnail gerada!");
  };

  // Upload to Cloudinary
  const uploadToCloudinary = async () => {
    if (!videoFile || !thumbnail) {
      toast.error("Adicione vídeo e thumbnail");
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", videoFile);
      formData.append("upload_preset", process.env.VITE_CLOUDINARY_UPLOAD_PRESET || "");
      formData.append("cloud_name", process.env.VITE_CLOUDINARY_CLOUD_NAME || "");
      formData.append("resource_type", "video");

      // Upload video
      const videoRes = await fetch(
        `https://api.cloudinary.com/v1_1/${process.env.VITE_CLOUDINARY_CLOUD_NAME}/video/upload`,
        { method: "POST", body: formData }
      );
      
      if (!videoRes.ok) throw new Error("Erro no upload do vídeo");
      
      const videoData = await videoRes.json();
      const cloudinaryVideoUrl = videoData.secure_url;

      // Upload thumbnail
      const thumbFormData = new FormData();
      const thumbBlob = await (await fetch(thumbnail)).blob();
      thumbFormData.append("file", thumbBlob);
      thumbFormData.append("upload_preset", process.env.VITE_CLOUDINARY_UPLOAD_PRESET || "");
      thumbFormData.append("cloud_name", process.env.VITE_CLOUDINARY_CLOUD_NAME || "");

      const thumbRes = await fetch(
        `https://api.cloudinary.com/v1_1/${process.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: "POST", body: thumbFormData }
      );

      if (!thumbRes.ok) throw new Error("Erro no upload da thumbnail");

      const thumbData = await thumbRes.json();
      const cloudinaryThumbUrl = thumbData.secure_url;

      setProgress(100);
      setUploading(false);
      
      // Publish
      onPublish(cloudinaryVideoUrl, cloudinaryThumbUrl);
      toast.success("Drop publicado com sucesso!");
      onClose();
    } catch (err: any) {
      console.error("Erro:", err);
      toast.error(err.message || "Erro no upload");
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 z-10"
          style={{ borderColor: "var(--border-subtle)", background: "var(--surface-0)" }}>
          <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Criar Drop</h2>
          <button onClick={onClose} className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg">
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {!videoUrl ? (
            /* Upload Section */
            <div className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 transition"
              style={{ borderColor: "#5B3FCF", background: "var(--s1)" }}
              onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-12 w-12 mx-auto mb-3" style={{ color: "#5B3FCF" }} />
              <p className="text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                Seleciona um vídeo
              </p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                (Clica aqui ou arrasta o ficheiro)
              </p>
              <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                Máx 100MB • Formatos: MP4, WebM, MOV
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          ) : (
            /* Preview Section */
            <div className="space-y-4">
              {/* Video Preview */}
              <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full h-full object-cover"
                  onTimeUpdate={() => setProgress(Math.min((videoRef.current?.currentTime || 0) / (videoRef.current?.duration || 1) * 100, 100))}
                />
                
                {/* Controls Overlay */}
                <div className="absolute inset-0 flex flex-col justify-between p-4 bg-gradient-to-t from-black/60 to-transparent opacity-0 hover:opacity-100 transition">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => fileInputRef.current?.click()}
                      className="p-2 bg-white/20 hover:bg-white/40 rounded-full transition">
                      <Upload className="h-5 w-5 text-white" />
                    </button>
                  </div>
                  
                  <div className="space-y-2">
                    {/* Thumbnail Button */}
                    <button onClick={generateThumbnail}
                      className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition text-sm">
                      📸 Gerar Thumbnail
                    </button>

                    {/* Playback Controls */}
                    <div className="flex items-center gap-2">
                      <button onClick={() => {
                        if (videoRef.current) {
                          isPlaying ? videoRef.current.pause() : videoRef.current.play();
                          setIsPlaying(!isPlaying);
                        }
                      }}
                        className="p-2 bg-white/20 hover:bg-white/40 rounded-full transition">
                        {isPlaying ? (
                          <Pause className="h-5 w-5 text-white" />
                        ) : (
                          <Play className="h-5 w-5 text-white" />
                        )}
                      </button>
                      
                      <button onClick={() => {
                        if (videoRef.current) {
                          videoRef.current.muted = !isMuted;
                          setIsMuted(!isMuted);
                        }
                      }}
                        className="p-2 bg-white/20 hover:bg-white/40 rounded-full transition">
                        {isMuted ? (
                          <VolumeX className="h-5 w-5 text-white" />
                        ) : (
                          <Volume2 className="h-5 w-5 text-white" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Thumbnail Preview */}
              {thumbnail && (
                <div className="border rounded-xl p-3" style={{ borderColor: "var(--border-subtle)", background: "var(--s1)" }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-muted)" }}>Preview da Thumbnail:</p>
                  <img src={thumbnail} alt="Thumbnail" className="w-full rounded-lg max-h-32 object-cover" />
                </div>
              )}

              {/* Upload Progress */}
              {uploading && (
                <div className="border rounded-xl p-3" style={{ borderColor: "var(--border-subtle)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Upload em progresso...</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>{Math.round(progress)}%</p>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "var(--s2)" }}>
                    <div className="h-full transition-all" style={{ width: `${progress}%`, background: "#5B3FCF" }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t" style={{ borderColor: "var(--border-subtle)" }}>
            <button onClick={onClose}
              className="flex-1 py-2 rounded-lg font-semibold transition"
              style={{ background: "var(--s2)", color: "var(--text-primary)" }}>
              Cancelar
            </button>
            {videoUrl && (
              <button onClick={uploadToCloudinary}
                disabled={uploading || !thumbnail}
                className="flex-1 py-2 rounded-lg font-semibold text-white transition disabled:opacity-50"
                style={{ background: "#5B3FCF" }}>
                {uploading ? "Enviando..." : "🚀 Publicar Drop"}
              </button>
            )}
          </div>
        </div>

        {/* Hidden canvas for thumbnail */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
