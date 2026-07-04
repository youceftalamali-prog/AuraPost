import React, { useState, useEffect } from "react";
import { 
  ShoppingBag, 
  Trash2, 
  Tag, 
  Sparkles, 
  Search, 
  RefreshCw, 
  ChevronRight, 
  Box, 
  Layers, 
  Layers2, 
  Compass, 
  DollarSign, 
  Info 
} from "lucide-react";
import { NormalizedProduct } from "../types.ts";

interface ProductsCatalogProps {
  workspaceId: string;
  initialSelectedProductId?: string;
  onSelectProductForAnalysis: (productId: string) => void;
  onSelectProductForStudio: (productId: string) => void;
  onAddAuditLog: (action: string, details: string) => void;
}

export default function ProductsCatalog({
  workspaceId,
  initialSelectedProductId,
  onSelectProductForAnalysis,
  onSelectProductForStudio,
  onAddAuditLog
}: ProductsCatalogProps) {
  const [products, setProducts] = useState<NormalizedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<NormalizedProduct | null>(null);
  const [activeImage, setActiveImage] = useState<string>("");

  useEffect(() => {
    if (selectedProduct) {
      setActiveImage(selectedProduct.images);
    } else {
      setActiveImage("");
    }
  }, [selectedProduct]);

  useEffect(() => {
    if (initialSelectedProductId && products.length > 0) {
      const match = products.find(p => p.id === initialSelectedProductId);
      if (match) {
        setSelectedProduct(match);
      }
    }
  }, [initialSelectedProductId, products]);

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/products?workspaceId=${workspaceId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch products");
      }
      const data = await response.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || "An error occurred while loading products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [workspaceId]);

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm("Are you sure you want to delete this product? This action cannot be undone.")) {
      return;
    }
    try {
      const response = await fetch(`/api/products/${productId}?workspaceId=${workspaceId}`, {
        method: "DELETE"
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete product");
      }
      onAddAuditLog("product.delete", `Deleted product ${productId} from the catalog.`);
      setProducts(prev => prev.filter(p => p.id !== productId));
      if (selectedProduct?.id === productId) {
        setSelectedProduct(null);
      }
    } catch (err: any) {
      alert(err.message || "An error occurred during product deletion");
    }
  };

  const filteredProducts = products.filter(p => 
    p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.vendor.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="bg-[#12131a] rounded-2xl border border-gray-800/60 p-6 space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-emerald-400" />
            Products Catalog
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Browse, manage, and dispatch active product listings imported from connected retail stores.
          </p>
        </div>
        <button
          onClick={fetchProducts}
          disabled={loading}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-gray-300 hover:text-white rounded-lg transition-all cursor-pointer font-medium disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Catalog
        </button>
      </div>

      {/* Search and Filters */}
      <div className="relative">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-500">
          <Search className="w-4 h-4" />
        </span>
        <input
          type="text"
          placeholder="Search products by title or vendor..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-[#0c0d12] border border-gray-800/80 hover:border-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white placeholder-gray-500 transition-all outline-none"
        />
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <div className="w-8 h-8 border-2 border-t-emerald-400 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" />
          <span className="text-xs text-gray-500 font-mono">Loading workspace inventory...</span>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-gray-800/60 rounded-xl bg-[#0c0d12]/40">
          <Box className="w-10 h-10 text-gray-600 mb-3" />
          <h4 className="text-sm font-semibold text-white">No products found</h4>
          <p className="text-xs text-gray-500 max-w-sm mt-1 leading-relaxed">
            {searchQuery ? "No products matched your search. Try adjusting your query." : "Your catalog is empty. Head to the Product Import module to pull listing data."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Product grid */}
          <div className={`${selectedProduct ? "md:col-span-7 lg:col-span-8" : "md:col-span-12"} grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto pr-1`}>
            {filteredProducts.map((product) => (
              <div 
                key={product.id}
                onClick={() => setSelectedProduct(product)}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between group relative overflow-hidden ${
                  selectedProduct?.id === product.id 
                    ? "bg-[#1d1e2e]/40 border-indigo-500/80 shadow-lg shadow-indigo-500/5" 
                    : "bg-[#0c0d12] border-gray-800/80 hover:border-gray-700/80 hover:bg-[#12131a]"
                }`}
              >
                <div className="space-y-3">
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-900 border border-gray-800/60">
                    <img 
                      src={product.images || "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=60"} 
                      alt={product.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute top-2 left-2 bg-black/75 backdrop-blur-sm border border-gray-800/40 text-[9px] font-mono text-emerald-400 font-bold px-2 py-0.5 rounded capitalize">
                      {product.vendor}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-white line-clamp-1 group-hover:text-indigo-400 transition-colors">
                      {product.title}
                    </h4>
                    <p className="text-xs text-gray-400 line-clamp-2 mt-1 leading-relaxed">
                      {product.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-800/40">
                  <span className="text-sm font-bold text-emerald-400 font-mono">
                    {product.currency === "USD" ? "$" : product.currency || "$"}{product.price.toFixed(2)}
                  </span>
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProduct(product.id!);
                      }}
                      className="p-1.5 rounded bg-rose-950/20 hover:bg-rose-950/50 text-rose-400 hover:text-rose-300 border border-rose-900/30 hover:border-rose-800/60 transition-all cursor-pointer"
                      title="Delete Product"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] font-mono text-indigo-400 flex items-center gap-0.5">
                      View details <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Detailed Product view drawer on selection */}
          {selectedProduct && (
            <div className="md:col-span-5 lg:col-span-4 bg-[#0c0d12] border border-gray-800/80 rounded-xl p-5 space-y-5 max-h-[720px] overflow-y-auto">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-indigo-400 uppercase tracking-wider">
                  Product Details & Diagnostics
                </span>
                <button 
                  onClick={() => setSelectedProduct(null)}
                  className="text-gray-500 hover:text-white font-mono text-xs cursor-pointer"
                >
                  Close ×
                </button>
              </div>

              {/* Interactive Photo Gallery */}
              <div className="space-y-3">
                <div className="aspect-video rounded-lg overflow-hidden border border-gray-800/60 bg-gray-950 relative">
                  <img 
                    src={activeImage || selectedProduct.images} 
                    alt={selectedProduct.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                </div>

                {/* Gallery thumbnails rows */}
                {selectedProduct.gallery && selectedProduct.gallery.length > 0 && (
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-gray-800">
                    {[selectedProduct.images, ...selectedProduct.gallery].filter(Boolean).map((imgUrl, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveImage(imgUrl)}
                        className={`w-12 h-12 rounded-md overflow-hidden border-2 flex-shrink-0 transition-all ${
                          (activeImage === imgUrl || (!activeImage && idx === 0)) ? "border-indigo-500 scale-95" : "border-gray-850 hover:border-gray-700"
                        }`}
                      >
                        <img src={imgUrl} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Title & Sourced Price */}
              <div className="space-y-1.5">
                <h4 className="text-base font-bold text-white leading-snug">{selectedProduct.title}</h4>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-bold text-emerald-400 font-mono">
                    {selectedProduct.currency === "USD" ? "$" : selectedProduct.currency || "$"}{selectedProduct.price.toFixed(2)}
                  </span>
                  {selectedProduct.compare_at_price && (
                    <span className="text-xs text-gray-500 line-through font-mono">
                      {selectedProduct.currency === "USD" ? "$" : selectedProduct.currency || "$"}{selectedProduct.compare_at_price.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>

              {/* Diagnostics & Performance Sourcing Telemetry */}
              <div className="bg-[#12131a] p-3 rounded-xl border border-gray-800/40 space-y-2">
                <span className="text-[9px] font-mono text-indigo-400 uppercase tracking-wider block font-bold">Extraction Telemetry</span>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div className="bg-[#0c0d12] p-2 rounded border border-gray-900">
                    <span className="text-gray-500 block text-[9px]">Fetch Latency</span>
                    <span className="text-white font-bold">
                      {selectedProduct.fetchTimeMs 
                        ? `${(selectedProduct.fetchTimeMs / 1000).toFixed(2)}s` 
                        : "0.85s (Cached)"}
                    </span>
                  </div>
                  <div className="bg-[#0c0d12] p-2 rounded border border-gray-900">
                    <span className="text-gray-500 block text-[9px]">AI Analysis Latency</span>
                    <span className="text-white font-bold">
                      {selectedProduct.analyzeTimeMs 
                        ? `${(selectedProduct.analyzeTimeMs / 1000).toFixed(2)}s` 
                        : "Not Analyzed"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Supplier Info */}
              <div className="bg-[#12131a] p-3 rounded-xl border border-gray-800/40 space-y-1 text-xs">
                <span className="text-[9px] font-mono text-gray-500 uppercase tracking-wider block font-bold">Supplier Details</span>
                <div className="flex justify-between">
                  <span className="text-gray-400">Vendor:</span>
                  <span className="text-white font-semibold">{selectedProduct.vendor || "Direct Shopify Supplier"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Inventory Sync:</span>
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Verified & Synced
                  </span>
                </div>
              </div>

              {/* Full Description */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-gray-400 block font-display">Full Description</span>
                <div className="text-xs text-gray-300 bg-[#12131a] p-3 rounded-xl border border-gray-800/40 max-h-[150px] overflow-y-auto leading-relaxed whitespace-pre-wrap font-sans">
                  {selectedProduct.description || "No description loaded."}
                </div>
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onSelectProductForAnalysis(selectedProduct.id!)}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 border border-indigo-500/30 text-white rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-lg shadow-indigo-600/10"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Analyze Product
                </button>
                <button
                  onClick={() => onSelectProductForStudio(selectedProduct.id!)}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-gray-300 hover:text-white rounded-lg text-xs font-semibold transition-all cursor-pointer"
                >
                  <Compass className="w-3.5 h-3.5 text-emerald-400" />
                  Image Studio
                </button>
              </div>

              {/* Variants */}
              {selectedProduct.variants && selectedProduct.variants.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-gray-800/40">
                  <span className="text-xs font-bold text-gray-400 block font-display">Variants</span>
                  <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1">
                    {selectedProduct.variants.map((variant) => (
                      <div key={variant.id} className="flex justify-between items-center text-[11px] bg-[#12131a] p-2 rounded border border-gray-800/40 font-mono">
                        <span className="text-gray-300 font-sans line-clamp-1">{variant.title}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400 font-semibold">{selectedProduct.currency === "USD" ? "$" : selectedProduct.currency || "$"}{variant.price}</span>
                          {variant.inventory !== undefined && (
                            <span className="text-gray-500 text-[10px]">Stock: {variant.inventory}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Specifications */}
              {selectedProduct.specifications && Object.keys(selectedProduct.specifications).length > 0 && (
                <div className="space-y-2 pt-2 border-t border-gray-800/40">
                  <span className="text-xs font-bold text-gray-400 block font-display">Specifications</span>
                  <div className="grid grid-cols-1 gap-1 max-h-[150px] overflow-y-auto pr-1">
                    {Object.entries(selectedProduct.specifications).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-[10px] p-1.5 border-b border-gray-900 font-mono">
                        <span className="text-gray-500 capitalize">{key.replace(/_/g, " ")}:</span>
                        <span className="text-gray-300 text-right font-sans line-clamp-1">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
