import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { myChannelQuery } from "@/lib/channel-queries";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { ImagePlus, Loader2, Save } from "lucide-react";
import { SIGNATURE_FONTS } from "@/components/HoodaPlayer";

const SIGNATURE_FONT_LABELS: Record<string, string> = {
  padrao: "Padrão",
  serifada: "Serifada",
  moderna: "Moderna",
  manuscrita: "Manuscrita",
  condensada: "Condensada",
  maquina: "Máquina de Escrever",
};

export const Route = createFileRoute("/studio/personalizacao")({
  component: StudioPersonalizacao,
});

function StudioPersonalizacao() {
  const queryClient = useQueryClient();
  const { data: channel, isLoading } = useQuery(myChannelQuery());

  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermarkType, setWatermarkType] = useState("text");
  const [watermarkText, setWatermarkText] = useState("");
  const [watermarkImageUrl, setWatermarkImageUrl] = useState("");
  const [watermarkSize, setWatermarkSize] = useState("medium");
  const [watermarkOpacity, setWatermarkOpacity] = useState([80]);
  const [watermarkPosition, setWatermarkPosition] = useState("bottom-right");

  const [signatureEnabled, setSignatureEnabled] = useState(false);
  const [signatureStyle, setSignatureStyle] = useState("medium");
  const [signaturePosition, setSignaturePosition] = useState("bottom-left");
  const [signatureFont, setSignatureFont] = useState("padrao");

  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    if (channel) {
      const c = channel as any;
      setWatermarkEnabled(c.watermark_enabled ?? false);
      setWatermarkType(c.watermark_type ?? "text");
      setWatermarkText(c.watermark_text ?? "");
      setWatermarkImageUrl(c.watermark_image_url ?? "");
      setWatermarkSize(c.watermark_size ?? "medium");
      setWatermarkOpacity([c.watermark_opacity ?? 80]);
      setWatermarkPosition(c.watermark_position ?? "bottom-right");

      setSignatureEnabled(c.signature_enabled ?? false);
      setSignatureStyle(c.signature_style ?? "medium");
      setSignaturePosition(c.signature_position ?? "bottom-left");
      setSignatureFont(c.signature_font ?? "padrao");
    }
  }, [channel]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase
        .from("channels")
        .update(data)
        .eq("id", channel!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-channel"] });
      toast.success("Definições de personalização guardadas!");
    },
    onError: (err) => {
      toast.error("Erro ao guardar: " + err.message);
    }
  });

  const handleSave = () => {
    if (!channel) return;
    updateMutation.mutate({
      watermark_enabled: watermarkEnabled,
      watermark_type: watermarkType,
      watermark_text: watermarkText,
      watermark_image_url: watermarkImageUrl,
      watermark_size: watermarkSize,
      watermark_opacity: watermarkOpacity[0],
      watermark_position: watermarkPosition,
      signature_enabled: signatureEnabled,
      signature_style: signatureStyle,
      signature_position: signaturePosition,
      signature_font: signatureFont,
    });
  };

  const uploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploadingLogo(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${channel!.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("channel-assets")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("channel-assets")
        .getPublicUrl(filePath);

      setWatermarkImageUrl(publicUrl);
      toast.success("Logo carregado com sucesso!");
    } catch (error: any) {
      toast.error("Erro ao fazer upload do logo: " + error.message);
    } finally {
      setUploadingLogo(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-purple-500" /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in zoom-in-95">
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Personalização do Canal</h1>
          <p className="text-muted-foreground">Configura a marca de água e a assinatura para os teus vídeos.</p>
        </div>
        <Button onClick={handleSave} disabled={updateMutation.isPending}
          className="bg-purple-600 hover:bg-purple-700 text-white gap-2 rounded-xl">
          {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        
        {/* WATERMARK SETTINGS */}
        <div className="space-y-6 border rounded-2xl p-6 bg-card">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Marca de Água</h2>
              <p className="text-sm text-muted-foreground">Sobrepõe um logo ou texto nos teus vídeos.</p>
            </div>
            <Switch checked={watermarkEnabled} onCheckedChange={setWatermarkEnabled} />
          </div>

          {watermarkEnabled && (
            <div className="space-y-5 animate-in slide-in-from-top-2">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={watermarkType} onValueChange={setWatermarkType}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texto (@nome)</SelectItem>
                    <SelectItem value="image">Imagem (Logo PNG)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {watermarkType === "text" ? (
                <div className="space-y-2">
                  <Label>Texto da Marca de Água</Label>
                  <Input 
                    value={watermarkText} 
                    onChange={e => setWatermarkText(e.target.value)} 
                    placeholder={`Ex: @${channel?.handle}`} 
                    className="rounded-xl"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Upload do Logo (PNG recomendado)</Label>
                  <div className="flex gap-4 items-center">
                    {watermarkImageUrl ? (
                      <img src={watermarkImageUrl} alt="Logo" className="w-16 h-16 object-contain border rounded-xl bg-black/5" />
                    ) : (
                      <div className="w-16 h-16 border rounded-xl bg-black/5 flex items-center justify-center">
                        <ImagePlus className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div>
                      <Label htmlFor="logo-upload" className="cursor-pointer">
                        <div className="bg-secondary text-secondary-foreground hover:bg-secondary/80 px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                          {uploadingLogo ? "A carregar..." : "Escolher Imagem"}
                        </div>
                      </Label>
                      <input id="logo-upload" type="file" accept="image/png, image/jpeg" className="hidden" onChange={uploadLogo} disabled={uploadingLogo} />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tamanho</Label>
                  <Select value={watermarkSize} onValueChange={setWatermarkSize}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">Pequeno</SelectItem>
                      <SelectItem value="medium">Médio</SelectItem>
                      <SelectItem value="large">Grande</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Posição</Label>
                  <Select value={watermarkPosition} onValueChange={setWatermarkPosition}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="top-left">Canto Sup. Esquerdo</SelectItem>
                      <SelectItem value="top-right">Canto Sup. Direito</SelectItem>
                      <SelectItem value="bottom-left">Canto Inf. Esquerdo</SelectItem>
                      <SelectItem value="bottom-right">Canto Inf. Direito</SelectItem>
                      <SelectItem value="center">Centro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label>Opacidade</Label>
                  <span className="text-sm text-muted-foreground">{watermarkOpacity}%</span>
                </div>
                <Slider 
                  value={watermarkOpacity} 
                  onValueChange={setWatermarkOpacity} 
                  max={100} 
                  step={1} 
                />
              </div>
            </div>
          )}
        </div>

        {/* SIGNATURE SETTINGS */}
        <div className="space-y-6 border rounded-2xl p-6 bg-card">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Assinatura do Canal</h2>
              <p className="text-sm text-muted-foreground">Texto automático mostrando o nome do teu canal.</p>
            </div>
            <Switch checked={signatureEnabled} onCheckedChange={setSignatureEnabled} />
          </div>

          {signatureEnabled && (
            <div className="space-y-5 animate-in slide-in-from-top-2">
              
              <div className="space-y-2">
                <Label>Tipo de Letra</Label>
                <Select value={signatureFont} onValueChange={setSignatureFont}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(SIGNATURE_FONTS).map((key) => (
                      <SelectItem key={key} value={key} style={{ fontFamily: SIGNATURE_FONTS[key] }}>
                        {SIGNATURE_FONT_LABELS[key] ?? key}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Estilo</Label>
                <Select value={signatureStyle} onValueChange={setSignatureStyle}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Pequeno Discreto</SelectItem>
                    <SelectItem value="medium">Médio Padrão</SelectItem>
                    <SelectItem value="large">Grande Visível</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Posição</Label>
                <Select value={signaturePosition} onValueChange={setSignaturePosition}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bottom-left">Canto Inferior Esquerdo</SelectItem>
                    <SelectItem value="bottom-right">Canto Inferior Direito</SelectItem>
                    <SelectItem value="top-left">Topo Esquerdo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

            </div>
          )}
        </div>
        
      </div>
    </div>
  );
}
