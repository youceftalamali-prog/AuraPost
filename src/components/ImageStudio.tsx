import React, { useState, useEffect, useRef } from "react";
import { 
  Sparkles, 
  Image as ImageIcon, 
  RefreshCw, 
  Copy, 
  Check, 
  Layers, 
  Download, 
  Type, 
  Square, 
  Circle as CircleIcon, 
  Trash2, 
  Lock, 
  Unlock, 
  Sliders, 
  Eye, 
  EyeOff, 
  Palette, 
  Maximize2, 
  RotateCw, 
  Upload, 
  ShieldCheck, 
  Share2, 
  Camera, 
  Compass, 
  FileText, 
  ChevronUp, 
  ChevronDown, 
  CheckCircle2, 
  Star,
  Zap,
  Tag,
  Gift,
  HelpCircle,
  AlertCircle
} from "lucide-react";
import { NormalizedProduct, ContentGenerationRecord } from "../types.ts";
import { ImageAnalysisReport } from "../../server/ai/image-studio.ts";

interface ImageStudioProps {
  workspaceId: string;
  onAddAuditLog: (action: string, details: string) => void;
  selectedProductIdFromCatalog?: string;
  initialActiveTab?: "copy" | "graphics";
  testMode?: boolean;
}

interface VisualLayer {
  id: string;
  type: "background" | "text" | "shape" | "sticker";
  name: string;
  x: number; // absolute virtual coordinate (0-800 scale)
  y: number; // absolute virtual coordinate (0-800 scale)
  width: number;
  height: number;
  rotation: number; // degrees
  color: string;
  opacity: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  shapeType?: "rectangle" | "circle" | "triangle" | "star";
  stickerType?: "star" | "sparkle" | "badge" | "sale-tag" | "gift";
  locked?: boolean;
  visible?: boolean;
}

// Preset visual templates that can be loaded and edited instantly in the manual editor
const TEMPLATES_LIBRARY = [
  {
    id: "insta-launch",
    name: "Instagram Launch Promo (1:1)",
    category: "Instagram Posts",
    aspectRatio: "1:1" as const,
    canvasWidth: 800,
    canvasHeight: 800,
    layers: [
      {
        id: "bg-1",
        type: "background" as const,
        name: "Luxury Slate Marble",
        x: 0, y: 0, width: 800, height: 800, rotation: 0,
        color: "#1a1a24", opacity: 1,
        text: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80"
      },
      {
        id: "shape-border",
        type: "shape" as const,
        name: "Gold Thin Border",
        x: 40, y: 40, width: 720, height: 720, rotation: 0,
        color: "rgba(212, 175, 55, 0.4)", opacity: 1,
        shapeType: "rectangle" as const
      },
      {
        id: "text-head",
        type: "text" as const,
        name: "Primary Header",
        x: 400, y: 150, width: 600, height: 80, rotation: 0,
        color: "#ffffff", opacity: 1,
        text: "THE VANGUARD COLLECTION",
        fontSize: 38, fontFamily: "sans-serif", fontWeight: "bold"
      },
      {
        id: "text-sub",
        type: "text" as const,
        name: "Action Subtitle",
        x: 400, y: 680, width: 500, height: 50, rotation: 0,
        color: "#d4af37", opacity: 1,
        text: "NOW ACTIVE & SHIPPING GLOBALLY",
        fontSize: 18, fontFamily: "monospace", fontWeight: "medium"
      },
      {
        id: "sticker-star-1",
        type: "sticker" as const,
        name: "Gold Accent Star Left",
        x: 100, y: 680, width: 40, height: 40, rotation: 0,
        color: "#d4af37", opacity: 0.8,
        stickerType: "sparkle" as const
      },
      {
        id: "sticker-star-2",
        type: "sticker" as const,
        name: "Gold Accent Star Right",
        x: 700, y: 680, width: 40, height: 40, rotation: 0,
        color: "#d4af37", opacity: 0.8,
        stickerType: "sparkle" as const
      }
    ]
  },
  {
    id: "shopify-summer",
    name: "Shopify Store Banner (16:9)",
    category: "Ecommerce Banners",
    aspectRatio: "16:9" as const,
    canvasWidth: 800,
    canvasHeight: 450,
    layers: [
      {
        id: "bg-2",
        type: "background" as const,
        name: "Warm Organic Oak",
        x: 0, y: 0, width: 800, height: 450, rotation: 0,
        color: "#1f140d", opacity: 1,
        text: "https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=800&q=80"
      },
      {
        id: "badge-box",
        type: "shape" as const,
        name: "Tag Overlay Box",
        x: 100, y: 180, width: 260, height: 90, rotation: -3,
        color: "rgba(239, 68, 68, 0.95)", opacity: 1,
        shapeType: "rectangle" as const
      },
      {
        id: "text-sale",
        type: "text" as const,
        name: "Promo Text",
        x: 230, y: 225, width: 240, height: 50, rotation: -3,
        color: "#ffffff", opacity: 1,
        text: "50% OFF TODAY",
        fontSize: 24, fontFamily: "sans-serif", fontWeight: "bold"
      },
      {
        id: "text-title",
        type: "text" as const,
        name: "Main Title",
        x: 400, y: 80, width: 700, height: 60, rotation: 0,
        color: "#ffffff", opacity: 1,
        text: "MID-SEASON ARCHIVE SWEEP",
        fontSize: 34, fontFamily: "sans-serif", fontWeight: "bold"
      },
      {
        id: "text-desc",
        type: "text" as const,
        name: "Secondary Detail",
        x: 400, y: 350, width: 600, height: 40, rotation: 0,
        color: "#e2e8f0", opacity: 0.9,
        text: "Unparalleled structural precision. Built to accompany your journey.",
        fontSize: 14, fontFamily: "sans-serif", fontWeight: "normal"
      }
    ]
  },
  {
    id: "tiktok-vertical",
    name: "Reels / TikTok Cover (9:16)",
    category: "Social Media Covers",
    aspectRatio: "9:16" as const,
    canvasWidth: 450,
    canvasHeight: 800,
    layers: [
      {
        id: "bg-3",
        type: "background" as const,
        name: "Cyber Neon Glow",
        x: 0, y: 0, width: 450, height: 800, rotation: 0,
        color: "#08010f", opacity: 1,
        text: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=800&q=80"
      },
      {
        id: "card-body",
        type: "shape" as const,
        name: "Neon Tech Overlay",
        x: 25, y: 150, width: 400, height: 500, rotation: 0,
        color: "rgba(0, 0, 0, 0.75)", opacity: 1,
        shapeType: "rectangle" as const
      },
      {
        id: "border-teal",
        type: "shape" as const,
        name: "Teal Tech Border",
        x: 35, y: 160, width: 380, height: 480, rotation: 0,
        color: "rgba(20, 184, 166, 0.3)", opacity: 1,
        shapeType: "rectangle" as const
      },
      {
        id: "text-tech",
        type: "text" as const,
        name: "Main Caption",
        x: 225, y: 360, width: 340, height: 120, rotation: 0,
        color: "#14b8a6", opacity: 1,
        text: "NEXT GENERATION\nGEAR LAUNCHED",
        fontSize: 26, fontFamily: "monospace", fontWeight: "bold"
      },
      {
        id: "text-date",
        type: "text" as const,
        name: "Footer Label",
        x: 225, y: 550, width: 300, height: 40, rotation: 0,
        color: "#d8b4fe", opacity: 1,
        text: "DROP 01 // LIMITLESS COMMERCE",
        fontSize: 12, fontFamily: "monospace", fontWeight: "bold"
      },
      {
        id: "sticker-bolt",
        type: "sticker" as const,
        name: "Neon Bolt icon",
        x: 225, y: 240, width: 60, height: 60, rotation: 0,
        color: "#14b8a6", opacity: 0.9,
        stickerType: "sale-tag" as const
      }
    ]
  }
];

export default function ImageStudio({
  workspaceId,
  onAddAuditLog,
  selectedProductIdFromCatalog,
  initialActiveTab = "copy",
  testMode = false
}: ImageStudioProps) {
  const [products, setProducts] = useState<NormalizedProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  
  const [selectedProductId, setSelectedProductId] = useState("");
  const [contentType, setContentType] = useState("package");
  const [languageCode, setLanguageCode] = useState("en");
  
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  
  // Content states
  const [history, setHistory] = useState<ContentGenerationRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<"copy" | "graphics">(initialActiveTab);

  // --- IMAGE STUDIO PRO CORE STATE ---
  const [studioSubTab, setStudioSubTab] = useState<"templates" | "ai-gen" | "backdrops" | "manual" | "camera-shoot" | "brand-kit" | "social-guides" | "audit" | "assets">("templates");
  
  // Canvas Resolution
  const [canvasAspectRatio, setCanvasAspectRatio] = useState<"1:1" | "9:16" | "16:9">("1:1");
  const [canvasWidth, setCanvasWidth] = useState(800);
  const [canvasHeight, setCanvasHeight] = useState(800);
  
  // Active Manual Layers Array
  const [layers, setLayers] = useState<VisualLayer[]>([
    {
      id: "bg-default",
      type: "background",
      name: "Default White Canvas",
      x: 0, y: 0, width: 800, height: 800, rotation: 0,
      color: "#ffffff", opacity: 1,
      text: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80"
    },
    {
      id: "txt-hero",
      type: "text",
      name: "Hero Header",
      x: 400, y: 180, width: 600, height: 80, rotation: 0,
      color: "#0f172a", opacity: 1,
      text: "REFINED MINIMALISM",
      fontSize: 42, fontFamily: "sans-serif", fontWeight: "bold"
    },
    {
      id: "shape-decor",
      type: "shape",
      name: "Thin Gold Accent Line",
      x: 400, y: 250, width: 300, height: 4, rotation: 0,
      color: "#10b981", opacity: 0.9,
      shapeType: "rectangle"
    }
  ]);

  const [selectedLayerId, setSelectedLayerId] = useState<string | null>("txt-hero");
  
  // Input fields for controls
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiProvider, setAiProvider] = useState("flux");
  const [aiGenerating, setAiGenerating] = useState(false);
  
  // Manual text edits state
  const [layerText, setLayerText] = useState("");
  const [layerColor, setLayerColor] = useState("#000000");
  const [layerFontSize, setLayerFontSize] = useState(24);
  const [layerRotation, setLayerRotation] = useState(0);
  const [layerOpacity, setLayerOpacity] = useState(1);
  const [layerFontFamily, setLayerFontFamily] = useState("sans-serif");

  // Drag & drop state
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Brand kit sync cache
  const [brandIntelligence, setBrandIntelligence] = useState<any>(null);
  const [loadingBrandKit, setLoadingBrandKit] = useState(false);

  // Gemini Vision audit state
  const [auditing, setAuditing] = useState(false);
  const [auditReport, setAuditReport] = useState<ImageAnalysisReport | null>(null);

  // Asset library snapshots
  const [savedAssets, setSavedAssets] = useState<Array<{ id: string; url: string; date: string; name: string }>>([
    {
      id: "asset-1",
      url: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1000&q=80",
      date: "2026-06-28",
      name: "Core Minimalist Watch"
    },
    {
      id: "asset-2",
      url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1000&q=80",
      date: "2026-06-28",
      name: "Vanguard Studio Headphones"
    }
  ]);

  const [socialOverlay, setSocialOverlay] = useState<boolean>(false);

  // Load product list
  const loadProducts = async () => {
    setLoadingProducts(true);
    try {
      const response = await fetch(`/api/products?workspaceId=${workspaceId}`);
      if (response.ok) {
        const data = await response.json();
        const list = Array.isArray(data) ? data : [];
        setProducts(list);
        if (list.length > 0) {
          const targetId = selectedProductIdFromCatalog || list[0].id || "";
          setSelectedProductId(targetId);
        }
      }
    } catch (err) {
      console.error("Error reading products list:", err);
    } finally {
      setLoadingProducts(false);
    }
  };

  const loadContentHistory = async (prodId: string) => {
    if (!prodId) return;
    setLoadingHistory(true);
    try {
      const response = await fetch(`/api/content/history/${prodId}?workspaceId=${workspaceId}`);
      if (response.ok) {
        const data = await response.json();
        setHistory(data.history || []);
      }
    } catch (err) {
      console.error("Error loading content history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadBrandKitData = async (prodId: string) => {
    if (!prodId) return;
    setLoadingBrandKit(true);
    try {
      const response = await fetch(`/api/intelligence/analysis?productId=${prodId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.latest && data.latest.brandIntelligence) {
          setBrandIntelligence(data.latest.brandIntelligence);
        } else {
          setBrandIntelligence(null);
        }
      }
    } catch (err) {
      console.error("[ImageStudio] Brand Kit fetch failure:", err);
    } finally {
      setLoadingBrandKit(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [workspaceId, selectedProductIdFromCatalog]);

  useEffect(() => {
    setActiveTab(initialActiveTab);
  }, [initialActiveTab]);

  useEffect(() => {
    if (selectedProductId) {
      loadContentHistory(selectedProductId);
      loadBrandKitData(selectedProductId);
    }
  }, [selectedProductId]);

  // Sync active layer values to inputs
  useEffect(() => {
    const activeLayer = layers.find(l => l.id === selectedLayerId);
    if (activeLayer) {
      setLayerText(activeLayer.text || "");
      setLayerColor(activeLayer.color);
      setLayerFontSize(activeLayer.fontSize || 24);
      setLayerRotation(activeLayer.rotation);
      setLayerOpacity(activeLayer.opacity);
      setLayerFontFamily(activeLayer.fontFamily || "sans-serif");
    }
  }, [selectedLayerId, layers]);

  // Handle copywriting bundle trigger
  const handleTriggerGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) return;

    setGenerating(true);
    try {
      const response = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProductId,
          workspaceId,
          contentType,
          languageCode
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to trigger content generation");
      }

      onAddAuditLog("content.generate_start", `Enqueued background AI copy creation for product ${selectedProductId}`);
      
      setTimeout(() => {
        loadContentHistory(selectedProductId);
        setGenerating(false);
        alert("Creative copywriting bundle compiled successfully! View your generated copy cards in the 'Copy Deck' sub-tab.");
      }, 3500);

    } catch (err: any) {
      alert(err.message || "Balance error or missing configuration.");
      setGenerating(false);
    }
  };

  // Drag handlers
  const handleLayerMouseDown = (e: React.MouseEvent, layer: VisualLayer) => {
    if (layer.locked) return;
    e.stopPropagation();
    setSelectedLayerId(layer.id);
    setIsDragging(true);

    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = canvasWidth / rect.width;
      const scaleY = canvasHeight / rect.height;

      // Mouse position inside canvas virtual coords
      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;

      setDragOffset({
        x: mouseX - layer.x,
        y: mouseY - layer.y
      });
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !selectedLayerId) return;
    const activeLayer = layers.find(l => l.id === selectedLayerId);
    if (!activeLayer || activeLayer.locked) return;

    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = canvasWidth / rect.width;
      const scaleY = canvasHeight / rect.height;

      const mouseX = (e.clientX - rect.left) * scaleX;
      const mouseY = (e.clientY - rect.top) * scaleY;

      // New coords bounded to virtual space (with reasonable padding)
      const nextX = Math.round(mouseX - dragOffset.x);
      const nextY = Math.round(mouseY - dragOffset.y);

      setLayers(layers.map(l => {
        if (l.id === selectedLayerId) {
          return { ...l, x: nextX, y: nextY };
        }
        return l;
      }));
    }
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(false);
  };

  // Layer Property Modification helper
  const updateActiveLayerProp = (key: keyof VisualLayer, value: any) => {
    if (!selectedLayerId) return;
    setLayers(layers.map(l => {
      if (l.id === selectedLayerId) {
        return { ...l, [key]: value };
      }
      return l;
    }));
  };

  // AI Generation Trigger
  const handleGenerateAIImage = async () => {
    if (!aiPrompt.trim()) return;
    setAiGenerating(true);
    try {
      const response = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          prompt: aiPrompt,
          provider: aiProvider,
          aspectRatio: canvasAspectRatio
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Generation error");

      // Replace or Add background layer with generated image
      setLayers(layers.map(l => {
        if (l.type === "background") {
          return {
            ...l,
            text: data.imageUrl,
            name: `AI Gen Backdrop (${aiProvider})`
          };
        }
        return l;
      }));

      // Add as asset in library too
      const newAsset = {
        id: `gen-${Date.now()}`,
        url: data.imageUrl,
        date: new Date().toISOString().split("T")[0],
        name: aiPrompt.substring(0, 20) || "AI Generation"
      };
      setSavedAssets([newAsset, ...savedAssets]);

      onAddAuditLog("image.ai_generate", `Successfully generated AI image utilizing provider ${aiProvider}`);
      alert("Success! Your generated background is set on the active canvas board.");
    } catch (err: any) {
      alert(err.message || "Failed to generate image.");
    } finally {
      setAiGenerating(false);
    }
  };

  // Quick background replacement preset handler
  const handleReplaceBackgroundPreset = (styleName: string, url: string) => {
    setLayers(layers.map(l => {
      if (l.type === "background") {
        return {
          ...l,
          text: url,
          name: `Preset Backdrop (${styleName})`
        };
      }
      return l;
    }));
    onAddAuditLog("image.change_backdrop", `Set backdrop theme to preset ${styleName}`);
  };

  // Add layer controls
  const handleAddTextLayer = () => {
    const id = `layer-text-${Date.now()}`;
    const newLayer: VisualLayer = {
      id,
      type: "text",
      name: `Headline Text ${layers.length + 1}`,
      x: 400,
      y: 400,
      width: 400,
      height: 50,
      rotation: 0,
      color: "#000000",
      opacity: 1,
      text: "Double Click To Edit",
      fontSize: 28,
      fontFamily: "sans-serif",
      fontWeight: "bold"
    };
    setLayers([...layers, newLayer]);
    setSelectedLayerId(id);
  };

  const handleAddShapeLayer = (shape: "rectangle" | "circle" | "triangle" | "star") => {
    const id = `layer-shape-${Date.now()}`;
    const newLayer: VisualLayer = {
      id,
      type: "shape",
      name: `Shape Layer (${shape})`,
      x: 400,
      y: 400,
      width: 150,
      height: 150,
      rotation: 0,
      color: "rgba(16, 185, 129, 0.5)",
      opacity: 0.8,
      shapeType: shape
    };
    setLayers([...layers, newLayer]);
    setSelectedLayerId(id);
  };

  const handleAddStickerLayer = (sticker: "star" | "sparkle" | "badge" | "sale-tag" | "gift") => {
    const id = `layer-sticker-${Date.now()}`;
    const newLayer: VisualLayer = {
      id,
      type: "sticker",
      name: `Accent Sticker (${sticker})`,
      x: 400,
      y: 400,
      width: 80,
      height: 80,
      rotation: 0,
      color: "#10b981",
      opacity: 1,
      stickerType: sticker
    };
    setLayers([...layers, newLayer]);
    setSelectedLayerId(id);
  };

  const handleDeleteLayer = (id: string) => {
    setLayers(layers.filter(l => l.id !== id));
    if (selectedLayerId === id) {
      setSelectedLayerId(null);
    }
  };

  const handleToggleLock = (id: string) => {
    setLayers(layers.map(l => {
      if (l.id === id) return { ...l, locked: !l.locked };
      return l;
    }));
  };

  const handleToggleVisible = (id: string) => {
    setLayers(layers.map(l => {
      if (l.id === id) return { ...l, visible: l.visible === false };
      return l;
    }));
  };

  // Re-ordering layers
  const handleMoveLayerZIndex = (index: number, direction: "up" | "down") => {
    const nextIndex = direction === "up" ? index + 1 : index - 1;
    if (nextIndex < 0 || nextIndex >= layers.length) return;
    
    // Background layer always remains at 0
    if (layers[index].type === "background" || layers[nextIndex].type === "background") return;

    const reordered = [...layers];
    const temp = reordered[index];
    reordered[index] = reordered[nextIndex];
    reordered[nextIndex] = temp;
    setLayers(reordered);
  };

  // Load Template Library presets
  const handleLoadTemplate = (tplId: string) => {
    const template = TEMPLATES_LIBRARY.find(t => t.id === tplId);
    if (!template) return;

    setCanvasAspectRatio(template.aspectRatio);
    setCanvasWidth(template.canvasWidth);
    setCanvasHeight(template.canvasHeight);
    setLayers(template.layers.map(l => ({ ...l, visible: true, locked: false })));
    setSelectedLayerId(template.layers[1]?.id || null);
    onAddAuditLog("image.load_template", `Loaded visual template ${template.name}`);
  };

  // Sync active Brand Kit values to design canvas
  const handleApplyBrandKitToCanvas = () => {
    if (!brandIntelligence) {
      alert("No AI Brand Kit analyzed. Sync or create Brand Kit metrics in Brand Kit Manager first!");
      return;
    }

    // Attempt to parse standard brand colors (e.g. primary, secondary)
    const traits = brandIntelligence.personalityTraits || brandIntelligence.traits || [];
    const brandColor = traits.includes("Authoritative") ? "#1e1b4b" : "#10b981"; // elegant navy or emerald
    
    // Apply brand styling to text layers
    setLayers(layers.map(l => {
      if (l.type === "text") {
        return {
          ...l,
          color: brandColor,
          fontFamily: "sans-serif",
          fontWeight: "bold"
        };
      }
      return l;
    }));

    onAddAuditLog("image.apply_brand_kit", `Synced and applied Brand Kit visual rules to workspace canvas`);
    alert("Applied brand color scheme & visual font preferences directly to your active text elements!");
  };

  // Resize canvas for social dimensions
  const handleResizeForSocial = (ratio: "1:1" | "9:16" | "16:9") => {
    setCanvasAspectRatio(ratio);
    if (ratio === "1:1") {
      setCanvasWidth(800);
      setCanvasHeight(800);
    } else if (ratio === "9:16") {
      setCanvasWidth(450);
      setCanvasHeight(800);
    } else if (ratio === "16:9") {
      setCanvasWidth(800);
      setCanvasHeight(450);
    }
  };

  // HTML5 Render to Base64 (for downloading and AI Vision audits)
  const drawAndExportCanvas = (): Promise<string> => {
    return new Promise((resolve) => {
      const canvasEl = document.createElement("canvas");
      canvasEl.width = canvasWidth;
      canvasEl.height = canvasHeight;
      const ctx = canvasEl.getContext("2d");
      if (!ctx) {
        resolve("");
        return;
      }

      // Draw each layer sequential from 0 index upwards (Z-index)
      let loadedCount = 0;
      const visibleLayers = layers.filter(l => l.visible !== false);

      const renderLayer = (index: number) => {
        if (index >= visibleLayers.length) {
          // Finished rendering all layers
          resolve(canvasEl.toDataURL("image/png"));
          return;
        }

        const layer = visibleLayers[index];
        ctx.save();
        ctx.globalAlpha = layer.opacity;

        // Apply rotation around the center of layer
        ctx.translate(layer.x, layer.y);
        ctx.rotate((layer.rotation * Math.PI) / 180);
        ctx.translate(-layer.x, -layer.y);

        if (layer.type === "background") {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.referrerPolicy = "no-referrer";
          img.onload = () => {
            ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
            ctx.restore();
            renderLayer(index + 1);
          };
          img.onerror = () => {
            // Draw default solid block fallback
            ctx.fillStyle = layer.color || "#0c0d12";
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);
            ctx.restore();
            renderLayer(index + 1);
          };
          img.src = layer.text || "";
        } else if (layer.type === "text") {
          ctx.fillStyle = layer.color;
          ctx.font = `${layer.fontWeight || "bold"} ${layer.fontSize || 24}px ${layer.fontFamily || "sans-serif"}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          // Support multi-line texts
          const lines = (layer.text || "").split("\n");
          const lineHeight = (layer.fontSize || 24) * 1.25;
          const startY = layer.y - ((lines.length - 1) * lineHeight) / 2;

          lines.forEach((line, i) => {
            ctx.fillText(line, layer.x, startY + i * lineHeight);
          });

          ctx.restore();
          renderLayer(index + 1);
        } else if (layer.type === "shape") {
          ctx.fillStyle = layer.color;
          const halfW = layer.width / 2;
          const halfH = layer.height / 2;

          if (layer.shapeType === "circle") {
            ctx.beginPath();
            ctx.arc(layer.x, layer.y, Math.min(halfW, halfH), 0, 2 * Math.PI);
            ctx.fill();
          } else if (layer.shapeType === "triangle") {
            ctx.beginPath();
            ctx.moveTo(layer.x, layer.y - halfH);
            ctx.lineTo(layer.x + halfW, layer.y + halfH);
            ctx.lineTo(layer.x - halfW, layer.y + halfH);
            ctx.closePath();
            ctx.fill();
          } else if (layer.shapeType === "star") {
            ctx.beginPath();
            const spikes = 5;
            const outerRadius = Math.min(halfW, halfH);
            const innerRadius = outerRadius * 0.4;
            let cx = layer.x;
            let cy = layer.y;
            let rot = (Math.PI / 2) * 3;
            let x = cx;
            let y = cy;
            const step = Math.PI / spikes;

            ctx.moveTo(cx, cy - outerRadius);
            for (let i = 0; i < spikes; i++) {
              x = cx + Math.cos(rot) * outerRadius;
              y = cy + Math.sin(rot) * outerRadius;
              ctx.lineTo(x, y);
              rot += step;

              x = cx + Math.cos(rot) * innerRadius;
              y = cy + Math.sin(rot) * innerRadius;
              ctx.lineTo(x, y);
              rot += step;
            }
            ctx.lineTo(cx, cy - outerRadius);
            ctx.closePath();
            ctx.fill();
          } else {
            // Default rectangle
            ctx.fillRect(layer.x - halfW, layer.y - halfH, layer.width, layer.height);
          }

          ctx.restore();
          renderLayer(index + 1);
        } else if (layer.type === "sticker") {
          // Render a gorgeous vector icon-sticker representing premium symbols
          ctx.fillStyle = layer.color;
          ctx.strokeStyle = layer.color;
          ctx.lineWidth = 4;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";

          const sSize = Math.min(layer.width, layer.height);
          const sX = layer.x - sSize / 2;
          const sY = layer.y - sSize / 2;

          ctx.beginPath();
          if (layer.stickerType === "sparkle") {
            ctx.moveTo(layer.x, layer.y - sSize / 2);
            ctx.quadraticCurveTo(layer.x, layer.y, layer.x + sSize / 2, layer.y);
            ctx.quadraticCurveTo(layer.x, layer.y, layer.x, layer.y + sSize / 2);
            ctx.quadraticCurveTo(layer.x, layer.y, layer.x - sSize / 2, layer.y);
            ctx.quadraticCurveTo(layer.x, layer.y, layer.x, layer.y - sSize / 2);
            ctx.fill();
          } else if (layer.stickerType === "sale-tag") {
            // Lightning symbol
            ctx.moveTo(layer.x + sSize * 0.1, layer.y - sSize * 0.4);
            ctx.lineTo(layer.x - sSize * 0.3, layer.y + sSize * 0.1);
            ctx.lineTo(layer.x, layer.y + sSize * 0.1);
            ctx.lineTo(layer.x - sSize * 0.1, layer.y + sSize * 0.4);
            ctx.lineTo(layer.x + sSize * 0.3, layer.y - sSize * 0.1);
            ctx.lineTo(layer.x, layer.y - sSize * 0.1);
            ctx.closePath();
            ctx.fill();
          } else {
            // Default elegant star outline + solid core
            ctx.arc(layer.x, layer.y, sSize / 3, 0, 2 * Math.PI);
            ctx.fill();
          }

          ctx.restore();
          renderLayer(index + 1);
        } else {
          ctx.restore();
          renderLayer(index + 1);
        }
      };

      // Start sequential render from back layer upwards
      renderLayer(0);
    });
  };

  // Download Action
  const handleDownloadCanvasPNG = async () => {
    const base64 = await drawAndExportCanvas();
    if (!base64) return;

    const link = document.createElement("a");
    link.download = `aurapost-creative-${canvasAspectRatio}.png`;
    link.href = base64;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onAddAuditLog("image.download", `Exported and downloaded visual design file`);
  };

  // Save Canvas PNG to Asset library
  const handleSaveToAssetLibrary = async () => {
    const base64 = await drawAndExportCanvas();
    if (!base64) return;

    const newAsset = {
      id: `asset-${Date.now()}`,
      url: base64,
      date: new Date().toISOString().split("T")[0],
      name: `Canvas Design (${layers.find(l => l.type === "text")?.text?.substring(0, 15) || "Custom design"})`
    };
    setSavedAssets([newAsset, ...savedAssets]);
    onAddAuditLog("image.save_library", `Saved current workspace canvas snapshot to asset library`);
    alert("Saved! This custom design snapshot is now loaded in your Asset Library tab.");
  };

  // Run AI Vision Audit via Gemini Vision API
  const handleRunAIVisionAudit = async () => {
    setAuditing(true);
    setAuditReport(null);
    try {
      const base64 = await drawAndExportCanvas();
      if (!base64) throw new Error("Could not capture canvas workspace");

      const response = await fetch("/api/images/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          imageBase64: base64,
          productTitle: activeProduct?.title || "Luxury E-commerce product"
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Analysis failed");

      setAuditReport(data);
      onAddAuditLog("image.audit", `Triggered real Gemini Vision conversion & marketing audit`);
    } catch (err: any) {
      alert(err.message || "Failed to audit design.");
    } finally {
      setAuditing(false);
    }
  };

  const activeProduct = products.find(p => p.id === selectedProductId);
  const latestContent = history[0];

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="bg-[#12131a] rounded-2xl border border-gray-850 p-6 space-y-6">
      
      {/* Top Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-900 pb-5">
        <div>
          <h3 className="text-xl font-display font-bold text-white flex items-center gap-2.5">
            <ImageIcon className="w-5.5 h-5.5 text-emerald-400" />
            AuraPost Image Studio Pro
            <span className="text-[9px] uppercase tracking-wider font-mono font-bold bg-indigo-950/40 text-indigo-400 border border-indigo-900/60 rounded px-1.5 py-0.5">
              Enterprise v2.0
            </span>
          </h3>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">
            Centralized creative suite: Canva-style manual layer canvas, AI backdrop generator, premium templates, and real-time Gemini Vision performance audit.
          </p>
        </div>

        {/* Outer Copy Deck vs Creative Graphics selector */}
        <div className="flex gap-1 bg-[#0c0d12] p-1.5 rounded-xl border border-gray-850">
          <button
            onClick={() => setActiveTab("copy")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold font-display transition-all cursor-pointer ${
              activeTab === "copy" ? "bg-indigo-600 text-white shadow" : "text-gray-400 hover:text-white"
            }`}
          >
            Copy Deck Generator
          </button>
          <button
            onClick={() => setActiveTab("graphics")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold font-display transition-all cursor-pointer ${
              activeTab === "graphics" ? "bg-indigo-600 text-white shadow" : "text-gray-400 hover:text-white"
            }`}
          >
            Creative Graphics Studio
          </button>
        </div>
      </div>

      {activeTab === "copy" ? (
        /* ==================== ORIGINAL COPY DECK VIEW ==================== */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Copywriter Control Panel Left */}
          <div className="lg:col-span-4 bg-[#0c0d12] p-5 rounded-xl border border-gray-850 space-y-4">
            <span className="text-[10px] font-mono text-indigo-400 font-bold block uppercase tracking-wider border-b border-gray-900 pb-2">
              Copy Deck Control Panel
            </span>

            <form onSubmit={handleTriggerGenerate} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-300 block">Select Active Product</label>
                {loadingProducts ? (
                  <div className="h-9 bg-[#12131a] rounded animate-pulse" />
                ) : (
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full bg-[#12131a] border border-gray-850 focus:border-indigo-500 rounded-lg p-2.5 text-xs text-white transition-all outline-none"
                  >
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-300 block">Package Composition</label>
                <select
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value)}
                  className="w-full bg-[#12131a] border border-gray-850 focus:border-indigo-500 rounded-lg p-2.5 text-xs text-white transition-all outline-none font-mono"
                >
                  <option value="package">Complete Ad Package (20 Credits)</option>
                  <option value="scripts">Video Scripts Only (10 Credits)</option>
                  <option value="hooks">Hook Variations Only (5 Credits)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-300 block">Language</label>
                <select
                  value={languageCode}
                  onChange={(e) => setLanguageCode(e.target.value)}
                  className="w-full bg-[#12131a] border border-gray-850 focus:border-indigo-500 rounded-lg p-2.5 text-xs text-white transition-all outline-none"
                >
                  <option value="en">English (US)</option>
                  <option value="fr">French</option>
                  <option value="es">Spanish</option>
                  <option value="ar">Arabic</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={generating || products.length === 0}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-gradient-to-r from-emerald-500 to-indigo-600 hover:from-emerald-400 hover:to-indigo-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-lg disabled:opacity-40"
              >
                {generating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Compiling Copy Bundle...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Creative Bundle
                  </>
                )}
              </button>
            </form>

            {/* History selection list */}
            <div className="pt-4 border-t border-gray-900 space-y-2">
              <span className="text-[10px] font-mono text-gray-400 font-bold block uppercase tracking-wider">
                Product Copy Drafts Vault
              </span>
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                {loadingHistory ? (
                  <div className="h-10 bg-[#12131a] rounded animate-pulse" />
                ) : history.length === 0 ? (
                  <p className="text-[10px] text-gray-500 font-mono italic">No drafts generated for this product in DB.</p>
                ) : (
                  history.map((record) => (
                    <div key={record.id} className="p-2 bg-[#12131a] border border-gray-850 rounded text-[10px] font-mono flex justify-between items-center">
                      <span className="capitalize text-gray-300">{record.contentType} draft</span>
                      <span className="text-gray-500">{record.createdAt ? record.createdAt.split("T")[0] : ""}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Copy Deck Output Screen Right */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-[#0c0d12]/80 border border-gray-850 rounded-xl p-6 space-y-6">
              
              <div className="border-b border-gray-900 pb-4">
                <span className="text-[10px] font-mono font-bold text-indigo-400 uppercase tracking-widest">
                  CREATIVE COPY DECK
                </span>
                <h4 className="text-base font-bold text-white font-display mt-0.5">
                  High-Conversion Marketing Variations
                </h4>
              </div>

              {!latestContent ? (
                <div className="text-center py-16 text-xs text-gray-550 font-mono max-w-md mx-auto space-y-3">
                  <Compass className="w-10 h-10 text-gray-700 mx-auto" />
                  <p>No active copywriting deck generated for this product.</p>
                  <p className="text-[10px] text-gray-550 leading-relaxed">
                    Trigger the <b>Generate Creative Bundle</b> workflow using DeepSeek model routers to compose semantic, benefit-led copywriting packages instantly.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Generated copy card 1 */}
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-emerald-400 font-display">Attention-Grabbing Hook</span>
                      <button
                        onClick={() => handleCopy("Stop settling for generic luxury. Discover hand-crafted precision designs built to elevate your daily style statement instantly.", "hook_copy")}
                        className="text-gray-500 hover:text-white flex items-center gap-1 text-[10px] font-mono transition-all cursor-pointer"
                      >
                        {copied === "hook_copy" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        {copied === "hook_copy" ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <p className="text-xs leading-relaxed text-gray-300 bg-[#12131a] p-4 rounded-xl border border-gray-850">
                      Stop settling for generic luxury. Discover hand-crafted precision designs built to elevate your daily style statement instantly.
                    </p>
                  </div>

                  {/* Generated copy card 2 */}
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-indigo-400 font-display">Social Media Ad Copy (Instagram/X)</span>
                      <button
                        onClick={() => handleCopy(`Designed for the modern vanguard. Introducing Vanguard's finest construction. Engineered with aerospace-grade durability and minimalist aesthetics. Elevate your everyday profile. Link in bio ⚡\n\n#style #vanguard #minimalist`, "social_copy")}
                        className="text-gray-500 hover:text-white flex items-center gap-1 text-[10px] font-mono transition-all cursor-pointer"
                      >
                        {copied === "social_copy" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        {copied === "social_copy" ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <p className="text-xs leading-relaxed text-gray-300 bg-[#12131a] p-4 rounded-xl border border-gray-850 whitespace-pre-wrap font-sans">
                      Designed for the modern vanguard. Introducing Vanguard's finest construction. Engineered with aerospace-grade durability and minimalist aesthetics. Elevate your everyday profile. Link in bio ⚡<br /><br />#style #vanguard #minimalist
                    </p>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      ) : (
        /* ==================== AURA_POST IMAGE STUDIO PRO MAIN WORKSPACE ==================== */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Controls Panels Column 1: Left Tab Tools (5/12) */}
          <div className="lg:col-span-5 bg-[#0c0d12] rounded-xl border border-gray-850 overflow-hidden flex flex-col min-h-[640px]">
            
            {/* Horizontal Sub-tabs selectors for Studio Modules */}
            <div className="bg-[#09090d] border-b border-gray-900 grid grid-cols-4 gap-1 p-2">
              <button
                onClick={() => setStudioSubTab("templates")}
                className={`py-2 px-1 text-[10px] font-mono uppercase font-bold rounded-md flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  studioSubTab === "templates" ? "bg-gray-900 text-indigo-400" : "text-gray-400 hover:text-white"
                }`}
                title="Templates"
              >
                <Compass className="w-3.5 h-3.5" />
                Templates
              </button>
              <button
                onClick={() => setStudioSubTab("ai-gen")}
                className={`py-2 px-1 text-[10px] font-mono uppercase font-bold rounded-md flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  studioSubTab === "ai-gen" ? "bg-gray-900 text-indigo-400" : "text-gray-400 hover:text-white"
                }`}
                title="AI Ad Gen"
              >
                <Sparkles className="w-3.5 h-3.5" />
                AI Gen
              </button>
              <button
                onClick={() => setStudioSubTab("backdrops")}
                className={`py-2 px-1 text-[10px] font-mono uppercase font-bold rounded-md flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  studioSubTab === "backdrops" ? "bg-gray-900 text-indigo-400" : "text-gray-400 hover:text-white"
                }`}
                title="AI Backdrops"
              >
                <Sliders className="w-3.5 h-3.5" />
                Backdrops
              </button>
              <button
                onClick={() => setStudioSubTab("manual")}
                className={`py-2 px-1 text-[10px] font-mono uppercase font-bold rounded-md flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  studioSubTab === "manual" ? "bg-gray-900 text-indigo-400" : "text-gray-400 hover:text-white"
                }`}
                title="Canvas Layers Editor"
              >
                <Layers className="w-3.5 h-3.5" />
                Layers
              </button>
              <button
                onClick={() => setStudioSubTab("camera-shoot")}
                className={`py-2 px-1 text-[10px] font-mono uppercase font-bold rounded-md flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  studioSubTab === "camera-shoot" ? "bg-gray-900 text-indigo-400" : "text-gray-400 hover:text-white"
                }`}
                title="Shoot Studio"
              >
                <Camera className="w-3.5 h-3.5" />
                Shoot
              </button>
              <button
                onClick={() => setStudioSubTab("brand-kit")}
                className={`py-2 px-1 text-[10px] font-mono uppercase font-bold rounded-md flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  studioSubTab === "brand-kit" ? "bg-gray-900 text-indigo-400" : "text-gray-400 hover:text-white"
                }`}
                title="Brand Kit sync"
              >
                <Palette className="w-3.5 h-3.5" />
                Brand Kit
              </button>
              <button
                onClick={() => setStudioSubTab("social-guides")}
                className={`py-2 px-1 text-[10px] font-mono uppercase font-bold rounded-md flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  studioSubTab === "social-guides" ? "bg-gray-900 text-indigo-400" : "text-gray-400 hover:text-white"
                }`}
                title="Social Guides"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                Guides
              </button>
              <button
                onClick={() => setStudioSubTab("audit")}
                className={`py-2 px-1 text-[10px] font-mono uppercase font-bold rounded-md flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  studioSubTab === "audit" ? "bg-gray-900 text-indigo-400" : "text-gray-400 hover:text-white"
                }`}
                title="AI Auditor"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                AI Audit
              </button>
            </div>

            {/* Sub-tab content blocks */}
            <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
              
              {/* MODULE 1: TEMPLATE LIBRARY */}
              {studioSubTab === "templates" && (
                <div className="space-y-4">
                  <div>
                    <span className="text-[10px] font-mono text-emerald-400 font-bold block uppercase tracking-wider">
                      Commercial Preset Templates
                    </span>
                    <p className="text-[11px] text-gray-400 leading-relaxed mt-1">
                      Load standard multi-platform ad presets instantly. Every layer remains 100% editable, resizable, and drag-and-drop.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {TEMPLATES_LIBRARY.map(tpl => (
                      <button
                        key={tpl.id}
                        onClick={() => handleLoadTemplate(tpl.id)}
                        className="w-full text-left p-3.5 rounded-lg bg-[#12131a] hover:bg-[#161722] border border-gray-850 hover:border-gray-800 transition-all flex justify-between items-center group cursor-pointer"
                      >
                        <div className="space-y-1">
                          <span className="text-xs font-bold text-white group-hover:text-indigo-400 transition-colors block">
                            {tpl.name}
                          </span>
                          <span className="text-[10px] font-mono text-gray-500 block">
                            Category: {tpl.category}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono bg-indigo-950/40 text-indigo-400 px-2 py-0.5 rounded border border-indigo-900/40">
                          {tpl.aspectRatio}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* MODULE 2: AI IMAGE GENERATOR */}
              {studioSubTab === "ai-gen" && (
                <div className="space-y-4">
                  <div>
                    <span className="text-[10px] font-mono text-emerald-400 font-bold block uppercase tracking-wider">
                      AI Image Generator
                    </span>
                    <p className="text-[11px] text-gray-400 leading-relaxed mt-1">
                      Input visual themes or descriptors. Flux, Gemini Images, OpenAI, and Stability models are fully supported.
                    </p>
                  </div>

                  <div className="space-y-3.5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-300 block">AI Generator Prompt</label>
                      <textarea
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder="A modern luxury gold perfume bottle resting on an exquisite marble slab surrounded by soft studio lighting, 4k photorealistic..."
                        className="w-full h-24 bg-[#12131a] border border-gray-850 rounded-lg p-3 text-xs text-white focus:border-indigo-500 transition-all outline-none resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-300 block">AI Provider</label>
                        <select
                          value={aiProvider}
                          onChange={(e) => setAiProvider(e.target.value)}
                          className="w-full h-9 bg-[#12131a] border border-gray-850 rounded-lg px-2 text-xs text-white outline-none"
                        >
                          <option value="flux">Flux (Default)</option>
                          <option value="gemini_images">Gemini Images</option>
                          <option value="openai_images">OpenAI Images</option>
                          <option value="stability_ai">Stability AI</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-gray-300 block">Aspect Ratio</label>
                        <select
                          value={canvasAspectRatio}
                          onChange={(e) => handleResizeForSocial(e.target.value as any)}
                          className="w-full h-9 bg-[#12131a] border border-gray-850 rounded-lg px-2 text-xs text-white outline-none"
                        >
                          <option value="1:1">Square (1:1)</option>
                          <option value="9:16">Vertical (9:16)</option>
                          <option value="16:9">Widescreen (16:9)</option>
                        </select>
                      </div>
                    </div>

                    <button
                      onClick={handleGenerateAIImage}
                      disabled={aiGenerating || !aiPrompt.trim()}
                      className="w-full h-10 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
                    >
                      {aiGenerating ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Synthesizing Scene...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Generate AI Image (Free)
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* MODULE 3: AI BACKDROP STUDIO & REMOVER */}
              {studioSubTab === "backdrops" && (
                <div className="space-y-4">
                  <div>
                    <span className="text-[10px] font-mono text-emerald-400 font-bold block uppercase tracking-wider">
                      Background Studio & AI Edits
                    </span>
                    <p className="text-[11px] text-gray-400 leading-relaxed mt-1">
                      Click a themed setting below to swap backdrop layers instantly.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 max-h-[260px] overflow-y-auto pr-1">
                    <button
                      onClick={() => handleReplaceBackgroundPreset("luxury-marble", "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80")}
                      className="p-3 text-left rounded bg-[#12131a] border border-gray-850 hover:bg-[#161722] hover:border-gray-800 transition-all text-xs font-medium text-gray-300 cursor-pointer block"
                    >
                      👑 Luxury Marble
                    </button>
                    <button
                      onClick={() => handleReplaceBackgroundPreset("natural-wood", "https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=800&q=80")}
                      className="p-3 text-left rounded bg-[#12131a] border border-gray-850 hover:bg-[#161722] hover:border-gray-800 transition-all text-xs font-medium text-gray-300 cursor-pointer block"
                    >
                      🌲 Natural Oak Desk
                    </button>
                    <button
                      onClick={() => handleReplaceBackgroundPreset("neon-studio", "https://images.unsplash.com/photo-1507608869274-d3177c8bb4c7?auto=format&fit=crop&w=800&q=80")}
                      className="p-3 text-left rounded bg-[#12131a] border border-gray-850 hover:bg-[#161722] hover:border-gray-800 transition-all text-xs font-medium text-gray-300 cursor-pointer block"
                    >
                      ⚡ Neon Studio Ads
                    </button>
                    <button
                      onClick={() => handleReplaceBackgroundPreset("cosmic-space", "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80")}
                      className="p-3 text-left rounded bg-[#12131a] border border-gray-850 hover:bg-[#161722] hover:border-gray-800 transition-all text-xs font-medium text-gray-300 cursor-pointer block"
                    >
                      🌌 Cosmic Space
                    </button>
                    <button
                      onClick={() => handleReplaceBackgroundPreset("clean-white", "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=800&q=80")}
                      className="p-3 text-left rounded bg-[#12131a] border border-gray-850 hover:bg-[#161722] hover:border-gray-800 transition-all text-xs font-medium text-gray-300 cursor-pointer block"
                    >
                      🥛 Pure Clean White
                    </button>
                    <button
                      onClick={() => handleReplaceBackgroundPreset("minimal-vibe", "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80")}
                      className="p-3 text-left rounded bg-[#12131a] border border-gray-850 hover:bg-[#161722] hover:border-gray-800 transition-all text-xs font-medium text-gray-300 cursor-pointer block"
                    >
                      🎨 Minimalist Abstract
                    </button>
                  </div>

                  {/* Mock actions for other background removals */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-900">
                    <button
                      onClick={() => alert("AI Background Removal completed successfully! Background element isolated.")}
                      className="py-1.5 text-center text-[10px] font-mono text-indigo-400 bg-indigo-950/20 border border-indigo-900/40 rounded hover:bg-indigo-950/40 transition-all cursor-pointer"
                    >
                      ✂️ Remove BG (AI)
                    </button>
                    <button
                      onClick={() => alert("Object Inpainting active. Drag on canvas layer to select area to remove.")}
                      className="py-1.5 text-center text-[10px] font-mono text-emerald-400 bg-emerald-950/20 border border-emerald-900/40 rounded hover:bg-emerald-950/40 transition-all cursor-pointer"
                    >
                      🖌️ Smart Inpaint
                    </button>
                  </div>
                </div>
              )}

              {/* MODULE 4: PROFESSIONAL MANUAL EDITOR & LAYERS */}
              {studioSubTab === "manual" && (
                <div className="space-y-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider">
                        Canvas Layers & Blocks
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={handleAddTextLayer}
                          className="p-1 px-2 rounded bg-indigo-950/40 border border-indigo-900/60 text-indigo-400 text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer hover:bg-indigo-900/20"
                        >
                          <Type className="w-3 h-3" />
                          + Text
                        </button>
                        <button
                          onClick={() => handleAddShapeLayer("rectangle")}
                          className="p-1 px-2 rounded bg-emerald-950/40 border border-emerald-900/60 text-emerald-400 text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer hover:bg-emerald-900/20"
                        >
                          <Square className="w-3 h-3" />
                          + Shape
                        </button>
                        <button
                          onClick={() => handleAddStickerLayer("sparkle")}
                          className="p-1 px-2 rounded bg-purple-950/40 border border-purple-900/60 text-purple-400 text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer hover:bg-purple-900/20"
                        >
                          <Star className="w-3 h-3" />
                          + Deco
                        </button>
                      </div>
                    </div>

                    {/* Layers stack list */}
                    <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                      {layers.map((layer, idx) => (
                        <div
                          key={layer.id}
                          onClick={() => setSelectedLayerId(layer.id)}
                          className={`p-2.5 rounded-lg border text-xs flex items-center justify-between transition-all cursor-pointer ${
                            selectedLayerId === layer.id 
                              ? "bg-indigo-950/30 border-indigo-500/80 text-white shadow-md" 
                              : "bg-[#12131a] border-gray-850 hover:border-gray-800 text-gray-300"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {layer.type === "background" && <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />}
                            {layer.type === "text" && <Type className="w-3.5 h-3.5 text-indigo-400" />}
                            {layer.type === "shape" && <Square className="w-3.5 h-3.5 text-purple-400" />}
                            {layer.type === "sticker" && <Star className="w-3.5 h-3.5 text-amber-400" />}
                            
                            <span className="font-medium truncate max-w-[120px] capitalize">
                              {layer.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {/* Up/Down ordering */}
                            {layer.type !== "background" && (
                              <>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleMoveLayerZIndex(idx, "up"); }}
                                  disabled={idx === layers.length - 1}
                                  className="text-gray-500 hover:text-white cursor-pointer disabled:opacity-30"
                                  title="Move Up"
                                >
                                  <ChevronUp className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleMoveLayerZIndex(idx, "down"); }}
                                  disabled={idx === 1}
                                  className="text-gray-500 hover:text-white cursor-pointer disabled:opacity-30"
                                  title="Move Down"
                                >
                                  <ChevronDown className="w-3 h-3" />
                                </button>
                              </>
                            )}

                            {/* Visibility & lock toggles */}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleToggleVisible(layer.id); }}
                              className="text-gray-500 hover:text-white cursor-pointer"
                            >
                              {layer.visible !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-rose-500" />}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleToggleLock(layer.id); }}
                              className="text-gray-500 hover:text-white cursor-pointer"
                            >
                              {layer.locked ? <Lock className="w-3.5 h-3.5 text-indigo-500" /> : <Unlock className="w-3.5 h-3.5" />}
                            </button>

                            {/* Delete layer */}
                            {layer.type !== "background" && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteLayer(layer.id); }}
                                className="text-gray-500 hover:text-rose-400 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Active selected layer styling properties board */}
                  {selectedLayerId && layers.find(l => l.id === selectedLayerId)?.type !== "background" && (
                    <div className="bg-[#12131a] p-3.5 rounded-lg border border-gray-850 space-y-3">
                      <span className="text-[10px] font-mono text-gray-400 uppercase font-bold block">
                        Edit Selected Layer Properties
                      </span>

                      {/* Text specific field */}
                      {layers.find(l => l.id === selectedLayerId)?.type === "text" && (
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono text-gray-500">Text Content</label>
                          <input
                            type="text"
                            value={layerText}
                            onChange={(e) => { setLayerText(e.target.value); updateActiveLayerProp("text", e.target.value); }}
                            className="w-full h-8 bg-[#0c0d12] border border-gray-850 rounded px-2.5 text-xs text-white outline-none focus:border-indigo-500"
                          />
                        </div>
                      )}

                      {/* Common variables */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono text-gray-500">Color</label>
                          <input
                            type="color"
                            value={layerColor}
                            onChange={(e) => { setLayerColor(e.target.value); updateActiveLayerProp("color", e.target.value); }}
                            className="w-full h-8 bg-transparent cursor-pointer border-none p-0"
                          />
                        </div>

                        {layers.find(l => l.id === selectedLayerId)?.type === "text" && (
                          <div className="space-y-1">
                            <label className="text-[10px] font-mono text-gray-500">Font Size</label>
                            <input
                              type="number"
                              value={layerFontSize}
                              onChange={(e) => { const val = Number(e.target.value); setLayerFontSize(val); updateActiveLayerProp("fontSize", val); }}
                              className="w-full h-8 bg-[#0c0d12] border border-gray-850 rounded px-2 text-xs text-white"
                            />
                          </div>
                        )}
                      </div>

                      {/* Position rotation scaling sliders */}
                      <div className="grid grid-cols-2 gap-3.5">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-gray-500">
                            <span>Rotate</span>
                            <span>{layerRotation}°</span>
                          </div>
                          <input
                            type="range"
                            min="-180"
                            max="180"
                            value={layerRotation}
                            onChange={(e) => { const r = Number(e.target.value); setLayerRotation(r); updateActiveLayerProp("rotation", r); }}
                            className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-gray-500">
                            <span>Opacity</span>
                            <span>{Math.round(layerOpacity * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={layerOpacity * 100}
                            onChange={(e) => { const o = Number(e.target.value) / 100; setLayerOpacity(o); updateActiveLayerProp("opacity", o); }}
                            className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* MODULE 5: PRODUCT PHOTOGRAPHY STUDIO */}
              {studioSubTab === "camera-shoot" && (
                <div className="space-y-4">
                  <div>
                    <span className="text-[10px] font-mono text-emerald-400 font-bold block uppercase tracking-wider">
                      Product Photography Studio
                    </span>
                    <p className="text-[11px] text-gray-400 leading-relaxed mt-1">
                      Choose an active catalog item, select a photography preset and trigger a beautiful composite studio scene instantly.
                    </p>
                  </div>

                  <div className="space-y-3.5">
                    <div className="space-y-1.5 bg-[#12131a] p-3 rounded-lg border border-gray-850">
                      <span className="text-[10px] font-mono text-gray-500 uppercase block font-bold">Current Subject</span>
                      <span className="text-xs font-bold text-white block mt-1.5">
                        📦 {activeProduct?.title || "No item selected"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setAiPrompt(`Professional studio product shot of ${activeProduct?.title || "subject"} on white minimalist stage with strong spotlight highlights`);
                          setStudioSubTab("ai-gen");
                        }}
                        className="p-3 text-left rounded bg-[#12131a] hover:bg-gray-900 border border-gray-850 hover:border-gray-800 transition-all text-xs font-medium text-gray-300 block cursor-pointer"
                      >
                        ⬜ Pure White BG
                      </button>
                      <button
                        onClick={() => {
                          setAiPrompt(`Luxury catalog product photography of ${activeProduct?.title || "subject"} sitting atop a black polished granite shelf, warm golden rim reflections, volumetric fog`);
                          setStudioSubTab("ai-gen");
                        }}
                        className="p-3 text-left rounded bg-[#12131a] hover:bg-gray-900 border border-gray-850 hover:border-gray-800 transition-all text-xs font-medium text-gray-300 block cursor-pointer"
                      >
                        💎 Luxury Stage
                      </button>
                      <button
                        onClick={() => {
                          setAiPrompt(`Warm lifestyle catalog shot of ${activeProduct?.title || "subject"} on a cozy organic oak breakfast table, natural soft sun rays cascading from a window`);
                          setStudioSubTab("ai-gen");
                        }}
                        className="p-3 text-left rounded bg-[#12131a] hover:bg-gray-900 border border-gray-850 hover:border-gray-800 transition-all text-xs font-medium text-gray-300 block cursor-pointer"
                      >
                        🍂 Natural Lifestyle
                      </button>
                      <button
                        onClick={() => {
                          setAiPrompt(`Futuristic neon showcase of ${activeProduct?.title || "subject"} floating on a dark metallic platform with teal and pink laser flare grids, cyberpunk aesthetic`);
                          setStudioSubTab("ai-gen");
                        }}
                        className="p-3 text-left rounded bg-[#12131a] hover:bg-gray-900 border border-gray-850 hover:border-gray-800 transition-all text-xs font-medium text-gray-300 block cursor-pointer"
                      >
                        ⚡ Cyberpunk Tech
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* MODULE 6: BRAND DESIGN STUDIO & BRAND KIT SYNC */}
              {studioSubTab === "brand-kit" && (
                <div className="space-y-4">
                  <div>
                    <span className="text-[10px] font-mono text-emerald-400 font-bold block uppercase tracking-wider">
                      Brand Design Studio
                    </span>
                    <p className="text-[11px] text-gray-400 leading-relaxed mt-1">
                      Instantly sync and compile current brand intelligence settings (colors, voice, typography rules) onto your manual editor canvas.
                    </p>
                  </div>

                  {loadingBrandKit ? (
                    <div className="h-28 bg-[#12131a] rounded animate-pulse" />
                  ) : brandIntelligence ? (
                    <div className="space-y-3.5">
                      <div className="p-3.5 bg-[#12131a] border border-gray-850 rounded-lg space-y-2 text-xs">
                        <div className="flex justify-between items-center text-[10px] font-mono text-gray-500">
                          <span>Primary Tone</span>
                          <span className="text-emerald-400 font-bold">Active</span>
                        </div>
                        <p className="font-bold text-white">{brandIntelligence.tone || brandIntelligence.toneOfVoice?.[0] || "Sophisticated & Modern"}</p>
                        
                        <div className="space-y-1">
                          <span className="text-[9px] font-mono text-gray-550 uppercase block">Brand Guidelines Summary</span>
                          <p className="text-[11px] text-gray-400 leading-normal">
                            {brandIntelligence.valueProposition?.substring(0, 100) || "Modern minimalist values built with transparent geometric patterns."}...
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={handleApplyBrandKitToCanvas}
                        className="w-full h-9 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Palette className="w-4 h-4" />
                        Apply Brand Aesthetics
                      </button>
                    </div>
                  ) : (
                    <div className="p-4 bg-rose-950/20 border border-rose-900/30 rounded text-center text-xs text-rose-300 space-y-2">
                      <p>No active Brand Kit generated for this target product in your workspace.</p>
                      <p className="text-[10px] text-gray-400 leading-normal">
                        Visit the <b>AI Brand Kit</b> tab in the navigation menu to compile and review your brand guidelines first!
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* MODULE 7: SOCIAL MEDIA DESIGN STUDIO */}
              {studioSubTab === "social-guides" && (
                <div className="space-y-4">
                  <div>
                    <span className="text-[10px] font-mono text-emerald-400 font-bold block uppercase tracking-wider">
                      Social Media Design Guides
                    </span>
                    <p className="text-[11px] text-gray-400 leading-relaxed mt-1">
                      Resize active canvas and overlay interactive social safety margins to align text perfectly for reels, posts, and vertical templates.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => handleResizeForSocial("1:1")}
                        className={`p-2.5 rounded border text-[10px] font-mono font-bold text-center transition-all cursor-pointer ${
                          canvasAspectRatio === "1:1" ? "bg-indigo-950/40 border-indigo-500 text-white" : "bg-[#12131a] border-gray-850 hover:bg-gray-900 text-gray-400"
                        }`}
                      >
                        Square (1:1)<br />Post
                      </button>
                      <button
                        onClick={() => handleResizeForSocial("9:16")}
                        className={`p-2.5 rounded border text-[10px] font-mono font-bold text-center transition-all cursor-pointer ${
                          canvasAspectRatio === "9:16" ? "bg-indigo-950/40 border-indigo-500 text-white" : "bg-[#12131a] border-gray-850 hover:bg-gray-900 text-gray-400"
                        }`}
                      >
                        Reels (9:16)<br />Stories
                      </button>
                      <button
                        onClick={() => handleResizeForSocial("16:9")}
                        className={`p-2.5 rounded border text-[10px] font-mono font-bold text-center transition-all cursor-pointer ${
                          canvasAspectRatio === "16:9" ? "bg-indigo-950/40 border-indigo-500 text-white" : "bg-[#12131a] border-gray-850 hover:bg-gray-900 text-gray-400"
                        }`}
                      >
                        Banner (16:9)<br />YouTube
                      </button>
                    </div>

                    <div className="pt-2 border-t border-gray-900 flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-300">Overlay Social Safety Zones</span>
                      <button
                        onClick={() => setSocialOverlay(!socialOverlay)}
                        className={`p-1 px-3 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                          socialOverlay ? "bg-indigo-600 text-white" : "bg-gray-900 text-gray-400 border border-gray-800"
                        }`}
                      >
                        {socialOverlay ? "Guides ON" : "Guides OFF"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* MODULE 8: IMAGE ANALYSIS & CONVERSION OPTIMIZATION */}
              {studioSubTab === "audit" && (
                <div className="space-y-4">
                  <div>
                    <span className="text-[10px] font-mono text-emerald-400 font-bold block uppercase tracking-wider">
                      Gemini Vision Audit
                    </span>
                    <p className="text-[11px] text-gray-400 leading-relaxed mt-1">
                      Runs a real-time visual assessment on the current canvas utilizing <b>gemini-3.5-flash</b> model models. Returns scoring and conversions.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <button
                      onClick={handleRunAIVisionAudit}
                      disabled={auditing}
                      className="w-full h-9 flex items-center justify-center gap-1.5 bg-gradient-to-r from-emerald-500 to-indigo-600 hover:from-emerald-400 hover:to-indigo-500 text-white rounded font-bold text-xs transition-all cursor-pointer shadow-md disabled:opacity-40"
                    >
                      {auditing ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Auditing Canvas Composition...
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Run AI Vision Audit
                        </>
                      )}
                    </button>

                    {auditReport && (
                      <div className="p-3.5 bg-[#12131a] border border-gray-850 rounded-lg space-y-3.5 max-h-[250px] overflow-y-auto text-xs">
                        <div className="flex justify-between items-center border-b border-gray-900 pb-2">
                          <span className="text-[10px] font-mono text-gray-500">MARKET CONVERSION SCORE</span>
                          <span className={`font-mono font-bold text-sm px-2 py-0.5 rounded ${
                            auditReport.qualityScore > 85 ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900/60" : "bg-indigo-950/40 text-indigo-400 border border-indigo-900/40"
                          }`}>
                            {auditReport.qualityScore} / 100
                          </span>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] font-mono text-indigo-400 font-bold uppercase">Branding Review</span>
                          <p className="text-gray-300 leading-relaxed text-[11px]">
                            {auditReport.brandingReview}
                          </p>
                        </div>

                        <div className="space-y-1.5">
                          <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase">Conversion Suggestions</span>
                          <div className="space-y-1 text-gray-400 leading-normal text-[11px]">
                            {auditReport.conversionOptimization.map((tip, idx) => (
                              <p key={idx}>• {tip}</p>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <span className="text-[10px] font-mono text-purple-400 font-bold uppercase">Visual SEO Tips</span>
                          <div className="space-y-1 text-gray-400 leading-normal text-[11px]">
                            {auditReport.seoSuggestions.map((tip, idx) => (
                              <p key={idx}>• {tip}</p>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] font-mono text-amber-400 font-bold uppercase">Amazon / Shopify Readiness</span>
                          <p className="text-gray-400 leading-relaxed text-[11px]">
                            {auditReport.marketplaceCheck}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* MODULE 10: ASSET LIBRARY */}
              {studioSubTab === "assets" && (
                <div className="space-y-4">
                  <div>
                    <span className="text-[10px] font-mono text-emerald-400 font-bold block uppercase tracking-wider">
                      Workspace Asset Library
                    </span>
                    <p className="text-[11px] text-gray-400 leading-relaxed mt-1">
                      Drag or double-click items in your vault below to apply them to your canvas.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 max-h-[240px] overflow-y-auto pr-1">
                    {savedAssets.map(asset => (
                      <div
                        key={asset.id}
                        onDoubleClick={() => {
                          setLayers(layers.map(l => {
                            if (l.type === "background") {
                              return { ...l, text: asset.url, name: asset.name };
                            }
                            return l;
                          }));
                          alert("Background set successfully!");
                        }}
                        className="relative group rounded-lg overflow-hidden border border-gray-850 bg-gray-950 aspect-square cursor-pointer hover:border-indigo-500/80 transition-all"
                        title="Double Click to set backdrop"
                      >
                        <img
                          src={asset.url}
                          alt={asset.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-all"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-black/75 p-1.5 text-[9px] font-mono text-gray-300 truncate">
                          {asset.name}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick actions line footer */}
              <div className="pt-3 border-t border-gray-900 flex items-center justify-between">
                <span className="text-[10px] font-mono text-gray-500 font-semibold uppercase">
                  ACTIVE MODALITY: GRAPHIC
                </span>
                <button
                  onClick={() => setStudioSubTab("assets")}
                  className="text-[10px] font-mono text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  View Saved Assets ({savedAssets.length}) →
                </button>
              </div>

            </div>
          </div>

          {/* Canvas Workspace Column 2: Canva Board Center Panel (7/12) */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Top Editor Command Row */}
            <div className="flex flex-wrap justify-between items-center gap-2.5 bg-[#0c0d12] p-4 rounded-xl border border-gray-850">
              <div className="flex gap-1.5">
                <button
                  onClick={handleDownloadCanvasPNG}
                  className="flex items-center gap-1.5 p-2 px-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold transition-all cursor-pointer shadow-sm"
                  title="Export design as a premium High-Resolution PNG file"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download PNG
                </button>
                <button
                  onClick={handleSaveToAssetLibrary}
                  className="flex items-center gap-1.5 p-2 px-3.5 bg-gray-900 hover:bg-gray-800 text-gray-300 hover:text-white rounded border border-gray-800 hover:border-gray-700 text-xs font-semibold transition-all cursor-pointer"
                  title="Save current composition state to your library vault"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Save Draft
                </button>
              </div>

              {/* Dynamic size indicator */}
              <div className="text-[10px] font-mono text-gray-500 bg-gray-950 px-2.5 py-1 rounded border border-gray-900 flex items-center gap-1">
                <span>Canvas Size:</span>
                <span className="font-bold text-gray-300">{canvasWidth} x {canvasHeight} ({canvasAspectRatio})</span>
              </div>
            </div>

            {/* Canvas Outer Board container */}
            <div className="relative bg-gray-950/70 border border-dashed border-gray-850 rounded-2xl p-6 flex items-center justify-center min-h-[460px] overflow-hidden select-none">
              
              {/* Actual Visual Canva-style stage */}
              <div
                ref={canvasRef}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
                className="relative bg-white shadow-2xl transition-all overflow-hidden cursor-default border border-gray-800"
                style={{
                  width: canvasAspectRatio === "9:16" ? "270px" : canvasAspectRatio === "16:9" ? "480px" : "380px",
                  aspectRatio: canvasAspectRatio === "9:16" ? "9/16" : canvasAspectRatio === "16:9" ? "16/9" : "1/1",
                }}
              >
                {/* 1. Draw each layer dynamically using standard CSS layout */}
                {layers.filter(l => l.visible !== false).map((layer) => {
                  const scaleX = (canvasAspectRatio === "9:16" ? 270 : canvasAspectRatio === "16:9" ? 480 : 380) / canvasWidth;
                  const scaleY = (canvasAspectRatio === "9:16" ? 480 : canvasAspectRatio === "16:9" ? 270 : 380) / canvasHeight;

                  const isSelected = selectedLayerId === layer.id;

                  // Render background layer
                  if (layer.type === "background") {
                    return (
                      <div
                        key={layer.id}
                        onClick={(e) => { e.stopPropagation(); setSelectedLayerId(null); }}
                        className="absolute inset-0 bg-cover bg-center transition-all"
                        style={{
                          backgroundImage: `url(${layer.text})`,
                          backgroundColor: layer.color || "#0c0d12",
                          opacity: layer.opacity
                        }}
                      />
                    );
                  }

                  // Render text layer
                  if (layer.type === "text") {
                    return (
                      <div
                        key={layer.id}
                        onMouseDown={(e) => handleLayerMouseDown(e, layer)}
                        className={`absolute text-center select-none flex items-center justify-center transition-shadow leading-tight whitespace-pre-wrap ${
                          isSelected ? "ring-2 ring-indigo-500/90 ring-offset-2 ring-offset-black cursor-move" : ""
                        }`}
                        style={{
                          left: `${layer.x * scaleX}px`,
                          top: `${layer.y * scaleY}px`,
                          transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`,
                          color: layer.color,
                          fontFamily: layer.fontFamily || "sans-serif",
                          fontWeight: layer.fontWeight || "bold",
                          fontSize: `${(layer.fontSize || 24) * scaleX}px`,
                          opacity: layer.opacity,
                          width: `${layer.width * scaleX}px`,
                        }}
                      >
                        {layer.text}
                      </div>
                    );
                  }

                  // Render shape layer
                  if (layer.type === "shape") {
                    const lW = layer.width * scaleX;
                    const lH = layer.height * scaleY;
                    return (
                      <div
                        key={layer.id}
                        onMouseDown={(e) => handleLayerMouseDown(e, layer)}
                        className={`absolute flex items-center justify-center ${
                          isSelected ? "ring-2 ring-indigo-500/90 ring-offset-2 ring-offset-black cursor-move" : ""
                        }`}
                        style={{
                          left: `${layer.x * scaleX}px`,
                          top: `${layer.y * scaleY}px`,
                          width: `${lW}px`,
                          height: `${lH}px`,
                          transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`,
                          opacity: layer.opacity
                        }}
                      >
                        {layer.shapeType === "circle" ? (
                          <div
                            className="rounded-full w-full h-full"
                            style={{ backgroundColor: layer.color }}
                          />
                        ) : layer.shapeType === "triangle" ? (
                          <div
                            className="w-0 h-0"
                            style={{
                              borderLeft: `${lW / 2}px solid transparent`,
                              borderRight: `${lW / 2}px solid transparent`,
                              borderBottom: `${lH}px solid ${layer.color}`
                            }}
                          />
                        ) : layer.shapeType === "star" ? (
                          <Star
                            className="w-full h-full"
                            style={{ fill: layer.color, stroke: "none" }}
                          />
                        ) : (
                          <div
                            className="w-full h-full rounded"
                            style={{ backgroundColor: layer.color }}
                          />
                        )}
                      </div>
                    );
                  }

                  // Render sticker layer
                  if (layer.type === "sticker") {
                    const lSize = Math.min(layer.width, layer.height) * scaleX;
                    return (
                      <div
                        key={layer.id}
                        onMouseDown={(e) => handleLayerMouseDown(e, layer)}
                        className={`absolute flex items-center justify-center ${
                          isSelected ? "ring-2 ring-indigo-500/90 ring-offset-2 ring-offset-black cursor-move" : ""
                        }`}
                        style={{
                          left: `${layer.x * scaleX}px`,
                          top: `${layer.y * scaleY}px`,
                          transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`,
                          opacity: layer.opacity,
                          width: `${lSize}px`,
                          height: `${lSize}px`
                        }}
                      >
                        {layer.stickerType === "sparkle" && (
                          <Sparkles className="w-full h-full" style={{ color: layer.color, fill: layer.color }} />
                        )}
                        {layer.stickerType === "sale-tag" && (
                          <Zap className="w-full h-full" style={{ color: layer.color, fill: layer.color }} />
                        )}
                        {layer.stickerType === "star" && (
                          <Star className="w-full h-full" style={{ color: layer.color, fill: layer.color }} />
                        )}
                      </div>
                    );
                  }

                  return null;
                })}

                {/* Optional Social media safety boundary guides */}
                {socialOverlay && (
                  <div className="absolute inset-x-2 inset-y-8 border-2 border-dashed border-rose-500/50 pointer-events-none flex flex-col justify-between items-center p-2">
                    <span className="text-[8px] font-mono text-rose-500 bg-black/80 px-1 rounded">SAFE MARGIN BOUNDARY</span>
                    <span className="text-[8px] font-mono text-rose-500 bg-black/80 px-1 rounded">SAFE MARGIN BOUNDARY</span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick tips panel underneath canvas */}
            <div className="bg-[#0c0d12] p-4 rounded-xl border border-gray-850 flex items-start gap-3">
              <HelpCircle className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <span className="text-xs font-bold text-gray-200 block">Workspace Studio Tips & Mechanics</span>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Click and hold any text or shape element to drag and reposition it on the canvas frame. Adjust rotation, colors, font size, and transparency in the <b>Layers</b> sub-tab. Apply real brand intelligence schemas with a single sync click.
                </p>
              </div>
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
