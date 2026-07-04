import React, { useState, useRef } from "react";
import { X, Upload, Music, Play, Pause, Volume2, VolumeX, Type, Smile, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { MusicLibrary, type Song } from "@/components/MusicLibrary";
import { uploadToCloudinary as uploadToCloudinaryVideo, uploadImageToCloudinary } from "@/lib/cloudinary";

interface DropsCreatorProps {
  onClose: () => void;
  onPublish: (videoUrl: string, thumbnail: string, contentType: "video" | "photo", musicUrl?: string, duration?: string) => void;
}

type Tab = "fundo" | "texto" | "stickers" | "filtros" | "musica";

export function DropsCreator({ onClose, onPublish }: DropsCreatorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [activeTab, setActiveTab] = useState<Tab>("fundo");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [thumbnail, setThumbnail] = useState<string>("");
  const [musicUrl, setMusicUrl] = useState<string>("");
  const [musicTitle, setMusicTitle] = useState<string>("");
  const [showMusicLib, setShowMusicLib] = useState(false);
  const [musicVolume, setMusicVolume] = useState(70);
  const [duration, setDuration] = useState("24h");
  const [textOverlay, setTextOverlay] = useState("");
  const [backgroundColor, setBackgroundColor] = useState("#5B3FCF");
  const [selectedFilter, setSelectedFilter] = useState("none");
  const [isPlaying, setIsPlaying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/") && !file.type.startsWith("image/")) {
      toast.error("Apenas vídeos ou imagens são permitidas");
      return;
    }

    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
  };

  // Handle music selection (biblioteca musical partilhada)
  const handleMusicSelect = (song: Song) => {
    setMusicUrl(song.stream_url || song.url);
    setMusicTitle(song.artist ? `${song.title} — ${song.artist}` : song.title);
    setShowMusicLib(false);
    toast.success("Música adicionada!");
  };

  // Generate thumbnail
  const generateThumbnail = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = videoRef.current.videoWidth || 500;
    canvas.height = videoRef.current.videoHeight || 500;
    
    if (videoRef.current.videoWidth) {
      ctx.drawImage(videoRef.current, 0, 0);
    } else {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#fff";
      ctx.font = "20px Arial";
      ctx.textAlign = "center";
      ctx.fillText(textOverlay || "Drop", canvas.width / 2, canvas.height / 2);
    }
    
    const thumbUrl = canvas.toDataURL("image/jpeg");
    setThumbnail(thumbUrl);
    toast.success("Thumbnail gerada!");
  };

  // Upload to Cloudinary
  const uploadToCloudinary = async () => {
    if (!videoFile || !thumbnail) {
      toast.error("Adicione vídeo/foto e confirme thumbnail");
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      const isVideo = videoFile.type.startsWith("video/");
      let cloudinaryVideoUrl: string;

      if (isVideo) {
        const result = await uploadToCloudinaryVideo(
          videoFile,
          { title: textOverlay || "Drop", channelId: "", userId: "" },
          (pct) => setProgress(Math.round(pct * 0.9)),
        );
        cloudinaryVideoUrl = result.playbackUrl;
      } else {
        const result = await uploadImageToCloudinary(videoFile, "hooda/drops", (pct) => setProgress(Math.round(pct * 0.9)));
        cloudinaryVideoUrl = result.url;
      }

      // Upload thumbnail
      const thumbBlob = await (await fetch(thumbnail)).blob();
      const thumbFile = new File([thumbBlob], "thumb.jpg", { type: "image/jpeg" });
      const thumbResult = await uploadImageToCloudinary(thumbFile, "hooda/drops");
      const cloudinaryThumbUrl = thumbResult.url;

      setProgress(100);
      setUploading(false);

      const contentType: "video" | "photo" = isVideo ? "video" : "photo";
      onPublish(cloudinaryVideoUrl, cloudinaryThumbUrl, contentType, musicUrl, duration);
      onClose();
    } catch (err: any) {
      console.error("Erro:", err);
      toast.error(err.message || "Erro no upload");
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 z-10"
          style={{ borderColor: "var(--border-subtle)", background: "var(--surface-0)" }}>
          <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Criar Drop</h2>
          <button onClick={onClose} className="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg">
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden gap-4 p-4">
          
          {/* Left: Preview */}
          <div className="flex-1 flex flex-col gap-4">
            {!videoUrl ? (
              <div className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer flex-1 flex flex-col items-center justify-center"
                style={{ borderColor: "#5B3FCF", background: "var(--s1)" }}
                onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-12 w-12 mx-auto mb-3" style={{ color: "#5B3FCF" }} />
                <p className="text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                  Seleciona vídeo ou foto
                </p>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  (Clica ou arrasta)
                </p>
                <input ref={fileInputRef} type="file" accept="video/*,image/*" onChange={handleFileSelect} className="hidden" />
              </div>
            ) : (
              <div className="flex flex-col gap-3 flex-1">
                {/* Preview Container - 9:16 aspect ratio */}
                <div className="relative bg-black rounded-xl overflow-hidden aspect-video flex items-center justify-center"
                  style={{ aspectRatio: "9 / 16", maxHeight: "400px" }}>
                  
                  {videoFile?.type.startsWith("video/") ? (
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      className="w-full h-full object-cover"
                      style={{ filter: selectedFilter !== "none" ? `${selectedFilter}` : "none" }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ background: backgroundColor }}>
                      <img src={videoUrl} alt="Preview" className="w-full h-full object-cover"
                        style={{ filter: selectedFilter !== "none" ? `${selectedFilter}` : "none" }} />
                    </div>
                  )}

                  {/* Overlays */}
                  <div className="absolute inset-0 flex flex-col justify-between p-3 pointer-events-none">
                    <div className="text-center text-white drop-shadow-lg">
                      {textOverlay && (
                        <p className="text-sm font-bold bg-black/40 px-2 py-1 rounded inline-block max-w-[90%]">
                          {textOverlay}
                        </p>
                      )}
                    </div>
                    <div className="text-center text-white drop-shadow-lg text-xs bg-black/40 px-2 py-1 rounded">
                      🔒 Drop exclusivo • Expira em {duration}
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition pointer-events-auto">
                    <button onClick={() => {
                      if (videoRef.current && videoFile?.type.startsWith("video/")) {
                        isPlaying ? videoRef.current.pause() : videoRef.current.play();
                        setIsPlaying(!isPlaying);
                      }
                    }}
                      className="p-3 bg-white/20 hover:bg-white/40 rounded-full transition">
                      {isPlaying ? <Pause className="h-6 w-6 text-white" /> : <Play className="h-6 w-6 text-white" />}
                    </button>
                  </div>

                  {/* X — remover/trocar vídeo */}
                  <button
                    onClick={() => {
                      setVideoFile(null);
                      setVideoUrl("");
                      setThumbnail("");
                      setIsPlaying(false);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/60 hover:bg-black/80 transition"
                    aria-label="Trocar vídeo/foto"
                  >
                    <X className="h-4 w-4 text-white" />
                  </button>
                </div>

                {/* Thumbnail */}
                {thumbnail && (
                  <div className="border rounded-lg p-2" style={{ borderColor: "var(--border-subtle)" }}>
                    <img src={thumbnail} alt="Thumbnail" className="w-full rounded max-h-16 object-cover" />
                  </div>
                )}

                {/* Generate Thumbnail Button */}
                <button onClick={generateThumbnail}
                  className="py-2 px-3 rounded-lg font-semibold text-sm transition w-full"
                  style={{ background: "#5B3FCF", color: "white" }}>
                  📸 Confirmar Thumbnail
                </button>
              </div>
            )}
          </div>

          {/* Right: Editor Tabs */}
          {videoUrl && (
            <div className="w-80 flex flex-col border-l" style={{ borderColor: "var(--border-subtle)" }}>
              
              {/* Tabs */}
              <div className="flex gap-2 p-3 border-b overflow-x-auto" style={{ borderColor: "var(--border-subtle)" }}>
                <button onClick={() => setActiveTab("fundo")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition whitespace-nowrap ${
                    activeTab === "fundo" ? "text-white" : "text-gray-500 hover:text-gray-700"
                  }`}
                  style={{ background: activeTab === "fundo" ? "#5B3FCF" : "transparent" }}>
                  Fundo
                </button>
                <button onClick={() => setActiveTab("texto")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition whitespace-nowrap ${
                    activeTab === "texto" ? "text-white" : "text-gray-500 hover:text-gray-700"
                  }`}
                  style={{ background: activeTab === "texto" ? "#5B3FCF" : "transparent" }}>
                  <Type className="h-3 w-3 inline mr-1" /> Texto
                </button>
                <button onClick={() => setActiveTab("filtros")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition whitespace-nowrap ${
                    activeTab === "filtros" ? "text-white" : "text-gray-500 hover:text-gray-700"
                  }`}
                  style={{ background: activeTab === "filtros" ? "#5B3FCF" : "transparent" }}>
                  ✨ Filtros
                </button>
                <button onClick={() => setActiveTab("musica")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition whitespace-nowrap ${
                    activeTab === "musica" ? "text-white" : "text-gray-500 hover:text-gray-700"
                  }`}
                  style={{ background: activeTab === "musica" ? "#5B3FCF" : "transparent" }}>
                  🎵 Música
                </button>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                
                {/* Fundo Tab */}
                {activeTab === "fundo" && (
                  <div className="space-y-3">
                    <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Cor de Fundo:</label>
                    <input type="color" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)}
                      className="w-full h-10 rounded-lg cursor-pointer" />
                    <button onClick={() => fileInputRef.current?.click()}
                      className="w-full py-2 px-3 rounded-lg text-sm font-semibold"
                      style={{ background: "var(--s2)", color: "var(--text-primary)" }}>
                      📁 Trocar vídeo/foto
                    </button>
                  </div>
                )}

                {/* Texto Tab */}
                {activeTab === "texto" && (
                  <div className="space-y-3">
                    <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Adicionar Texto:</label>
                    <textarea value={textOverlay} onChange={(e) => setTextOverlay(e.target.value)}
                      placeholder="Escreve aqui..." maxLength={100}
                      className="w-full h-24 p-2 rounded-lg text-sm border outline-none"
                      style={{ borderColor: "var(--border-subtle)", background: "var(--s1)", color: "var(--text-primary)" }} />
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{textOverlay.length}/100</p>
                  </div>
                )}

                {/* Filtros Tab */}
                {activeTab === "filtros" && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Efeitos:</label>
                    {[
                      { name: "Nenhum", value: "none" },
                      { name: "Preto & Branco", value: "grayscale(100%)" },
                      { name: "Sépia", value: "sepia(100%)" },
                      { name: "Blur", value: "blur(3px)" },
                      { name: "Brilho", value: "brightness(1.3)" },
                    ].map((f) => (
                      <button key={f.value} onClick={() => setSelectedFilter(f.value)}
                        className={`w-full py-2 px-2 rounded-lg text-xs font-semibold transition ${
                          selectedFilter === f.value ? "text-white" : ""
                        }`}
                        style={{ background: selectedFilter === f.value ? "#5B3FCF" : "var(--s2)", color: selectedFilter === f.value ? "white" : "var(--text-primary)" }}>
                        {f.name}
                      </button>
                    ))}
                  </div>
                )}

                {/* Música Tab */}
                {activeTab === "musica" && (
                  <div className="space-y-3">
                    <button onClick={() => setShowMusicLib(true)}
                      className="w-full py-2 px-3 rounded-lg text-sm font-semibold flex items-center gap-2"
                      style={{ background: "var(--s2)", color: "var(--text-primary)" }}>
                      <Music className="h-4 w-4" /> {musicTitle ? "Trocar Música" : "Escolher Música"}
                    </button>
                    {musicUrl && (
                      <div className="space-y-2">
                        {musicTitle && (
                          <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>🎵 {musicTitle}</p>
                        )}
                        <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Volume: {musicVolume}%</label>
                        <input type="range" min="0" max="100" value={musicVolume}
                          onChange={(e) => setMusicVolume(parseInt(e.target.value))}
                          className="w-full" />
                        <button onClick={() => { setMusicUrl(""); setMusicTitle(""); }}
                          className="text-[10px] font-semibold underline" style={{ color: "var(--text-muted)" }}>
                          Remover música
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Duração */}
                <div className="border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
                  <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Duração do Drop:</label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {["6h", "12h", "24h", "48h"].map((d) => (
                      <button key={d} onClick={() => setDuration(d)}
                        className={`py-2 px-2 rounded-lg text-xs font-semibold transition ${
                          duration === d ? "text-white" : ""
                        }`}
                        style={{ background: duration === d ? "#5B3FCF" : "var(--s2)", color: duration === d ? "white" : "var(--text-primary)" }}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {videoUrl && (
          <div className="flex gap-3 p-4 border-t" style={{ borderColor: "var(--border-subtle)" }}>
            {uploading && (
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--s2)" }}>
                  <div className="h-full transition-all" style={{ width: `${progress}%`, background: "#5B3FCF" }} />
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{progress}%</p>
              </div>
            )}
            <button onClick={onClose}
              className="flex-1 py-2 rounded-lg font-semibold"
              style={{ background: "var(--s2)", color: "var(--text-primary)" }}>
              Cancelar
            </button>
            <button onClick={uploadToCloudinary}
              disabled={uploading || !thumbnail}
              className="flex-1 py-2 rounded-lg font-semibold text-white transition disabled:opacity-50"
              style={{ background: "#5B3FCF" }}>
              {uploading ? "Enviando..." : "🚀 Publicar Drop"}
            </button>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />

        {showMusicLib && (
          <MusicLibrary onSelect={handleMusicSelect} onClose={() => setShowMusicLib(false)} />
        )}
      </div>
    </div>
  );
}
