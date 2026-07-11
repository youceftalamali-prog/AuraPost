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
  // Professional Editor fields
  flipX?: boolean;
  flipY?: boolean;
  brightness?: number; // 0-200, default 100
  contrast?: number; // 0-200, default 100
  saturation?: number; // 0-200, default 100
  blur?: number; // 0-20, default 0
  sharpen?: boolean;
  colorBalance?: "none" | "warm" | "cool";
  shadows?: number; // -100 to 100, default 0
  highlights?: number; // -100 to 100, default 0
  cropX?: number; // 0-100%
  cropY?: number; // 0-100%
  cropWidth?: number; // 0-100%
  cropHeight?: number; // 0-100%
}

// Preset visual templates that can be loaded and edited instantly in the manual editor
const TEMPLATES_LIBRARY = [
  {
    id: "luxury-gold-perfume",
    name: "Royal Gold Perfume Promo (1:1)",
    category: "Luxury Ads",
    aspectRatio: "1:1" as const,
    canvasWidth: 800,
    canvasHeight: 800,
    layers: [
      {
        id: "bg-perfume",
        type: "background" as const,
        name: "Luxury Slate Marble Backdrop",
        x: 0, y: 0, width: 800, height: 800, rotation: 0,
        color: "#111116", opacity: 1,
        text: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80",
        brightness: 95, contrast: 110, saturation: 90
      },
      {
        id: "border-gold",
        type: "shape" as const,
        name: "Sleek Gold Frame",
        x: 40, y: 40, width: 720, height: 720, rotation: 0,
        color: "rgba(212, 175, 55, 0.45)", opacity: 1,
        shapeType: "rectangle" as const
      },
      {
        id: "text-perfume-title",
        type: "text" as const,
        name: "Main Display Title",
        x: 400, y: 160, width: 680, height: 75, rotation: 0,
        color: "#ffffff", opacity: 1,
        text: "THE GOLD VANGUARD",
        fontSize: 40, fontFamily: "serif", fontWeight: "bold"
      },
      {
        id: "text-perfume-subtitle",
        type: "text" as const,
        name: "Promo Subtitle",
        x: 400, y: 220, width: 500, height: 35, rotation: 0,
        color: "#d4af37", opacity: 0.9,
        text: "EXQUISITE AMBIENT FRAGRANCE",
        fontSize: 14, fontFamily: "sans-serif", fontWeight: "bold"
      },
      {
        id: "sticker-perfume-star",
        type: "sticker" as const,
        name: "Gold Sparkle Accent",
        x: 650, y: 155, width: 50, height: 50, rotation: 12,
        color: "#d4af37", opacity: 0.85,
        stickerType: "sparkle" as const
      }
    ]
  },
  {
    id: "royal-diamond-ring",
    name: "Empress Diamond Ring (3:4)",
    category: "Jewelry Ads",
    aspectRatio: "3:4" as const,
    canvasWidth: 600,
    canvasHeight: 800,
    layers: [
      {
        id: "bg-ring",
        type: "background" as const,
        name: "Silk Cushion Base",
        x: 0, y: 0, width: 600, height: 800, rotation: 0,
        color: "#070510", opacity: 1,
        text: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=800&q=80",
        brightness: 90, contrast: 115
      },
      {
        id: "text-ring-head",
        type: "text" as const,
        name: "Luxury Brand Header",
        x: 300, y: 120, width: 520, height: 60, rotation: 0,
        color: "#ffffff", opacity: 1,
        text: "ROYAL CUT PLATINUM",
        fontSize: 28, fontFamily: "serif", fontWeight: "bold"
      },
      {
        id: "text-ring-desc",
        type: "text" as const,
        name: "Jewelry Description",
        x: 300, y: 165, width: 450, height: 40, rotation: 0,
        color: "#d4af37", opacity: 0.9,
        text: "CERTIFIED 2.5 CARAT BLUE DIAMOND",
        fontSize: 12, fontFamily: "sans-serif", fontWeight: "bold"
      }
    ]
  },
  {
    id: "streetwear-summer",
    name: "Urban Streetwear Classic (3:4)",
    category: "Fashion Ads",
    aspectRatio: "3:4" as const,
    canvasWidth: 600,
    canvasHeight: 800,
    layers: [
      {
        id: "bg-fashion",
        type: "background" as const,
        name: "Concrete Brutalist Base",
        x: 0, y: 0, width: 600, height: 800, rotation: 0,
        color: "#18181b", opacity: 1,
        text: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=600&q=80",
        brightness: 80, contrast: 120
      },
      {
        id: "fashion-card",
        type: "shape" as const,
        name: "Black Brutalist Card",
        x: 300, y: 150, width: 520, height: 150, rotation: -2,
        color: "#000000", opacity: 0.92,
        shapeType: "rectangle" as const
      },
      {
        id: "text-fashion-head",
        type: "text" as const,
        name: "Bold Brand Header",
        x: 300, y: 125, width: 480, height: 50, rotation: -2,
        color: "#f4f4f5", opacity: 1,
        text: "URBAN ARTIFACTS",
        fontSize: 32, fontFamily: "monospace", fontWeight: "bold"
      },
      {
        id: "text-fashion-sub",
        type: "text" as const,
        name: "Fashion Collection Label",
        x: 300, y: 175, width: 480, height: 40, rotation: -2,
        color: "#22c55e", opacity: 1,
        text: "LIMITLESS HOODIES // SPRING DROP 03",
        fontSize: 12, fontFamily: "monospace", fontWeight: "bold"
      }
    ]
  },
  {
    id: "serum-botany",
    name: "Organic Face Serum (9:16)",
    category: "Beauty Ads",
    aspectRatio: "9:16" as const,
    canvasWidth: 450,
    canvasHeight: 800,
    layers: [
      {
        id: "bg-beauty",
        type: "background" as const,
        name: "Sandy Peach Surface",
        x: 0, y: 0, width: 450, height: 800, rotation: 0,
        color: "#fafaf9", opacity: 1,
        text: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=450&q=80",
        brightness: 95, contrast: 105
      },
      {
        id: "text-beauty-brand",
        type: "text" as const,
        name: "Aesthetic Brand Line",
        x: 225, y: 110, width: 380, height: 40, rotation: 0,
        color: "#57534e", opacity: 0.85,
        text: "N A T U R E S P H E R E",
        fontSize: 15, fontFamily: "sans-serif", fontWeight: "medium"
      },
      {
        id: "text-beauty-main",
        type: "text" as const,
        name: "Serum Botanical Title",
        x: 225, y: 220, width: 400, height: 100, rotation: 0,
        color: "#292524", opacity: 1,
        text: "Active Botany\nHydrating Serum",
        fontSize: 28, fontFamily: "serif", fontWeight: "bold"
      }
    ]
  },
  {
    id: "headphones-anc",
    name: "ANC Headset Tech Flyer (16:9)",
    category: "Electronics Ads",
    aspectRatio: "16:9" as const,
    canvasWidth: 800,
    canvasHeight: 450,
    layers: [
      {
        id: "bg-electronics",
        type: "background" as const,
        name: "Teal Tech Laser Grid",
        x: 0, y: 0, width: 800, height: 450, rotation: 0,
        color: "#030208", opacity: 1,
        text: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=800&q=80",
        brightness: 75, contrast: 130
      },
      {
        id: "shape-laser-line",
        type: "shape" as const,
        name: "Neon Highlight Line",
        x: 400, y: 25, width: 750, height: 4, rotation: 0,
        color: "#14b8a6", opacity: 0.85,
        shapeType: "rectangle" as const
      },
      {
        id: "text-electronics-title",
        type: "text" as const,
        name: "Product Tech Header",
        x: 400, y: 130, width: 700, height: 65, rotation: 0,
        color: "#ffffff", opacity: 1,
        text: "VANGUARD NEOPHONICS",
        fontSize: 34, fontFamily: "sans-serif", fontWeight: "bold"
      },
      {
        id: "text-electronics-spec",
        type: "text" as const,
        name: "Audio Specifications",
        x: 400, y: 185, width: 500, height: 35, rotation: 0,
        color: "#14b8a6", opacity: 0.9,
        text: "ACTIVE HYBRID ANC // 45H BATTERY // HIGH-RES AUDIO",
        fontSize: 11, fontFamily: "monospace", fontWeight: "bold"
      }
    ]
  },
  {
    id: "watch-minimal",
    name: "Sleek Minimal Watch (1:1)",
    category: "Product Ads",
    aspectRatio: "1:1" as const,
    canvasWidth: 800,
    canvasHeight: 800,
    layers: [
      {
        id: "bg-watch",
        type: "background" as const,
        name: "Organic Oak Texture",
        x: 0, y: 0, width: 800, height: 800, rotation: 0,
        color: "#121212", opacity: 1,
        text: "https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=800&q=80",
        brightness: 85, contrast: 115
      },
      {
        id: "text-watch-title",
        type: "text" as const,
        name: "Watch Headline",
        x: 400, y: 160, width: 680, height: 80, rotation: 0,
        color: "#ffffff", opacity: 1,
        text: "REFINED PRECISION",
        fontSize: 42, fontFamily: "sans-serif", fontWeight: "bold"
      },
      {
        id: "text-watch-desc",
        type: "text" as const,
        name: "Watch Subtitle",
        x: 400, y: 700, width: 600, height: 40, rotation: 0,
        color: "#d4af37", opacity: 0.9,
        text: "BUILT FOR THE MODERN EXPLORER // AUTOMATIC CALIBER",
        fontSize: 13, fontFamily: "monospace", fontWeight: "medium"
      }
    ]
  },
  {
    id: "brand-story",
    name: "AuraPost Brand Story Post (1:1)",
    category: "Social Posts",
    aspectRatio: "1:1" as const,
    canvasWidth: 800,
    canvasHeight: 800,
    layers: [
      {
        id: "bg-brand-story",
        type: "background" as const,
        name: "Abstract Gradient Base",
        x: 0, y: 0, width: 800, height: 800, rotation: 0,
        color: "#020617", opacity: 1,
        text: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80",
        brightness: 90, contrast: 110, saturation: 115
      },
      {
        id: "shape-story-card",
        type: "shape" as const,
        name: "Semi-Transparent Backplate",
        x: 400, y: 400, width: 660, height: 500, rotation: 0,
        color: "rgba(15, 23, 42, 0.85)", opacity: 1,
        shapeType: "rectangle" as const
      },
      {
        id: "text-story-title",
        type: "text" as const,
        name: "Story Main Title",
        x: 400, y: 220, width: 580, height: 70, rotation: 0,
        color: "#38bdf8", opacity: 1,
        text: "WE ARE GROWING",
        fontSize: 36, fontFamily: "sans-serif", fontWeight: "bold"
      },
      {
        id: "text-story-body",
        type: "text" as const,
        name: "Story Main Paragraph",
        x: 400, y: 420, width: 560, height: 220, rotation: 0,
        color: "#f8fafc", opacity: 0.9,
        text: "Our core mission is to empower digital entrepreneurs everywhere with beautiful, automated visual intelligence. Today, we announce $2.5M in seed funding to expand our creative cloud systems. Thank you for your continued trust and partnership.",
        fontSize: 18, fontFamily: "sans-serif", fontWeight: "normal"
      }
    ]
  },
  {
    id: "instagram-story-deal",
    name: "Flash Sale Instagram Story (9:16)",
    category: "Instagram Stories",
    aspectRatio: "9:16" as const,
    canvasWidth: 450,
    canvasHeight: 800,
    layers: [
      {
        id: "bg-story-deal",
        type: "background" as const,
        name: "Vibrant Cyan-Pink Backdrop",
        x: 0, y: 0, width: 450, height: 800, rotation: 0,
        color: "#0a0112", opacity: 1,
        text: "https://images.unsplash.com/photo-1519751138087-5bf79df62d5b?auto=format&fit=crop&w=450&q=80",
        brightness: 85, contrast: 125, saturation: 120
      },
      {
        id: "shape-banner",
        type: "shape" as const,
        name: "Flash Offer Accent Pill",
        x: 225, y: 200, width: 320, height: 75, rotation: -4,
        color: "#ec4899", opacity: 1,
        shapeType: "rectangle" as const
      },
      {
        id: "text-story-deal-head",
        type: "text" as const,
        name: "Promo Head",
        x: 225, y: 200, width: 300, height: 45, rotation: -4,
        color: "#ffffff", opacity: 1,
        text: "LIMITED FLASH DEAL",
        fontSize: 20, fontFamily: "sans-serif", fontWeight: "bold"
      },
      {
        id: "text-story-deal-discount",
        type: "text" as const,
        name: "Discount Massive Text",
        x: 225, y: 410, width: 400, height: 120, rotation: 0,
        color: "#ffffff", opacity: 1,
        text: "50% OFF",
        fontSize: 55, fontFamily: "sans-serif", fontWeight: "bold"
      },
      {
        id: "text-story-deal-cta",
        type: "text" as const,
        name: "Swipe Up CTA Label",
        x: 225, y: 720, width: 350, height: 35, rotation: 0,
        color: "#22d3ee", opacity: 1,
        text: "SWIPE UP TO SHOP NOW",
        fontSize: 14, fontFamily: "monospace", fontWeight: "bold"
      }
    ]
  },
  {
    id: "facebook-ads-seasonal",
    name: "Seasonal Launch Banner (16:9)",
    category: "Facebook Ads",
    aspectRatio: "16:9" as const,
    canvasWidth: 800,
    canvasHeight: 450,
    layers: [
      {
        id: "bg-fb-seasonal",
        type: "background" as const,
        name: "Cozy Autumn Vibe Backdrop",
        x: 0, y: 0, width: 800, height: 450, rotation: 0,
        color: "#180d05", opacity: 1,
        text: "https://images.unsplash.com/photo-1542038784456-1ea8e935640e?auto=format&fit=crop&w=800&q=80",
        brightness: 80, contrast: 110
      },
      {
        id: "shape-overlay-pill",
        type: "shape" as const,
        name: "Tag Overlay Box",
        x: 140, y: 160, width: 220, height: 60, rotation: -3,
        color: "#ea580c", opacity: 0.95,
        shapeType: "rectangle" as const
      },
      {
        id: "text-fb-promo",
        type: "text" as const,
        name: "Promo Badge Text",
        x: 140, y: 160, width: 200, height: 30, rotation: -3,
        color: "#ffffff", opacity: 1,
        text: "AUTUMN ARCHIVES",
        fontSize: 14, fontFamily: "monospace", fontWeight: "bold"
      },
      {
        id: "text-fb-main",
        type: "text" as const,
        name: "Main Display Header",
        x: 400, y: 80, width: 720, height: 50, rotation: 0,
        color: "#ffffff", opacity: 1,
        text: "MID-SEASON COMFORT UPGRADE",
        fontSize: 30, fontFamily: "sans-serif", fontWeight: "bold"
      },
      {
        id: "text-fb-desc",
        type: "text" as const,
        name: "Description Summary",
        x: 400, y: 350, width: 620, height: 35, rotation: 0,
        color: "#f3f4f6", opacity: 0.85,
        text: "Hand-threaded organic materials built with absolute visual comfort.",
        fontSize: 14, fontFamily: "sans-serif", fontWeight: "normal"
      }
    ]
  },
  {
    id: "promo-banner-global",
    name: "Global Shipping Banner (16:9)",
    category: "Promotional Banners",
    aspectRatio: "16:9" as const,
    canvasWidth: 800,
    canvasHeight: 450,
    layers: [
      {
        id: "bg-global-promo",
        type: "background" as const,
        name: "Cosmic Stars Backdrop",
        x: 0, y: 0, width: 800, height: 450, rotation: 0,
        color: "#020412", opacity: 1,
        text: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80",
        brightness: 75, contrast: 120
      },
      {
        id: "text-promo-head",
        type: "text" as const,
        name: "Main Promo Announcement",
        x: 400, y: 140, width: 720, height: 60, rotation: 0,
        color: "#ffffff", opacity: 1,
        text: "FREE GLOBAL DISPATCH ACTIVE",
        fontSize: 32, fontFamily: "sans-serif", fontWeight: "bold"
      },
      {
        id: "text-promo-code",
        type: "text" as const,
        name: "Promo Code Details",
        x: 400, y: 200, width: 500, height: 35, rotation: 0,
        color: "#fbbf24", opacity: 1,
        text: "USE VOUCHER CODE 'AURAGLOBAL' AT CHECKOUT",
        fontSize: 13, fontFamily: "monospace", fontWeight: "bold"
      },
      {
        id: "sticker-promo-tag",
        type: "sticker" as const,
        name: "Lightning Fast Dispatch Accent",
        x: 400, y: 300, width: 65, height: 65, rotation: 0,
        color: "#fbbf24", opacity: 0.95,
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
  
  // Canvas Resolution & Export config
  const [canvasAspectRatio, setCanvasAspectRatio] = useState<"1:1" | "9:16" | "16:9" | "3:4">("1:1");
  const [canvasWidth, setCanvasWidth] = useState(800);
  const [canvasHeight, setCanvasHeight] = useState(800);
  const [exportFormat, setExportFormat] = useState<"png" | "jpeg" | "webp">("png");
  const [exportResolution, setExportResolution] = useState<"standard" | "hd" | "2k" | "4k">("hd");
  
  // Active Manual Layers Array
  const [layers, setLayers] = useState<VisualLayer[]>([
    {
      id: "bg-default",
      type: "background",
      name: "Default White Canvas",
      x: 0, y: 0, width: 800, height: 800, rotation: 0,
      color: "#ffffff", opacity: 1,
      text: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80",
      brightness: 100, contrast: 100, saturation: 100, blur: 0, flipX: false, flipY: false, shadows: 0, highlights: 0, colorBalance: "none"
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
  
  // History stack for Undo/Redo operations
  const [undoStack, setUndoStack] = useState<VisualLayer[][]>([]);
  const [redoStack, setRedoStack] = useState<VisualLayer[][]>([]);

  // Persistent Project Management
  const [projectsList, setProjectsList] = useState<any[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState("Untitled Studio Project");

  // Template Search and Categories filters
  const [templateSearch, setTemplateSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  // Input fields for controls
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiProvider, setAiProvider] = useState("flux");
  const [aiGenMode, setAiGenMode] = useState<"text_to_image" | "product_to_image" | "image_to_image" | "backdrop_generation" | "marketing_banner">("text_to_image");
  const [productImageBase64, setProductImageBase64] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  
  // Manual text/adjustments edits state
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

  // Helper to commit state to undo-history cleanly
  const commitLayersState = (newLayers: VisualLayer[]) => {
    setUndoStack(prev => [...prev, layers]);
    setRedoStack([]);
    setLayers(newLayers);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(u => u.slice(0, -1));
    setRedoStack(r => [...r, layers]);
    setLayers(prev);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack(r => r.slice(0, -1));
    setUndoStack(u => [...u, layers]);
    setLayers(next);
  };

  // Image Studio Projects CRUD (PostgreSQL-backed)
  const loadProjects = async () => {
    setLoadingProjects(true);
    try {
      const response = await fetch(`/api/images/projects?workspaceId=${workspaceId}`);
      if (response.ok) {
        const data = await response.json();
        // Support both direct array and wrapped projects response
        const list = Array.isArray(data) ? data : (data && Array.isArray(data.projects) ? data.projects : []);
        setProjectsList(list);
      }
    } catch (err) {
      console.error("Error loading image projects:", err);
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleSaveProject = async () => {
    try {
      const response = await fetch("/api/images/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeProjectId || undefined,
          workspaceId,
          name: projectTitle,
          description: `Commercial project for ${(products.find(p => p.id === selectedProductId)?.title || "E-commerce Item")}`,
          aspectRatio: canvasAspectRatio,
          canvasWidth,
          canvasHeight,
          layers,
          // Retain legacy 'data' for redundant backward compatibility
          data: { layers, canvasWidth, canvasHeight, canvasAspectRatio }
        })
      });
      if (response.ok) {
        const res = await response.json();
        setActiveProjectId(res.id);
        onAddAuditLog("image.project_save", `Saved project "${projectTitle}" to the cloud database`);
        alert(`Success! Project "${projectTitle}" has been saved.`);
        loadProjects();
      }
    } catch (err) {
      console.error("Failed to save project:", err);
    }
  };

  const handleDuplicateProject = async (id: string) => {
    try {
      const original = projectsList.find(p => p.id === id);
      const originalName = original ? original.name : "Untitled Project";
      const newName = `${originalName} (Copy)`;
      const newId = `proj_${Math.random().toString(36).substring(2, 11)}`;

      const response = await fetch(`/api/images/projects/${id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newId, newName })
      });
      if (response.ok) {
        loadProjects();
        alert("Project duplicated successfully!");
      }
    } catch (err) {
      console.error("Failed to duplicate project:", err);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!confirm("Are you sure you want to delete this project?")) return;
    try {
      const response = await fetch(`/api/images/projects/${id}`, {
        method: "DELETE"
      });
      if (response.ok) {
        if (activeProjectId === id) {
          setActiveProjectId(null);
          setProjectTitle("Untitled Studio Project");
        }
        loadProjects();
        alert("Project deleted.");
      }
    } catch (err) {
      console.error("Failed to delete project:", err);
    }
  };

  const handleLoadProject = (proj: any) => {
    setActiveProjectId(proj.id);
    setProjectTitle(proj.name);
    try {
      let layersList: any[] = [];
      let aspect: "1:1" | "9:16" | "16:9" | "3:4" = "1:1";
      let width = 800;
      let height = 800;

      if (proj.layers) {
        layersList = typeof proj.layers === "string" ? JSON.parse(proj.layers) : proj.layers;
        aspect = proj.aspectRatio || proj.aspect_ratio || "1:1";
        width = proj.canvasWidth || proj.canvas_width || 800;
        height = proj.canvasHeight || proj.canvas_height || 800;
      } else if (proj.data) {
        const parsed = typeof proj.data === "string" ? JSON.parse(proj.data) : proj.data;
        layersList = parsed.layers || [];
        aspect = parsed.canvasAspectRatio || "1:1";
        width = parsed.canvasWidth || 800;
        height = parsed.canvasHeight || 800;
      }

      if (layersList && layersList.length > 0) {
        setLayers(layersList);
      }
      setCanvasAspectRatio(aspect);
      setCanvasWidth(width);
      setCanvasHeight(height);
      setSelectedLayerId(layersList?.[0]?.id || null);
      alert(`Loaded project: ${proj.name}`);
    } catch (e) {
      console.error("Parse project data error:", e);
    }
  };

  // Auto save trigger every 30 seconds if project is active
  useEffect(() => {
    if (!activeProjectId) return;
    const interval = setInterval(() => {
      fetch("/api/images/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeProjectId,
          workspaceId,
          name: projectTitle,
          description: "Autosaved draft",
          aspectRatio: canvasAspectRatio,
          canvasWidth,
          canvasHeight,
          layers,
          data: { layers, canvasWidth, canvasHeight, canvasAspectRatio }
        })
      }).then(() => {
        console.log("[ImageStudio] Auto-saved draft successfully.");
      }).catch(err => console.warn("Autosave draft failed", err));
    }, 30000);
    return () => clearInterval(interval);
  }, [activeProjectId, projectTitle, layers, canvasWidth, canvasHeight, canvasAspectRatio, workspaceId]);

  useEffect(() => {
    loadProjects();
  }, [workspaceId]);

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
    setStudioSubTab("manual");
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
      const response = await fetch(`/api/images/generate?workspaceId=${workspaceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          prompt: aiPrompt,
          provider: aiProvider,
          aspectRatio: canvasAspectRatio,
          mode: aiGenMode
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Generation error");

      // Replace or Add background layer with generated image
      const nextLayers = layers.map(l => {
        if (l.type === "background") {
          return {
            ...l,
            text: data.imageUrl,
            name: `AI Gen Backdrop (${aiProvider})`
          };
        }
        return l;
      });
      commitLayersState(nextLayers);

      // Add as asset in library too
      const newAsset = {
        id: `gen-${Date.now()}`,
        url: data.imageUrl,
        date: new Date().toISOString().split("T")[0],
        name: aiPrompt.substring(0, 20) || "AI Generation"
      };
      setSavedAssets([newAsset, ...savedAssets]);

      onAddAuditLog("image.ai_generate", `Successfully generated AI image utilizing mode ${aiGenMode} with provider ${aiProvider}`);
      alert("Success! Your generated background is set on the active canvas board.");
    } catch (err: any) {
      alert(err.message || "Failed to generate image.");
    } finally {
      setAiGenerating(false);
    }
  };

  // Quick background replacement preset handler
  const handleReplaceBackgroundPreset = (styleName: string, url: string) => {
    const nextLayers = layers.map(l => {
      if (l.type === "background") {
        return {
          ...l,
          text: url,
          name: `Preset Backdrop (${styleName})`
        };
      }
      return l;
    });
    commitLayersState(nextLayers);
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
    commitLayersState([...layers, newLayer]);
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
    commitLayersState([...layers, newLayer]);
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
    commitLayersState([...layers, newLayer]);
    setSelectedLayerId(id);
  };

  const handleDeleteLayer = (id: string) => {
    commitLayersState(layers.filter(l => l.id !== id));
    if (selectedLayerId === id) {
      setSelectedLayerId(null);
    }
  };

  const handleToggleLock = (id: string) => {
    commitLayersState(layers.map(l => {
      if (l.id === id) return { ...l, locked: !l.locked };
      return l;
    }));
  };

  const handleToggleVisible = (id: string) => {
    commitLayersState(layers.map(l => {
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
    commitLayersState(reordered);
  };

  // Load Template Library presets
  const handleLoadTemplate = (tplId: string) => {
    const template = TEMPLATES_LIBRARY.find(t => t.id === tplId);
    if (!template) return;

    setCanvasAspectRatio(template.aspectRatio);
    setCanvasWidth(template.canvasWidth);
    setCanvasHeight(template.canvasHeight);
    commitLayersState(template.layers.map(l => ({ ...l, visible: true, locked: false })));
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
  const handleResizeForSocial = (ratio: "1:1" | "9:16" | "16:9" | "3:4") => {
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
    } else if (ratio === "3:4") {
      setCanvasWidth(600);
      setCanvasHeight(800);
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
            // Apply Filters to context
            let filterStr = "";
            if (layer.brightness !== undefined && layer.brightness !== 100) filterStr += ` brightness(${layer.brightness}%)`;
            if (layer.contrast !== undefined && layer.contrast !== 100) filterStr += ` contrast(${layer.contrast}%)`;
            if (layer.saturation !== undefined && layer.saturation !== 100) filterStr += ` saturate(${layer.saturation}%)`;
            if (layer.blur !== undefined && layer.blur > 0) filterStr += ` blur(${layer.blur}px)`;
            if (layer.sharpen) filterStr += ` contrast(125%) saturate(105%)`;
            
            if (layer.colorBalance === "warm") filterStr += ` sepia(20%) saturate(110%)`;
            else if (layer.colorBalance === "cool") filterStr += ` hue-rotate(15deg) saturate(105%)`;
            
            if (layer.highlights !== undefined && layer.highlights !== 0) filterStr += ` brightness(${100 + layer.highlights * 0.4}%)`;
            if (layer.shadows !== undefined && layer.shadows !== 0) filterStr += ` contrast(${100 + layer.shadows * 0.3}%)`;

            ctx.filter = filterStr.trim() || "none";

            // Support Flipping
            const flipX = layer.flipX ? -1 : 1;
            const flipY = layer.flipY ? -1 : 1;
            
            if (flipX !== 1 || flipY !== 1) {
              ctx.translate(canvasWidth / 2, canvasHeight / 2);
              ctx.scale(flipX, flipY);
              ctx.drawImage(img, -canvasWidth / 2, -canvasHeight / 2, canvasWidth, canvasHeight);
            } else {
              ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
            }

            // Reset filter
            ctx.filter = "none";
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
                <div className="space-y-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div>
                      <span className="text-[10px] font-mono text-emerald-400 font-bold block uppercase tracking-wider">
                        Commercial Preset Templates
                      </span>
                      <p className="text-[11px] text-gray-400 leading-relaxed mt-1">
                        Load standard multi-platform ad presets instantly. Every layer remains 100% editable, resizable, and drag-and-drop.
                      </p>
                    </div>

                    {/* Filter controls */}
                    <div className="space-y-2.5">
                      <div className="relative">
                        <input
                          type="text"
                          value={templateSearch}
                          onChange={(e) => setTemplateSearch(e.target.value)}
                          placeholder="Search professional presets..."
                          className="w-full h-8.5 bg-[#12131a] border border-gray-850 rounded-lg pl-3 pr-8 text-xs text-white placeholder-gray-550 outline-none focus:border-indigo-500"
                        />
                        {templateSearch && (
                          <button
                            onClick={() => setTemplateSearch("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs"
                          >
                            ×
                          </button>
                        )}
                      </div>

                      {/* Category selector */}
                      <div className="flex gap-1.5 overflow-x-auto pb-1 max-w-full scrollbar-thin">
                        {["All", "Product Ads", "Luxury Ads", "Fashion Ads", "Beauty Ads", "Electronics Ads", "Social Posts", "Instagram Stories", "Facebook Ads", "Promotional Banners"].map((cat) => (
                          <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`p-1 px-2.5 rounded text-[10px] font-mono font-bold whitespace-nowrap transition-all cursor-pointer ${
                              selectedCategory === cat
                                ? "bg-indigo-600 text-white"
                                : "bg-gray-900 text-gray-400 hover:text-white hover:bg-gray-850"
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                      {TEMPLATES_LIBRARY.filter(tpl => {
                        const matchesCat = selectedCategory === "All" || tpl.category === selectedCategory;
                        const matchesQuery = tpl.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
                                            tpl.category.toLowerCase().includes(templateSearch.toLowerCase());
                        return matchesCat && matchesQuery;
                      }).map(tpl => (
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

                      {TEMPLATES_LIBRARY.filter(tpl => {
                        const matchesCat = selectedCategory === "All" || tpl.category === selectedCategory;
                        const matchesQuery = tpl.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
                                            tpl.category.toLowerCase().includes(templateSearch.toLowerCase());
                        return matchesCat && matchesQuery;
                      }).length === 0 && (
                        <p className="text-xs text-gray-500 text-center py-6">No premium presets match current filters.</p>
                      )}
                    </div>
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
                    {/* Mode Selection */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-300 block">Generation Mode</label>
                      <select
                        value={aiGenMode}
                        onChange={(e) => setAiGenMode(e.target.value as any)}
                        className="w-full h-9 bg-[#12131a] border border-gray-850 rounded-lg px-2 text-xs text-white outline-none"
                      >
                        <option value="text_to_image">Text To Image (Creative Backdrop)</option>
                        <option value="product_to_image">Product To Image (Subject Insertion) [Beta Feature]</option>
                        <option value="image_to_image">Image To Image (Style Transfer) [Beta Feature]</option>
                        <option value="backdrop_generation">AI Background Generation (Studio)</option>
                        <option value="marketing_banner">Banner Background Generator (Promo)</option>
                      </select>
                    </div>

                    {/* Product Image Upload / Base64 input for subject modes */}
                    {(aiGenMode === "product_to_image" || aiGenMode === "image_to_image" || aiGenMode === "backdrop_generation" || aiGenMode === "marketing_banner") && (
                      <div className="space-y-1.5 bg-[#12131a] p-3 rounded-lg border border-gray-850">
                        <label className="text-[11px] font-semibold text-gray-300 block">Product Subject Image</label>
                        
                        {productImageBase64 ? (
                          <div className="relative h-20 bg-black/40 rounded border border-gray-800 flex items-center justify-between p-2">
                            <img
                              src={productImageBase64}
                              alt="Uploaded subject"
                              className="h-full w-16 object-cover rounded border border-gray-700"
                            />
                            <div className="text-right">
                              <span className="text-[9px] font-mono text-emerald-400 block">Ready for API</span>
                              <button
                                onClick={() => setProductImageBase64("")}
                                className="text-[10px] text-rose-400 hover:underline mt-1 cursor-pointer block"
                              >
                                Remove Image
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative border border-dashed border-gray-800 hover:border-gray-700 rounded-lg p-3 text-center transition-all">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    setProductImageBase64(reader.result as string);
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div className="space-y-1">
                              <Upload className="w-4 h-4 mx-auto text-indigo-400" />
                              <p className="text-[10px] text-gray-400">
                                Click or Drag your product photo (Auto-Base64 conversion)
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

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
                      disabled
                      className="py-1.5 text-center text-[10px] font-mono text-gray-500 bg-gray-900/50 border border-gray-850 rounded relative cursor-not-allowed opacity-60"
                      title="AI Background Removal - Coming Soon"
                    >
                      ✂️ Remove BG
                      <span className="ml-1 text-[8px] font-bold text-indigo-400 bg-indigo-950 px-1 py-0.5 rounded">Soon</span>
                    </button>
                    <button
                      disabled
                      className="py-1.5 text-center text-[10px] font-mono text-gray-500 bg-gray-900/50 border border-gray-850 rounded relative cursor-not-allowed opacity-60"
                      title="Smart Inpaint - Coming Soon"
                    >
                      🖌️ Inpaint
                      <span className="ml-1 text-[8px] font-bold text-emerald-400 bg-emerald-950 px-1 py-0.5 rounded">Soon</span>
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

                  {/* Background Layer specific advanced image filters panel */}
                  {selectedLayerId && layers.find(l => l.id === selectedLayerId)?.type === "background" && (
                    <div className="bg-[#12131a] p-3.5 rounded-lg border border-gray-850 space-y-3.5">
                      <span className="text-[10px] font-mono text-emerald-400 uppercase font-bold block">
                        ⚙️ Background Image Adjustments
                      </span>

                      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                        {/* Brightness slider */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-gray-400">
                            <span>Brightness</span>
                            <span>{layers.find(l => l.id === selectedLayerId)?.brightness ?? 100}%</span>
                          </div>
                          <input
                            type="range"
                            min="50"
                            max="150"
                            value={layers.find(l => l.id === selectedLayerId)?.brightness ?? 100}
                            onChange={(e) => updateActiveLayerProp("brightness", Number(e.target.value))}
                            className="w-full h-1 bg-gray-800 rounded appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Contrast slider */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-gray-400">
                            <span>Contrast</span>
                            <span>{layers.find(l => l.id === selectedLayerId)?.contrast ?? 100}%</span>
                          </div>
                          <input
                            type="range"
                            min="50"
                            max="150"
                            value={layers.find(l => l.id === selectedLayerId)?.contrast ?? 100}
                            onChange={(e) => updateActiveLayerProp("contrast", Number(e.target.value))}
                            className="w-full h-1 bg-gray-800 rounded appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Saturation slider */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-gray-400">
                            <span>Saturation</span>
                            <span>{layers.find(l => l.id === selectedLayerId)?.saturation ?? 100}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="200"
                            value={layers.find(l => l.id === selectedLayerId)?.saturation ?? 100}
                            onChange={(e) => updateActiveLayerProp("saturation", Number(e.target.value))}
                            className="w-full h-1 bg-gray-800 rounded appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Blur slider */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-gray-400">
                            <span>Blur</span>
                            <span>{layers.find(l => l.id === selectedLayerId)?.blur ?? 0}px</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="20"
                            value={layers.find(l => l.id === selectedLayerId)?.blur ?? 0}
                            onChange={(e) => updateActiveLayerProp("blur", Number(e.target.value))}
                            className="w-full h-1 bg-gray-800 rounded appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Highlights slider */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-gray-400">
                            <span>Highlights</span>
                            <span>{layers.find(l => l.id === selectedLayerId)?.highlights ?? 0}</span>
                          </div>
                          <input
                            type="range"
                            min="-50"
                            max="50"
                            value={layers.find(l => l.id === selectedLayerId)?.highlights ?? 0}
                            onChange={(e) => updateActiveLayerProp("highlights", Number(e.target.value))}
                            className="w-full h-1 bg-gray-800 rounded appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Shadows slider */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] font-mono text-gray-400">
                            <span>Shadows</span>
                            <span>{layers.find(l => l.id === selectedLayerId)?.shadows ?? 0}</span>
                          </div>
                          <input
                            type="range"
                            min="-50"
                            max="50"
                            value={layers.find(l => l.id === selectedLayerId)?.shadows ?? 0}
                            onChange={(e) => updateActiveLayerProp("shadows", Number(e.target.value))}
                            className="w-full h-1 bg-gray-800 rounded appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Color Balance select */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono text-gray-400">Color Balance</label>
                          <select
                            value={layers.find(l => l.id === selectedLayerId)?.colorBalance ?? "none"}
                            onChange={(e) => updateActiveLayerProp("colorBalance", e.target.value)}
                            className="w-full h-8 bg-[#0c0d12] border border-gray-850 rounded px-2 text-xs text-white outline-none"
                          >
                            <option value="none">Normal (Neutral)</option>
                            <option value="warm">Warm Sepia (Sunset)</option>
                            <option value="cool">Cool Blue (Nordic)</option>
                          </select>
                        </div>

                        {/* Flip & Sharpen triggers */}
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            onClick={() => {
                              const curr = layers.find(l => l.id === selectedLayerId);
                              updateActiveLayerProp("flipX", !curr?.flipX);
                            }}
                            className={`py-1.5 rounded border text-[10px] font-mono transition-all ${
                              layers.find(l => l.id === selectedLayerId)?.flipX 
                                ? "bg-indigo-950/40 border-indigo-500 text-indigo-400" 
                                : "bg-[#0c0d12] border-gray-850 text-gray-400"
                            }`}
                          >
                            Flip Horizontal
                          </button>
                          <button
                            onClick={() => {
                              const curr = layers.find(l => l.id === selectedLayerId);
                              updateActiveLayerProp("flipY", !curr?.flipY);
                            }}
                            className={`py-1.5 rounded border text-[10px] font-mono transition-all ${
                              layers.find(l => l.id === selectedLayerId)?.flipY 
                                ? "bg-indigo-950/40 border-indigo-500 text-indigo-400" 
                                : "bg-[#0c0d12] border-gray-850 text-gray-400"
                            }`}
                          >
                            Flip Vertical
                          </button>
                        </div>

                        <div className="pt-1">
                          <button
                            onClick={() => {
                              const curr = layers.find(l => l.id === selectedLayerId);
                              updateActiveLayerProp("sharpen", !curr?.sharpen);
                            }}
                            className={`w-full py-1.5 rounded border text-[10px] font-mono transition-all ${
                              layers.find(l => l.id === selectedLayerId)?.sharpen 
                                ? "bg-emerald-950/40 border-emerald-500 text-emerald-400" 
                                : "bg-[#0c0d12] border-gray-850 text-gray-400"
                            }`}
                          >
                            {layers.find(l => l.id === selectedLayerId)?.sharpen ? "★ Sharpen Active" : "Sharpen Backdrop"}
                          </button>
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
                  width: canvasAspectRatio === "9:16" ? "270px" : canvasAspectRatio === "16:9" ? "480px" : canvasAspectRatio === "3:4" ? "285px" : "380px",
                  aspectRatio: canvasAspectRatio === "9:16" ? "9/16" : canvasAspectRatio === "16:9" ? "16/9" : canvasAspectRatio === "3:4" ? "3/4" : "1/1",
                }}
              >
                {/* 1. Draw each layer dynamically using standard CSS layout */}
                {layers.filter(l => l.visible !== false).map((layer) => {
                  const scaleX = (canvasAspectRatio === "9:16" ? 270 : canvasAspectRatio === "16:9" ? 480 : canvasAspectRatio === "3:4" ? 285 : 380) / canvasWidth;
                  const scaleY = (canvasAspectRatio === "9:16" ? 480 : canvasAspectRatio === "16:9" ? 270 : canvasAspectRatio === "3:4" ? 380 : 380) / canvasHeight;

                  const isSelected = selectedLayerId === layer.id;

                  // Render background layer
                  if (layer.type === "background") {
                    const previewFilter = `
                      brightness(${layer.brightness !== undefined ? layer.brightness : 100}%)
                      contrast(${layer.contrast !== undefined ? layer.contrast : 100}%)
                      saturate(${layer.saturation !== undefined ? layer.saturation : 100}%)
                      blur(${layer.blur !== undefined ? layer.blur : 0}px)
                      ${layer.sharpen ? 'contrast(125%) saturate(105%)' : ''}
                      ${layer.colorBalance === 'warm' ? 'sepia(20%) saturate(110%)' : layer.colorBalance === 'cool' ? 'hue-rotate(15deg) saturate(105%)' : ''}
                      ${layer.highlights !== undefined && layer.highlights !== 0 ? `brightness(${100 + layer.highlights * 0.4}%)` : ''}
                      ${layer.shadows !== undefined && layer.shadows !== 0 ? `contrast(${100 + layer.shadows * 0.3}%)` : ''}
                    `.replace(/\s+/g, ' ').trim();

                    const previewTransform = `scale(${layer.flipX ? -1 : 1}, ${layer.flipY ? -1 : 1})`;

                    return (
                      <div
                        key={layer.id}
                        onClick={(e) => { e.stopPropagation(); setSelectedLayerId(null); }}
                        className="absolute inset-0 bg-cover bg-center transition-all"
                        style={{
                          backgroundImage: `url(${layer.text})`,
                          backgroundColor: layer.color || "#0c0d12",
                          opacity: layer.opacity,
                          filter: previewFilter || undefined,
                          transform: previewTransform
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
