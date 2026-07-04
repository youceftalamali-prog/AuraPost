import { NormalizedProduct } from "../../src/types.ts";

export interface MockedTestResult {
  url: string;
  success: boolean;
  product?: NormalizedProduct;
  error?: {
    rootCause: string;
    errorMessage: string;
    recoveryStrategy: string;
    fixApplied: string;
  };
}

export const TEST_DATASET: Record<string, MockedTestResult[]> = {
  Shopify: [
    {
      url: "https://allbirds.com/products/mens-tree-runner-carbon",
      success: true,
      product: {
        title: "Men's Tree Runner - Carbon (Black Sole)",
        description: "Our signature everyday sneaker made with breathable, silky-smooth FSC-certified eucalyptus tree fiber. Lightweight, cool, and incredibly comfortable.",
        images: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=600",
          "https://images.unsplash.com/photo-1608231387042-66d1773070a5?q=80&w=600"
        ],
        variants: [
          { id: "tb-c-8", title: "Carbon / Size 8", price: "105.00", sku: "AB-TR-M-CARB-8", inventory: 25 },
          { id: "tb-c-9", title: "Carbon / Size 9", price: "105.00", sku: "AB-TR-M-CARB-9", inventory: 40 },
          { id: "tb-c-10", title: "Carbon / Size 10", price: "105.00", sku: "AB-TR-M-CARB-10", inventory: 15 }
        ],
        specifications: {
          "Material": "FSC-certified Eucalyptus Fiber",
          "Sole": "SweetFoam® (Sugarcane-based EVA)",
          "Laces": "100% Recycled Polyester",
          "Care": "Machine washable on delicate cycle"
        },
        vendor: "Allbirds",
        price: 105.00,
        compare_at_price: 120.00,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://gymshark.com/products/gymshark-crest-t-shirt-black",
      success: true,
      product: {
        title: "Gymshark Crest T-Shirt - Black",
        description: "The slim fit Crest T-Shirt is your go-to workout top. Slim-fitting, stretchy fabric with a clean Gymshark embroidered crest on the chest.",
        images: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=600",
          "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?q=80&w=600"
        ],
        variants: [
          { id: "gs-ct-s", title: "Black / Small", price: "26.00", sku: "GS-CRT-M-BLK-S", inventory: 50 },
          { id: "gs-ct-m", title: "Black / Medium", price: "26.00", sku: "GS-CRT-M-BLK-M", inventory: 120 },
          { id: "gs-ct-l", title: "Black / Large", price: "26.00", sku: "GS-CRT-M-BLK-L", inventory: 85 }
        ],
        specifications: {
          "Material": "95% Cotton, 5% Elastane",
          "Fit": "Slim Fit",
          "Weight": "160 GSM",
          "Logo": "Embroidered classic Crest"
        },
        vendor: "Gymshark",
        price: 26.00,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://kyliecosmetics.com/products/matte-liquid-lipstick",
      success: true,
      product: {
        title: "Matte Liquid Lipstick - Posie K",
        description: "The Matte Liquid Lipstick is my secret weapon to create the perfect long-lasting matte lip. Cruelty-free and vegan formula with intense pigment payoff.",
        images: "https://images.unsplash.com/photo-1625093742435-6fa192b6fb10?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1625093742435-6fa192b6fb10?q=80&w=600",
          "https://images.unsplash.com/photo-1586495777744-4413f21062fa?q=80&w=600"
        ],
        variants: [
          { id: "kc-ll-pk", title: "Posie K", price: "18.00", sku: "KC-LIP-POSIEK", inventory: 100 },
          { id: "kc-ll-cc", title: "Candy K", price: "18.00", sku: "KC-LIP-CANDYK", inventory: 75 }
        ],
        specifications: {
          "Finish": "Matte",
          "Duration": "8-Hour Wear",
          "Volume": "3.0 ml / 0.10 fl oz",
          "Attributes": "Vegan, Cruelty-free, Gluten-Free"
        },
        vendor: "Kylie Cosmetics",
        price: 18.00,
        compare_at_price: 22.00,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://bulletproof.com/products/original-clean-coffee-beans-12oz",
      success: true,
      product: {
        title: "Original Decaf Clean Coffee Beans - 12 oz Bag",
        description: "Tested for toxins, smooth, mold-free coffee beans roasted to medium to preserve full-bodied chocolate and sweet notes. Perfect for keto/paleo bulletproof recipes.",
        images: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?q=80&w=600",
          "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?q=80&w=600"
        ],
        variants: [
          { id: "bp-ocb-12", title: "12 oz Bag", price: "15.99", sku: "BP-COF-ORIG-12", inventory: 150 },
          { id: "bp-ocb-24", title: "24 oz Double Pack", price: "29.99", sku: "BP-COF-ORIG-24", inventory: 40 }
        ],
        specifications: {
          "Roast": "Medium Roast",
          "Notes": "Cacao, Orange, Nectarine",
          "Rainforest Alliance": "100% Certified",
          "Toxin Test Clear": "Yes (Mycotoxin-tested)"
        },
        vendor: "Bulletproof Products",
        price: 15.99,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://rnscollective.com/products/classic-tee",
      success: true,
      product: {
        title: "The Classic Tee - Midnight Navy",
        description: "Heavyweight organic combed cotton, pre-shrunk for a perfect vintage fit that lasts. Made locally in ethical workshops.",
        images: "https://images.unsplash.com/photo-1581655353564-df123a1eb820?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1581655353564-df123a1eb820?q=80&w=600"
        ],
        variants: [
          { id: "rn-tee-n-s", title: "Midnight Navy / Small", price: "40.00", sku: "RNS-TEE-NAV-S", inventory: 15 },
          { id: "rn-tee-n-m", title: "Midnight Navy / Medium", price: "40.00", sku: "RNS-TEE-NAV-M", inventory: 18 }
        ],
        specifications: {
          "Fabric": "100% Organic Combed Cotton",
          "Weight": "240 GSM Heavyweight",
          "Country": "Made in Portugal",
          "Stitching": "Double-needle clean rib collar"
        },
        vendor: "RNS Collective",
        price: 40.00,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://chubbiesshorts.com/products/the-classic-swim-trunk",
      success: true,
      product: {
        title: "The Classic Swim Trunk - 5.5 Inch Inseam",
        description: "Constructed with premium 4-way stretch polyester fabric, mesh interior brief, and a robust elastic drawstring waistband. Perfect for lazy beach weekends.",
        images: "https://images.unsplash.com/photo-1505236271233-2f5d9d3c10f5?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1505236271233-2f5d9d3c10f5?q=80&w=600",
          "https://images.unsplash.com/photo-1519046904884-53103b34b206?q=80&w=400"
        ],
        variants: [
          { id: "ch-st-m", title: "Size Medium / Blue Palm", price: "59.50", sku: "CHUB-SW-BLU-M", inventory: 60 },
          { id: "ch-st-l", title: "Size Large / Blue Palm", price: "59.50", sku: "CHUB-SW-BLU-L", inventory: 44 }
        ],
        specifications: {
          "Inseam": "5.5 inches",
          "Stretching Type": "4-Way Comfort Stretch",
          "Lining": "Breathable comfort mesh brief",
          "Pockets": "Two side slash, one zippered secure back pocket"
        },
        vendor: "Chubbies Shorts",
        price: 59.50,
        compare_at_price: 69.50,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://quadlockcase.com/products/quad-lock-case-all-iphone-devices",
      success: true,
      product: {
        title: "Quad Lock Protective Case - iPhone 15 Pro",
        description: "The ultimate cycling and active lifestyle protective case. Equipped with a secure patented dual-stage locking core and impact-absorbing edge-to-edge TPU shell.",
        images: "https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?q=80&w=600"
        ],
        variants: [
          { id: "ql-ip-15p", title: "iPhone 15 Pro Case", price: "34.99", sku: "QL-CASE-IP15P", inventory: 320 },
          { id: "ql-ip-15pm", title: "iPhone 15 Pro Max Case", price: "39.99", sku: "QL-CASE-IP15PM", inventory: 210 }
        ],
        specifications: {
          "Material": "Tough Polycarbonate Core, TPU Border",
          "Drop Protection": "Military Rating (MIL-STD-810G)",
          "Locking Mechanism": "Dual-stage Twist-Lock",
          "Wireless Charging": "MagSafe compatible"
        },
        vendor: "Quad Lock",
        price: 34.99,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://establishedcoffee.com/products/filter-coffee-subscription",
      success: true,
      product: {
        title: "Filter Coffee Sourcing Subscription - Bi-Weekly",
        description: "Get freshly roasted, sustainably sourced single-origin coffee beans delivered directly to your kitchen. Roasted precisely by our masters every Tuesday.",
        images: "https://images.unsplash.com/photo-1447933601403-0c6688de566e?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1447933601403-0c6688de566e?q=80&w=600",
          "https://images.unsplash.com/photo-1511920170033-f8396924c348?q=80&w=400"
        ],
        variants: [
          { id: "esc-sub-250", title: "250g Whole Bean Pack", price: "16.50", sku: "EST-SUB-WB-250", inventory: 80 },
          { id: "esc-sub-1000", title: "1000g Whole Bean Pack", price: "48.00", sku: "EST-SUB-WB-1000", inventory: 30 }
        ],
        specifications: {
          "Origin Type": "Single Origin Rotational",
          "Delivery Scheme": "Every 14 days",
          "Roast Style": "Omni-Filter Light Roast",
          "Direct Trade": "Sourced transparently at farm gate"
        },
        vendor: "Established Coffee Roast Corp",
        price: 16.50,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://fashionnova.com/products/classic-high-waist-jean-black",
      success: true,
      product: {
        title: "Classic High-Waisted Skinny Jeans - Black",
        description: "Features a super-stretchy construction that hugs curves beautifully. Clean minimal look with zero distressing. Classic 5-pocket hardware setup.",
        images: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?q=80&w=600"
        ],
        variants: [
          { id: "fn-jean-s", title: "Black / US Size 3", price: "34.99", sku: "FN-JN-BLK-H-3", inventory: 40 },
          { id: "fn-jean-m", title: "Black / US Size 5", price: "34.99", sku: "FN-JN-BLK-H-5", inventory: 90 }
        ],
        specifications: {
          "Material": "75% Cotton, 23% Polyester, 2% Spandex",
          "Rise": "High Waist 10.5 Inches",
          "Inseam": "29 Inches",
          "Style": "Skinny-fit stretch"
        },
        vendor: "Fashion Nova LLC",
        price: 34.99,
        compare_at_price: 39.99,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://peel.com/products/super-thin-iphone-case",
      success: true,
      product: {
        title: "Peel Super Thin iPhone 15 Pro Case - Clear Matte",
        description: "The original super thin case. Only 0.35mm thin, branding free, and designed specifically to protect your phone from scuffs and minor drops while maintaining its aesthetic beauty.",
        images: "https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?q=80&w=600",
          "https://images.unsplash.com/photo-1541807084-5c52b6b3adef?q=80&w=400"
        ],
        variants: [
          { id: "peel-ip15p-st-clr", title: "Clear Matte / iPhone 15 Pro", price: "39.00", sku: "PEEL-IP15P-MATTE", inventory: 450 }
        ],
        specifications: {
          "Thickness": "0.35 mm",
          "Material": "Semi-flexible Premium PP polymer",
          "Branding": "100% Logo-Free clean design",
          "MagSafe Support": "Compatible with standard chargers"
        },
        vendor: "Peel Accessories",
        price: 39.00,
        currency: "USD",
        availability: true
      },
      error: {
        rootCause: "CORS blocks and metadata obfustication on Peel's headful React checkout stack.",
        errorMessage: "Network Tunnel Timed Out (504 Gateway Timeout) while waiting for dynamic cloudflare challenge script verification.",
        recoveryStrategy: "Reroute through dedicated residential proxy pools or fall back transparently to oEmbed metadata schema definitions.",
        fixApplied: "Applied automatic fallback rule targeting JSON-LD and oEmbed headers, saving the transaction from blocking state."
      }
    }
  ],
  WooCommerce: [
    {
      url: "https://skateroom.com/products/basquiat-pezu-azul",
      success: true,
      product: {
        title: "Jean-Michel Basquiat 'Pez Dispenser' - Skateboard Deck",
        description: "An official art skateboard deck in collaboration with the Estate of Jean-Michel Basquiat. Crafted from handpicked Canadian Grade-A Maple wood.",
        images: "https://images.unsplash.com/photo-1547447134-cd3f5c716030?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1547447134-cd3f5c716030?q=80&w=600"
        ],
        variants: [
          { id: "sr-ba-p1", title: "Standard Premium Skateboard Single Deck", price: "220.00", sku: "SR-BAS-PEZ-SD", inventory: 15 }
        ],
        specifications: {
          "Artistic License": "Licensed via Estate of Jean-Michel Basquiat",
          "Material": "7-Ply Canadian Hard Rock Maple",
          "Dimensions": "W: 8 in x L: 31 in",
          "Fixings": "Wall mount bracket kit included free"
        },
        vendor: "The Skateroom",
        price: 220.00,
        currency: "EUR",
        availability: true
      }
    },
    {
      url: "https://rootscience.com/products/cleansing-oil",
      success: true,
      product: {
        title: "Root Science Cleansing Facial Oil - Bare 4oz",
        description: "An organic deep-clarifying wash oil. Dissolves micro-particles, heavy makeup, and accumulated sebum seamlessly without removing valuable natural moisture skin barriers.",
        images: "https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?q=80&w=600"
        ],
        variants: [
          { id: "rs-co-4", title: "Bare | 4 oz Amber bottle", price: "48.00", sku: "RS-CLE-BARE-4", inventory: 35 }
        ],
        specifications: {
          "Formulation Type": "100% Certified Organic cold-pressed botanical oils",
          "Skin compatibility": "All skin types (including hyper-sensitive blockages)",
          "Aroma Profile": "Unscented zero essential oils",
          "Container": "Amber glass UV protective bottle"
        },
        vendor: "Root Science Organics",
        price: 48.00,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://bjorkandberries.com/products/herbalist-hand-cream",
      success: true,
      product: {
        title: "Swedish Herbalist Hand Cream - 50 ml Tube",
        description: "Packed with active birch leaf water and calming Nordic natural elements. Hydrates rough skin intensely with a relaxing forest herbal fragrance.",
        images: "https://images.unsplash.com/photo-1601049541289-9b1b7bbbfe19?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1601049541289-9b1b7bbbfe19?q=80&w=600"
        ],
        variants: [
          { id: "bb-hh-50", title: "Classic 50ml Aluminium Tube", price: "18.00", sku: "BB-HC-HERB-50", inventory: 90 }
        ],
        specifications: {
          "Key active ingredients": "Birch Leaf Water, Shea Butter, Rapeseed Oil",
          "Eco rating": "98% Natural origin, 100% vegan certified",
          "Scent note": "Juniper berries, crushed pine needles, herbal clover",
          "Origin": "Formulated and crafted in Sweden"
        },
        vendor: "Björk & Berries",
        price: 18.00,
        currency: "SEK",
        availability: true
      }
    },
    {
      url: "https://tumbleweedframes.com/product/rustic-wood-frame",
      success: true,
      product: {
        title: "Tumbleweed Rustic Salvaged Wood Frame (8x10)",
        description: "Handcrafted purely from authentic weathered barn wood boards salvaged in Eastern Oregon. Truly rustic with custom hardware backings.",
        images: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?q=80&w=600"
        ],
        variants: [
          { id: "tw-rf-810", title: "8x10 Frame Size", price: "35.50", sku: "TUM-FR-RUST-810", inventory: 20 },
          { id: "tw-rf-1114", title: "11x14 Frame Size", price: "45.00", sku: "TUM-FR-RUST-1114", inventory: 12 }
        ],
        specifications: {
          "Wood Type": "100% Weathered Salvaged Pine and Cedar",
          "Made in": "Oregon, USA",
          "Glazing": "Low-iron anti-reflective museum frame glass",
          "Hanger configuration": "Dual metal brackets for vertical or horizontal display"
        },
        vendor: "Tumbleweed Handmade Goods",
        price: 35.50,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://essentialoils.woo.com/product/lavender-essential-oil",
      success: true,
      product: {
        title: "Pure Organic Lavender Therapeutic Essential Oil",
        description: "Steam-distilled French lavender flowers. Perfect for diffusing, creating bedtime routines, or massaging tense muscle fibers.",
        images: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?q=80&w=600"
        ],
        variants: [
          { id: "eo-lav-15", title: "15ml Bottle size", price: "14.99", sku: "EO-LAV-ORG-15M", inventory: 300 }
        ],
        specifications: {
          "Botanical Designation": "Lavandula angustifolia",
          "Source Location": "Provence, France",
          "Extraction Process": "Low-heat steam distillation of flower tops",
          "Purity Benchmark": "100% Purity Therapeutic GC/MS tested"
        },
        vendor: "Aromatherapy Labs",
        price: 14.99,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://overland.woo.com/product/sheepskin-rugged-slippers",
      success: true,
      product: {
        title: "High-Country Sheared Sheepskin Rugged Slippers",
        description: "Sumptuously thick natural Australian sheepskin lining paired with robust double-stitched leather uppers and a vulcanized rubber indoor/outdoor sole.",
        images: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?q=80&w=600"
        ],
        variants: [
          { id: "ov-ss-9", title: "Men's Size 9", price: "89.00", sku: "OV-SLIP-9", inventory: 25 },
          { id: "ov-ss-10", title: "Men's Size 10", price: "89.00", sku: "OV-SLIP-10", inventory: 40 }
        ],
        specifications: {
          "Lining Type": "100% Genuine sheared sheepskin fleece",
          "Uppers": "Water-resistant premium suede leather",
          "Sole material": "Vulcanized grippy gum rubber",
          "Warmth Index": "Extreme insulation optimal for winter climates"
        },
        vendor: "Overland Frontier Wear",
        price: 89.00,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://craftbeer.woo.com/product/organic-ipa-box",
      success: true,
      product: {
        title: "Organic Double IPA Craft Box (12-Pack)",
        description: "A selection of our award-winning dry-hopped organic IPAs. Bursting with notes of elderflower, pine resin, grapefruit peel, and clean crisp barley finishes.",
        images: "https://images.unsplash.com/photo-1600788886242-5c96aabe3757?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1600788886242-5c96aabe3757?q=80&w=600"
        ],
        variants: [
          { id: "cb-ipa-12", title: "12 Can Box (16 oz cans)", price: "39.99", sku: "CRAFT-DIPA-12", inventory: 80 }
        ],
        specifications: {
          "Average ABV": "7.8% Alcohol by Volume",
          "IBU Bitterness rating": "65 IBU",
          "Hop Varieties Used": "Citra, Mosaic, Simcoe Organic Hops",
          "Soil Association Certified": "Yes (100% Organic certified)"
        },
        vendor: "Cascadia Brew Co.",
        price: 39.99,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://nordicmug.woo.com/product/matte-ceramic-mug",
      success: true,
      product: {
        title: "Scandinavian Matte Ceramic Tea Mug",
        description: "Hand-thrown sand gravel clay tableware fired at 1300°C for exceptional strength. Dipped in our signature speckled eggshell white matte glaze.",
        images: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?q=80&w=600"
        ],
        variants: [
          { id: "nm-mg-std", title: "Speckled Eggshell Standard Mug", price: "24.00", sku: "NORD-MUG-SPECK", inventory: 200 }
        ],
        specifications: {
          "Volume Capacity": "350 ml (12 fl oz)",
          "Material Composition": "High-fired Nordic Stoneware Clay",
          "Oven/Microwave Safe": "Yes",
          "Dishwasher proof": "Yes"
        },
        vendor: "Fjord & Hearth",
        price: 24.00,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://urbanplant.woo.com/product/monstera-deliciosa-potted",
      success: true,
      product: {
        title: "Monstera Deliciosa Split-leaf Philodendron Potted",
        description: "Known as the Swiss cheese plant. Easy to care for evergreen tropical vine with iconic leaf perforations. Arrives in a compostable coconut coir pot.",
        images: "https://images.unsplash.com/photo-1614594975525-e45190c55d0b?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1614594975525-e45190c55d0b?q=80&w=600"
        ],
        variants: [
          { id: "up-md-coir", title: "Classic Plant in 10\" Coir Pot", price: "55.00", sku: "URB-MONS-P10", inventory: 50 },
          { id: "up-md-terracotta", title: "Classic Plant in 10\" Terracotta Pot", price: "75.00", sku: "URB-MONS-T10", inventory: 15 }
        ],
        specifications: {
          "Light Requirements": "Bright, indirect natural solar levels",
          "Water Schedule": "Once weekly (allowing soil to dry out moderately)",
          "Average plant height": "24 to 32 inches tall",
          "Pet Friendly": "No, toxic if chewed by domestic animals"
        },
        vendor: "Urban Plant Co.",
        price: 55.00,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://classicvinyl.woo.com/product/miles-davis-kind-of-blue",
      success: true,
      product: {
        title: "Miles Davis - Kind of Blue (180g Vinyl LP)",
        description: "The best-selling jazz album of all time. This legendary masterpiece is reissued on premium 180-gram heavyweight audiophile vinyl, delivering unparalleled warmth, depth, and dynamics for analog collectors.",
        images: "https://images.unsplash.com/photo-1539625318635-aae754024d1a?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1539625318635-aae754024d1a?q=80&w=600"
        ],
        variants: [
          { id: "wc-kob-180g", title: "180g Audiophile Vinyl LP", price: "29.99", sku: "WC-LP-DAV-KOB", inventory: 120 }
        ],
        specifications: {
          "Artist": "Miles Davis",
          "Release Date": "August 17, 1959 (Reissue)",
          "Format": "180-Gram Heavyweight Vinyl LP",
          "Genre": "Modal Jazz",
          "Label": "Columbia Records"
        },
        vendor: "Classic Vinyl & Co.",
        price: 29.99,
        currency: "USD",
        availability: true
      },
      error: {
        rootCause: "Target site utilizes a heavily-customized WooCommerce theme that filters JSON-LD tags into encrypted baseline JS chunks.",
        errorMessage: "Schema Mismatch: [variants must be a non-empty array of size >= 1] because variation tables are computed asynchronously in external scripts.",
        recoveryStrategy: "Inject browser-sandbox hydration to compile price variables directly from pricing selectors on-page.",
        fixApplied: "Configured fallback scraper pattern to parse dynamic class configurations (.price, .amount) when structured LD-JSON is absent."
      }
    }
  ],
  Amazon: [
    {
      url: "https://amazon.com/dp/B09G96T2R5",
      success: true,
      product: {
        title: "Apple iPad mini (6th Generation): with A15 Bionic chip, 8.3-inch Liquid Retina Display, 64GB, Wi-Fi 6",
        description: "The classic portable tablet redefined. Packed with the incredibly speedy A15 Bionic chip, 12MP Ultra-wide dynamic camera with Center Stage support, and Apple Pencil compatibility.",
        images: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?q=80&w=600",
          "https://images.unsplash.com/photo-1589739900243-4b52cd9b104e?q=80&w=400"
        ],
        variants: [
          { id: "amz-ipm-64-grey", title: "Space Gray / 64GB / Wi-Fi Only", price: "499.00", sku: "MK7R3LL-A", inventory: 100 },
          { id: "amz-ipm-256-grey", title: "Space Gray / 256GB / Wi-Fi Only", price: "649.00", sku: "MK7T3LL-A", inventory: 45 }
        ],
        specifications: {
          "Processor": "Apple A15 Bionic chip with 64‑bit desktop-class architecture",
          "Liquid Retina Display": "8.3-inch diagonal LED backlit Multi-Touch display with IPS tech",
          "Dimensions": "7.69 in x 5.3 in x 0.25 in",
          "Weight": "0.65 pounds (293 grams)"
        },
        vendor: "Apple Store",
        price: 499.00,
        compare_at_price: 549.00,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://amazon.com/dp/B0CXF2KCSH",
      success: true,
      product: {
        title: "Amazon Kindle Colorsoft Signature Edition (32 GB) – Our first ever color e-reader",
        description: "Read in vivid color with our custom formulated high-contrast Kindle screen. Complete with automatic night warm-light adjusting, and seamless wireless charging.",
        images: "https://images.unsplash.com/photo-1512820790803-83ca734da794?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1512820790803-83ca734da794?q=80&w=600"
        ],
        variants: [
          { id: "amz-k-col-32", title: "Kindle Colorsoft 32GB Metallic Black", price: "279.99", sku: "AMZ-KND-COL-32", inventory: 250 }
        ],
        specifications: {
          "Screen Tech": "Kindle Colorsoft 7\" Display with custom built frontlight array",
          "Storage onboard": "32 GB NVMe flash memory",
          "Battery lifespan": "Up to 8 weeks of continuous reading",
          "Waterproofing rating": "IPX8 (Submersion in water up to 2m for 60 min)"
        },
        vendor: "Amazon LLC",
        price: 279.99,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://amazon.com/dp/B09B8V1S6N",
      success: true,
      product: {
        title: "Logitech MX Master 3S Wireless Performance Mouse, Ergo, 8K DPI Tracking, Quiet Clicks",
        description: "The ultimate developer and designer workflow animal. Introducing silent physical click switches, MagSpeed electromagnetic metal scroll wheel, and fully flexible app settings.",
        images: "https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?q=80&w=600"
        ],
        variants: [
          { id: "logi-mx3s-blk", title: "Grape-infused Black / Standard Mac & PC", price: "99.99", sku: "910-006557", inventory: 400 },
          { id: "logi-mx3s-wht", title: "Pale Grey / Standard Mac & PC", price: "99.99", sku: "910-006558", inventory: 150 }
        ],
        specifications: {
          "Optical Sensor Accuracy": "Dynamic 200 - 8000 DPI (adjustable in tiny increments of 50)",
          "Wireless Range": "10 m (Bluetooth Low Energy / Logi Bolt Receiver)",
          "Rechargeable battery type": "Li-Po (500 mAh) battery serving up to 70 days",
          "Number of buttons": "7 programmable action triggers"
        },
        vendor: "Logitech Store",
        price: 99.99,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://amazon.com/dp/B08Z1VZZ11",
      success: true,
      product: {
        title: "Sony WH-1000XM4 Wireless Premium Noise Canceling Overhead Headphones, Black",
        description: "Industry-leading ambient sound gating. High-fidelity dual-processor audio drivers, speak-to-chat features, and comfortable cushion design.",
        images: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=600"
        ],
        variants: [
          { id: "sony-xm4-blk", title: "Midnight Charcoal Black", price: "248.00", sku: "WH-1000XM4/B", inventory: 150 },
          { id: "sony-xm4-silv", title: "Platinum Satin White", price: "248.00", sku: "WH-1000XM4/S", inventory: 80 }
        ],
        specifications: {
          "Audio chip": "Sony HD Noise Cancelling Processor QN1 with custom bluetooth SoC",
          "Battery lifespan": "Up to 30 Hours (Quick charged: 10 min provides 5 hours)",
          "Dual Connection": "Supports connecting up to 2 devices concurrently",
          "Microphones configuration": "5 physical array for vocal capture clarity"
        },
        vendor: "Sony Electronics",
        price: 248.00,
        compare_at_price: 349.99,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://amazon.com/dp/B0BWGFVS6G",
      success: true,
      product: {
        title: "Anker Nano Power Bank, USB-C Portable Charger 22.5W with Built-in Foldable Plug",
        description: "Pocket-sized ultimate power convenience. Charging uphone/android models fast with integrated folding type-C connector tip and safe high-capacity battery.",
        images: "https://images.unsplash.com/photo-1609592806453-6a968296ec35?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1609592806453-6a968296ec35?q=80&w=600"
        ],
        variants: [
          { id: "ank-nan-blk", title: "Matte Black Powerbank unit", price: "29.99", sku: "A1653H11", inventory: 500 }
        ],
        specifications: {
          "Battery Capacity": "5,000 mAh Li-ion battery",
          "Power Output Rating": "Maximum 22.5W Fast Power Delivery charging",
          "Integrated Connector type": "Built-in Foldable USB-C Male plug",
          "Eco system certifications": "UL Safety, ActiveShield 2.0 temperature monitors"
        },
        vendor: "Anker Direct",
        price: 29.99,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://amazon.com/dp/B0CJM2L5GH",
      success: true,
      product: {
        title: "Bose QuietComfort Wireless Noise Cancelling Headphones, Cypress Green",
        description: "The gold standard of sound fidelity and quiet isolation. Enjoy legendary sound, customized environmental audio filters, and cloud-like custom ear padding.",
        images: "https://images.unsplash.com/photo-1546435770-a3e426bf472b?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1546435770-a3e426bf472b?q=80&w=600"
        ],
        variants: [
          { id: "bose-qc-grn", title: "Cypress Green Special Premium Edition", price: "349.00", sku: "882736-QC-GRN", inventory: 20 }
        ],
        specifications: {
          "Equalizer configuration": "Customizable Bass/Mid/Treble in Bose Music app",
          "Sound Modes": "Quiet Mode, Aware Mode, Wind Gating Filters",
          "Battery capacity": "Up to 24 Hours of constant playback",
          "Connecting profile": "Bluetooth 5.1 range up to 30ft"
        },
        vendor: "Bose Store",
        price: 349.00,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://amazon.com/dp/B09X6G9T82",
      success: true,
      product: {
        title: "SAMSUNG T7 Shield 2TB Portable Solid State Drive – Ruggedized external backup NVMe, Black",
        description: "Tough, high-speed external backup. Built for heavy multi-media raw workloads with USB 3.2 Gen 2 speed, dynamic thermal control, and dust/waterproof casing.",
        images: "https://images.unsplash.com/photo-1597872200969-2b65dff69a8a?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1597872200969-2b65dff69a8a?q=80&w=600"
        ],
        variants: [
          { id: "sam-t7s-2tb-blk", title: "Black / 2TB External Casing", price: "169.99", sku: "MU-PE2T0S-AM", inventory: 120 }
        ],
        specifications: {
          "Transfer Rate Efficiency": "Sequentially reads up to 1,050 MB/s, writes up to 1,000 MB/s",
          "Durability Protection": "IP65 Certified Dust and Water Resistant, fall proof up to 9.8ft",
          "Security Framework": "AES 256-bit hardware encryption file safety locks",
          "Included Cables": "Type-C to Type-C, Type-C to Type-A cables"
        },
        vendor: "SAMSUNG Technology",
        price: 169.99,
        compare_at_price: 199.99,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://amazon.com/dp/B07R4D2M6F",
      success: true,
      product: {
        title: "YETI Rambler 20 oz Travel Tumbler, Stainless Steel Vacuum Sealed with MagSlider Lid",
        description: "Virtually bulletproof steel hydration travel mug. Fits standard car cup holder spaces snugly, preserving heat or ice levels for hours on long trail drives.",
        images: "https://images.unsplash.com/photo-1577937927133-66ef06acdf18?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1577937927133-66ef06acdf18?q=80&w=600"
        ],
        variants: [
          { id: "yeti-rb-20-navy", title: "Navy Blue / 20 oz Standard Size", price: "35.00", sku: "YETI-RMB-20-NAV", inventory: 350 },
          { id: "yeti-rb-20-sea", title: "Seafoam Green / 20 oz Standard Size", price: "35.00", sku: "YETI-RMB-20-SEA", inventory: 155 }
        ],
        specifications: {
          "Wall Configuration": "Double-wall vacuum insulation blocks temperature leaks",
          "Steel spec": "Kitchen-grade 18/8 structural stainless steel core",
          "Dishwasher safe": "Tested and approved for heavy family dishwash cycles",
          "Lid features": "Patented MagSlider magnetic spill-resistant shields"
        },
        vendor: "YETI Products",
        price: 35.00,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://amazon.com/dp/B0BM8DDR3T",
      success: true,
      product: {
        title: "Fitbit Charge 6 Fitness Tracker with Google Wallet, Google Maps, Hearth Rate, GPS",
        description: "The ultimate micro tracker. Supercharge active dynamic exercises with realheart diagnostics, dynamic GPS distance logging, and high-contrast color screen.",
        images: "https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?q=80&w=600"
        ],
        variants: [
          { id: "fb-c6-obs", title: "Obsidian Black / Aluminum Tracker Case", price: "139.95", sku: "FB423BKBK-FRND", inventory: 200 }
        ],
        specifications: {
          "Sensors Array onboard": "Dynamic ECG, EDA scan stress level trackers, Spo2 blood oxygen monitoring",
          "GPS architecture": "Built-in Standalone GPS receiver chip for maps tracking",
          "Battery endurance": "Up to 7 full days of workout log monitoring",
          "Mobile OS compatibility": "iOS 15 or higher, Android 10 or higher"
        },
        vendor: "Fitbit LLC",
        price: 139.95,
        compare_at_price: 159.95,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://amazon.com/dp/B0BZ8FCRF1", // The failure URL
      success: false,
      error: {
        rootCause: "Anti-scraping Cloudflare WAAP shield triggering instant JS-challenge block for headless incoming requests.",
        errorMessage: "Access Denied (403 Forbidden): Security verification has caught suspicious non-interactive browser footprints.",
        recoveryStrategy: "Reroute page metadata requests directly through Amazon's official Selling Partner API (SP-API) or parse JSON-LD embedded data chunks directly from a trusted headful extension helper.",
        fixApplied: "Designed dynamic AI backup rules to bypass pure scraping, returning structured fallback products on raw network fails."
      }
    }
  ],
  AliExpress: [
    {
      url: "https://aliexpress.com/item/1005006093821735.html",
      success: true,
      product: {
        title: "Baseus 100W GaN Charger Type C Fast Charging Station Desktop EU/US Plug",
        description: "High-density charging efficiency. Fully charges laptop and smart device groups at high velocity with multi-port distribution matrix.",
        images: "https://images.unsplash.com/photo-1622445262465-2481c4574875?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1622445262465-2481c4574875?q=80&w=600"
        ],
        variants: [
          { id: "ba-gan-100-eu", title: "100W GaN Station / EU plug and standard USB line", price: "38.90", sku: "BAS-100W-GAN-EU", inventory: 900 },
          { id: "ba-gan-100-us", title: "100W GaN Station / US plug and standard USB line", price: "38.90", sku: "BAS-100W-GAN-US", inventory: 600 }
        ],
        specifications: {
          "Output Interface Power": "2 x USB-C (100W Max), 2 x USB-A (60W Max) concurrent smart balance",
          "Raw Tech Core": "GaN5 (Gallium Nitride Gen 5 semiconductor)",
          "Overheat protection": "BPS II dynamic safety temperature chips",
          "Voltage spectrum compatibility": "AC 100V-240V, 50/60Hz"
        },
        vendor: "Baseus Official Factory Store",
        price: 38.90,
        compare_at_price: 55.00,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://aliexpress.com/item/1005004928172819.html",
      success: true,
      product: {
        title: "Ugreen USB C to USB Type C 100W/60W Charging Cable Nylon Braided, PD Fast Charger Cord",
        description: "Incredibly durable and high-speed fast charging line. Built with tough nylon braiding, aluminum connector sleeves, and smart safe-charging chips.",
        images: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?q=80&w=600"
        ],
        variants: [
          { id: "ugr-c-100w-1m", title: "100W Power Delivery / 1 Meter / Black", price: "5.50", sku: "UGR-C-100W-1M", inventory: 5000 },
          { id: "ugr-c-100w-2m", title: "100W Power Delivery / 2 Meter / Black", price: "7.20", sku: "UGR-C-100W-2M", inventory: 3000 }
        ],
        specifications: {
          "Power Delivery capacity": "Up to 20V / 5A maximum (100W) fast charging support",
          "Data sync velocity": "480 Mbps standard USB 2.0 data transit rate",
          "Braiding materials": "Ultra-tough braided dual nylon yarn coating",
          "Safety microchip": "Smart integrated E-Marker chipset"
        },
        vendor: "Ugreen Direct Retail",
        price: 5.50,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://aliexpress.com/item/1005005829104812.html",
      success: true,
      product: {
        title: "Havit Mechanical Keyboard RGB, Wired Blue Linear Switch, 89-Key CompactLayout",
        description: "Excellent compact mechanical device. High-contrast custom linear switch profiles, gorgeous dynamic customizable light arrays, and durable double-shot caps.",
        images: "https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?q=80&w=600"
        ],
        variants: [
          { id: "hav-kb-blu", title: "89-Key RGB / Blue Linear Switch", price: "29.90", sku: "HAV-KB89-BLU", inventory: 350 }
        ],
        specifications: {
          "Switch feedback": "Tactile Blue Click switches, travel distance 4mm",
          "Cabling solution": "1.5 Meter braided USB-A attached line",
          "Layout configuration": "89-Key space saving mechanical layout (with Numpad)",
          "Keycap material": "Double-shot injection molded wear-resistant ABS caps"
        },
        vendor: "Havit Gaming Factory Outlet",
        price: 29.90,
        compare_at_price: 39.99,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://aliexpress.com/item/1005003928173512.html",
      success: true,
      product: {
        title: "Xiaomi Mi Band 8 Smart Bracelet 1.62\" AMOLED Screen 60Hz Fitness Tracker",
        description: "The world's leading micro health companion. Bright dynamic high-refresh AMOLED touchscreen screen, oxygen heart monitoring, and fast charging.",
        images: "https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?q=80&w=600"
        ],
        variants: [
          { id: "xia-mb8-std", title: "Standard Global Edition / Midnight Black", price: "34.50", sku: "XM-MBND-8-GB", inventory: 1500 }
        ],
        specifications: {
          "Display Matrix Screen": "1.62-inch OLED AMOLED touch, 192 x 490 resolution, 600 nits max",
          "Recreations logs": "Over 150 standard training sport analysis settings",
          "Battery survival metric": "Up to 16 full days typical use per charge round",
          "Bluetooth spec": "BT 5.2 Low Energy protocol"
        },
        vendor: "Xiaomi Smart World",
        price: 34.50,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://aliexpress.com/item/1005004182910398.html",
      success: true,
      product: {
        title: "Anker Soundcore Motion+ Bluetooth Speaker with Hi-Res 30W Audio, BassUp, IPX7 Waterproof",
        description: "Packs rich deep vocals and booming bass. Engineered for exceptional outdoor audio and complete environment weather protection.",
        images: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?q=80&w=600"
        ],
        variants: [
          { id: "s-cor-mp-blk", title: "Soundcore Motion+ 30W Speaker Matte Black", price: "79.99", sku: "ANK-MOT-PLUS", inventory: 180 }
        ],
        specifications: {
          "Fidelity specification": "Certified Hi-Res audio with wider frequency (50 Hz up to 40 kHz)",
          "Amplifier output": "Dual active ultra-high frequency tweeters (30 Watts total output)",
          "Battery life cycle": "Up to 12 hours of uninterrupted party music playback",
          "Water resistance": "Fully IPX7 Waterproof sealed structural core"
        },
        vendor: "Anker Soundcore Factory",
        price: 79.99,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://aliexpress.com/item/1005005102839174.html",
      success: true,
      product: {
        title: "Zelos Vintage Chronograph Watch Mechanical Miyota 9015 Movement Synthetic Leather",
        description: "Classic design combined with contemporary mechanical precision. Built to last with scratch-resistant dome sapphire glass and vintage elements.",
        images: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1524592094714-0f0654e20314?q=80&w=600"
        ],
        variants: [
          { id: "zel-vc-tan", title: "Amber Rosegold Case with Tan Leather Strap", price: "249.00", sku: "ZEL-CHRO-TAN", inventory: 12 }
        ],
        specifications: {
          "Movement caliber model": "Miyota 9015 automatic mechanical mechanism",
          "Clock glass": "Double-curved scratch-proof synthetic sapphire dome glass",
          "Case core composition": "Kitchen-grade 316L Solid Stainless Steel",
          "Waterproof dynamic level": "50 Meters (5 ATM / 165 ft) water resistance rating"
        },
        vendor: "Zelos Flagship Outlet",
        price: 249.00,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://aliexpress.com/item/1005003829173918.html",
      success: true,
      product: {
        title: "Baseus Bowie H1 Wireless Noise Canceling Over-Ear Headphones, 40dB ANC, BT 5.2",
        description: "Active sound filter luxury within smart budget reach. Deep acoustics, dual mics for clear call routing, and massive battery life.",
        images: "https://images.unsplash.com/photo-1613040809024-b4ef7ba99bc3?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1613040809024-b4ef7ba99bc3?q=80&w=600"
        ],
        variants: [
          { id: "ba-bh1-wht", title: "Cream Milky White Casing", price: "45.00", sku: "BAS-BOW-H1-WHT", inventory: 250 },
          { id: "ba-bh1-blk", title: "Obsidian Slate Black Casing", price: "45.00", sku: "BAS-BOW-H1-BLK", inventory: 400 }
        ],
        specifications: {
          "Sound filters": "Hybrid active noise gating level up to 40dB reduction",
          "Continuous play life": "Up to 70 Hours (typical ANC turned off)",
          "Charging Connection": "Standard USB Type-C input (fully charges in 1 hour)",
          "Driver configuration": "40 mm dynamic customized composite drivers"
        },
        vendor: "Baseus Direct Store",
        price: 45.00,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://aliexpress.com/item/1005002910381927.html",
      success: true,
      product: {
        title: "Shengmilo MX02S Mountain Electric Bike, 1000W Folding Fat Tire E-Bike 48V",
        description: "Cross country extreme off-road commuting beast. Massive mechanical torque motor, anti-rupture wider fat tires, and dual lithium battery pack.",
        images: "https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?q=80&w=600"
        ],
        variants: [
          { id: "sm-mx02-17ah", title: "17Ah Single Lithium Battery System", price: "1250.00", sku: "SHENG-MX02S-17", inventory: 40 }
        ],
        specifications: {
          "Motor Propulsion Power": "1000 Watt High-Velocity Brushless Rear Hub Motor",
          "Battery Capacity Pack": "48V / 17Ah Removable Samsung cells Lithium-ion",
          "Tire specifications": "Chaoyang 26\" x 4.0\" All-terrain snow fat tyres",
          "Brake apparatus type": "Front and back Shimano dual hydraulic disc units"
        },
        vendor: "Shengmilo Factory Retailer",
        price: 1250.00,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://aliexpress.com/item/1005005928103811.html",
      success: true,
      product: {
        title: "Lenovo ThinkPlus TH10 Wireless Headphones Stereo HiFi Sound Bluetooth 5.0",
        description: "Incredible value wireless stereo headset. Dynamic full ranges, clean treble response, ergonomic earmuff structures, and dual-cable support.",
        images: "https://images.unsplash.com/photo-1546435770-a3e426bf472b?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1546435770-a3e426bf472b?q=80&w=600"
        ],
        variants: [
          { id: "len-th10-blk", title: "Matte Raven Black Standard", price: "14.90", sku: "LN-TH10-BLK", inventory: 1200 }
        ],
        specifications: {
          "Bluetooth core": "BT 5.0 chip enabling low-latency sound transit",
          "Battery standby capacity": "Up to 10 Hours of constant high volume play",
          "Wired alternative connector": "3.5 mm Aux-in micro-jack port",
          "Speaker diaphragm": "40 mm dynamic horn composite array"
        },
        vendor: "Lenovo ThinkPlus Outlet",
        price: 14.90,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://aliexpress.com/item/1005003182741920.html",
      success: true,
      product: {
        title: "Essager 100W USB C to USB Type C Cable Fast Charging PD Cable",
        description: "Premium nylon-braided Essager 100W rapid USB-C charging cable with LED power display. Charges your MacBook, iPad, and Android phones at native full power.",
        images: "https://images.unsplash.com/photo-1541807084-5c52b6b3adef?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1541807084-5c52b6b3adef?q=80&w=600"
        ],
        variants: [
          { id: "esg-100w-2m", title: "100W Cable / 2 Meters with LED Display", price: "4.99", sku: "ESG-100W-2M-LED", inventory: 8000 }
        ],
        specifications: {
          "Max Power": "100 Watts (20V/5A) Power Delivery 3.0",
          "Cable Length": "2 Meters (6.6 Feet)",
          "Data Transfer Rate": "480 Mbps standard protocol",
          "Material": "Reinforced High-density Nylon Braid"
        },
        vendor: "Essager Official Store",
        price: 4.99,
        currency: "USD",
        availability: true
      },
      error: {
        rootCause: "Anti-bot proxy blockage on AliExpress's mobile-routing edge servers, causing request rejects (412 Precondition Failed).",
        errorMessage: "Resource Exhausted (412 Precondition Failed) due to invalid verification cookies on the mobile gateway interface.",
        recoveryStrategy: "Incorporate rotating residential headers to bypass cookie validation checks on high frequency endpoints.",
        fixApplied: "Configured direct fallback mock bypass, saving the user from hitting repeated rate limits."
      }
    }
  ],
  Alibaba: [
    {
      url: "https://alibaba.com/product-detail/Wholesale-Custom-Logo-100-Cotton-T_160012739812.html",
      success: true,
      product: {
        title: "Wholesale Customizable Brand Logo 100% Combed Cotton Heavyweight Unisex T-Shirt",
        description: "Classic high-density promotional streetwear garments. Fully supports bespoke printing, embroideries, raw dyeing, and sewing branding services.",
        images: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=600"
        ],
        variants: [
          { id: "ali-cs-100", title: "MOQ 100 - Plain T-shirts Bulk Pack", price: "3.20", sku: "ALB-TEE-COT-MOQ100", inventory: 100000 },
          { id: "ali-cs-1000", title: "MOQ 1000 - Plain T-shirts Bulk Pack", price: "2.10", sku: "ALB-TEE-COT-MOQ1000", inventory: 500000 }
        ],
        specifications: {
          "MOQ Threshold": "Exactly 100 Standard Pieces required for custom print orders",
          "Fabric Density metric": "260 GSM Premium Double yarn fine combed cotton",
          "Labeling options": "Supports custom high-fidelity tags woven inside labels",
          "Color Choices Available": "45 Woven plant dye options on-demand"
        },
        vendor: "Zhejiang Crown Textile Manufacturing Ltd.",
        price: 3.20,
        compare_at_price: 5.50,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://alibaba.com/product-detail/Biodegradable-Kraft-Paper-Coffee-Cups-Wholesale_160029381726.html",
      success: true,
      product: {
        title: "Wholesale Biological Compostable Kraft Paper Coffee Cups double wall (1000 Pieces)",
        description: "Commercial catering coffee cups constructed entirely with PLA biological plant-starch oil barriers. High warm retention, leakage proof, and fully degradable.",
        images: "https://images.unsplash.com/photo-1511920170033-f8396924c348?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1511920170033-f8396924c348?q=80&w=600"
        ],
        variants: [
          { id: "alb-cup-12oz-1k", title: "12oz Double-Wall Natural Kraft Cup (MOQ 1000)", price: "0.08", sku: "ALB-KCP-12D-1K", inventory: 1000000 }
        ],
        specifications: {
          "Required Minimum Order (MOQ)": "1,000 Units minimum",
          "Base Paper density": "320 GSM thick Recyclable Kraft paper boards",
          "Thermal isolation capability": "Safe thermal barrier up to 100°C liquid",
          "Health credentials": "FDA clearance certified, zero microplastics safe"
        },
        vendor: "Guangzhou Green Tableware Factory",
        price: 0.08,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://alibaba.com/product-detail/Bulk-Stainless-Steel-Double-Wall-Insulated_160039281736.html",
      success: true,
      product: {
        title: "Bulk Double-Wall Vacuum Insulated Stainless Steel Sports Water Bottle",
        description: "Wholesale customizable premium hydration flasks. Complete with powder-coat finishes, laser logo etching support, and leak-proof steel caps.",
        images: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1602143407151-7111542de6e8?q=80&w=600"
        ],
        variants: [
          { id: "alb-wb-500-500p", title: "500ml Flask / Powder Coated (MOQ 500)", price: "1.85", sku: "ALB-WBT-500-PC", inventory: 50000 }
        ],
        specifications: {
          "Standard MOQ": "500 units per custom color layout",
          "Steel alloy specification": "High grade 18/8 (SUS 304) food-safe steel uppers",
          "Insulation efficiency": "Keeps cold liquid chilled up to 24 hrs, warm for 12 hrs",
          "BPA Toxicity status": "100% BPA and Phthalate chemical free core"
        },
        vendor: "Ningbo Pioneer Hydro-Flask Industry Ltd.",
        price: 1.85,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://alibaba.com/product-detail/Eco-Friendly-Cork-Yoga-Mat-High_160049281729.html",
      success: true,
      product: {
        title: "Wholesale Non-Slip Fine Organic Cork Yoga Mat, Natural Biodegradable TPE Base",
        description: "Premium wholesale fitness studio gear. Made from organic Mediterranean oak bark crumbs, providing incredible sweaty palm grip traction and soft cushioning.",
        images: "https://images.unsplash.com/photo-1592432678016-e910b452f9a2?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1592432678016-e910b452f9a2?q=80&w=600"
        ],
        variants: [
          { id: "alb-ym-6mm-200p", title: "183cm x 61cm x 6mm Cork Mat (MOQ 200)", price: "4.50", sku: "ALB-YG-CG-6MM", inventory: 20000 }
        ],
        specifications: {
          "Studio MOQ": "200 Pieces minimum",
          "Thickness comfort profile": "6 mm density dual-layer composite",
          "Upper surface": "100% Organic natural cork grains",
          "Base pad support": "Eco-friendly elastic lightweight TPE polymer"
        },
        vendor: "Shandong Zen Body Fitness Corp.",
        price: 4.50,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://alibaba.com/product-detail/High-Quality-Recycled-Kraft-Paper-Mailer_160059281710.html",
      success: true,
      product: {
        title: "Recycled Heavyweight Protective Kraft Paper Mailer Envelopes (MOQ 5000)",
        description: "Excellent sustainable post parcel envelopes. Complete with high security self-sealing glue tape and tough double layers to prevent transit tears.",
        images: "https://images.unsplash.com/photo-1512909006721-3d6018887383?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1512909006721-3d6018887383?q=80&w=600"
        ],
        variants: [
          { id: "alb-kpe-a4-5k", title: "A4 Size Paper Mailers / 5000 pcs pack", price: "0.04", sku: "ALB-KME-A4-5K", inventory: 1000000 }
        ],
        specifications: {
          "Bulk MOQ requirement": "5,000 units minimum",
          "Paper weight thickness": "120 GSM thick unbleached raw Kraft fibres",
          "Closing mechanism": "Peel-off self-seal hot-melt tape locks",
          "Eco rating": "100% Compostable post-use breakdown"
        },
        vendor: "Dongguan Star Packing Solutions Co.",
        price: 0.04,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://alibaba.com/product-detail/Wireless-Charge-Desk-Organizer-Leather-Tray_160069281740.html",
      success: true,
      product: {
        title: "Wholesale Multi-Functional PU Leather Desk Organizer Tray with 15W Qi Charging Pad",
        description: "Elegant layout for hotel guest rooms and corporate gift programs. Packs dual organizers and an integrated rapid 15W inductive charge board.",
        images: "https://images.unsplash.com/photo-1513151233558-d860c5398176?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1513151233558-d860c5398176?q=80&w=600"
        ],
        variants: [
          { id: "alb-ot-blk-100", title: "Black Leather Organizer / (MOQ 100)", price: "5.80", sku: "ALB-WOT-BLK-100", inventory: 10000 }
        ],
        specifications: {
          "Minimum order requirement": "100 items per batch run",
          "Charging power specifications": "15 Watt wireless fast QI charging board",
          "Casing material": "Vegan splashproof premium PU leather with velvet base lining",
          "Circuit protection": "Built-in dynamic overcurrent, temperature sensor safety triggers"
        },
        vendor: "Shenzhen Smart-Home Leather Products Ltd.",
        price: 5.80,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://alibaba.com/product-detail/Wholesale-Biodegradable-Bamboo-Toothbrush-Pack_160079281755.html",
      success: true,
      product: {
        title: "Biodegradable Premium Bamboo Toothbrush, Soft Nylon Bristles Wholesale (MOQ 10k0)",
        description: "High volume eco toiletries. Organic sustainably grown bamboo timber handles heat-treated for waterproof mold defense, fitted with thin bristles.",
        images: "https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?q=80&w=600"
        ],
        variants: [
          { id: "alb-bt-soft-10k", title: "Standard Adult Size / Soft Bristles (MOQ 10,000)", price: "0.12", sku: "ALB-TOOTH-BAM-10K", inventory: 4000000 }
        ],
        specifications: {
          "Moq bulk scale": "10,000 single items Minimum",
          "Raw Handle species": "100% Ecological biodegradable Moso Bamboo tree branches",
          "Bristle specs": "BPA-Free premium soft DuPont raw nylon fibers",
          "Package style": "Individually packed in plain unbleached white Kraft cartons"
        },
        vendor: "Yiwu Organic Care Products LLC",
        price: 0.12,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://alibaba.com/product-detail/Portable-Electric-Juicer-Blender-Personal-Size_160089281768.html",
      success: true,
      product: {
        title: "Wholesale Rechargeable Portable USB Juicer Blender Bottle 400ml Travel Size",
        description: "Splendid product for dynamic e-commerce dropshipping stores. Lightweight, equipped with a 6-blade high-speed cutter head, and dual rechargeable batteries.",
        images: "https://images.unsplash.com/photo-1578859318509-62790a079366?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1578859318509-62790a079366?q=80&w=600"
        ],
        variants: [
          { id: "alb-pj-std-500p", title: "400ml Blender / standard USB (MOQ 500)", price: "4.20", sku: "ALB-BLEND-USB-500", inventory: 15000 }
        ],
        specifications: {
          "Client MOQ": "500 units minimum packaging support",
          "Cutter Blade layout": "6-dimensional 3D surgical grade stainless steel sheets",
          "Motor speed metric": "22,000 RPM high-speed rotational power",
          "Battery capacity stats": "Dual lithium cells 1200mAh (completes 15 blend runs)"
        },
        vendor: "Zhongshan Electrical Home Appliances Factory",
        price: 4.20,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://alibaba.com/product-detail/Custom-Rigid-Cardboard-Gift-Box-With_160099281781.html",
      success: true,
      product: {
        title: "Custom Rigid Cardboard Luxury Gift Box with Magnetic Flap closures Wholesale",
        description: "Elevate your product unpack experience. Flat pack rigid box constructions fitted with high power magnetic edge catch flaps.",
        images: "https://images.unsplash.com/photo-1512909006721-3d6018887383?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1512909006721-3d6018887383?q=80&w=600"
        ],
        variants: [
          { id: "alb-gfb-mag-1k", title: "Rigid Box 20x15x5cm / Matte (MOQ 1000)", price: "0.65", sku: "ALB-GBX-MAG-1K", inventory: 250000 }
        ],
        specifications: {
          "Client MOQ runs": "1,000 items minimum order size",
          "Cardboard density thickness": "1200 GSM thick industrial rigid grey board cores",
          "Lamination options": "Matte finish or high gloss transparent protective layering",
          "Logo printing technology": "Dynamic CMYK print, hot gold stamp embossing available"
        },
        vendor: "Xiamen Luxury Paper Products Manufacturing Ltd.",
        price: 0.65,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://alibaba.com/product-detail/Wholesale-Linen-Dustproof-Desktop-Table-Cloth_160109281792.html",
      success: true,
      product: {
        title: "Wholesale Linen Dustproof Desktop Rectangle Table Cloth (MOQ 100)",
        description: "Excellent high-density dustproof table runners constructed with pure Mediterranean raw flax fibers. Perfect for standard family dining tables, events, and cafe seating.",
        images: "https://images.unsplash.com/photo-1544816155-12df9643f363?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1544816155-12df9643f363?q=80&w=600"
        ],
        variants: [
          { id: "alb-tc-140-100p", title: "140 x 180cm Beige Tablecloth (MOQ 100)", price: "2.40", sku: "ALB-TAB-LN-140", inventory: 30000 }
        ],
        specifications: {
          "Client MOQ standards": "100 units per custom size profile",
          "Material Composition": "80% Organic Linen, 20% Durable Cotton fiber blend",
          "Water Resistance index": "Splatter-proof surface treated against liquid marks",
          "Washability": "Machine washable on low temp gentle cycle"
        },
        vendor: "Shaoxing Textile Trading Factory",
        price: 2.40,
        currency: "USD",
        availability: true
      },
      error: {
        rootCause: "Wholesale scale price calculation triggers multiple asynchronous sub-queries on Alibaba bulk endpoints.",
        errorMessage: "Deduction Mismatch (422 Unprocessable Entity): Extracted raw price array returned empty due to multi-tiered currency converter exceptions.",
        recoveryStrategy: "Normalize pricing records by referencing individual base values directly inside table rows.",
        fixApplied: "Wrote robust regex checks to secure pricing patterns, successfully keeping catalog transactions alive."
      }
    }
  ],
  eBay: [
    {
      url: "https://ebay.com/itm/382719283719",
      success: true,
      product: {
        title: "Apple iPhone 15 Pro - 256GB - Space Black (Unlocked) - Certified Refurbished",
        description: "Excellent refurbished condition certified iPad / iPhone. Restored to 100% factory specifications, packed with high health battery, and complete with a 1-year warranty.",
        images: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=600"
        ],
        variants: [
          { id: "eb-ip15p-256", title: "Unlocked / Excellent Refurbished Grade A+", price: "749.00", sku: "EB-IP15P-256-BLK", inventory: 45 }
        ],
        specifications: {
          "Commercial Condition": "Refurbished - Certified Excellent (Pristine zero scrapes)",
          "Network Carrier Lock": "Unlocked (Tested compatible with T-Mobile, AT&T and Verizon)",
          "Battery Capacity Diagnostic": "Guaranteed minimum 85% maximum health standard",
          "Included accessories": "Premium Nylon braided charging cable, generic durable box"
        },
        vendor: "Cellular Recommerce Outlet Store-99",
        price: 749.00,
        compare_at_price: 899.00,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://ebay.com/itm/192837198273",
      success: true,
      product: {
        title: "Retro Nintendo Game Boy Advance GBA - Custom Backlit IPS Screen (Classic Glacier Blue)",
        description: "Legendary childhood gaming. Restored with custom shell casing, premium brand-new buttons, and super bright high-contrast IPS backlit display.",
        images: "https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1531525645387-7f14be1bdbbd?q=80&w=600"
        ],
        variants: [
          { id: "eb-gba-glac", title: "Glacier Blue GBA Retro Console", price: "165.00", sku: "EB-GBA-IPS-GLAC", inventory: 10 }
        ],
        specifications: {
          "Condition type": "Custom Refurbished (original logic board, new secondary parts)",
          "Screen Technology": "FunnyPlaying V2 3.2\" high-contrast backlit IPS screen (with 10 brightness levels)",
          "Sound Amplifier card": "Includes low-noise custom audio speaker filters for maximum vocal play",
          "Power requirements": "2 x Standard AA batteries (not included inside carton)"
        },
        vendor: "Vintage Console Restoration Corp.",
        price: 165.00,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://ebay.com/itm/239182731920",
      success: true,
      product: {
        title: "Sony PlayStation 5 Slim Digital Edition Console -- Brand New",
        description: "Experience lightning fast loading with an ultra-high speed SSD, deeper immersion with support for haptic feedback, adaptive triggers, and 3D Audio.",
        images: "https://images.unsplash.com/photo-1606813907291-d86efa9b94db?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1606813907291-d86efa9b94db?q=80&w=600"
        ],
        variants: [
          { id: "eb-ps5s-dig", title: "PS5 Slim Digital / 1TB SSD Core System", price: "399.99", sku: "98273-PS5SD", inventory: 80 }
        ],
        specifications: {
          "Condition": "Brand New Factory Sealed",
          "Solid State Disk size": "1 TB Custom ultra-fast PCIe Gen 4 SSD",
          "Average Frame rate output": "Supports 4K UHD 120Hz gaming output",
          "Included accessories": "DualSense Wireless Controller, HDMI visual hook cable"
        },
        vendor: "Nationwide-Distributors-Direct",
        price: 399.99,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://ebay.com/itm/302918371291",
      success: true,
      product: {
        title: "Used Canon EOS 5D Mark IV 30.4MP Digital SLR Camera - Body Only",
        description: "Excellent used condition raw photography workhorse. Tested carefully by camera experts, clean sensor array, low shutter count, original box.",
        images: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?q=80&w=600"
        ],
        variants: [
          { id: "eb-can-5d4", title: "Canon 5D Mk4 (Body Only / Shutter count 22k)", price: "1199.00", sku: "EB-CAN-5D4-BODY", inventory: 3 }
        ],
        specifications: {
          "Conditions stats": "Pre-owned - Very Good condition (showing minimal surface paint scuffs)",
          "Camera Sensor details": "30.4 Megapixel Full-Frame CMOS sensor with dual pixel focus",
          "Maximum video quality": "4K Motion JPEG video recording at up to 30p speed",
          "Total Shutter actuations count": "22,140 clicks registered"
        },
        vendor: "Camera-Exchange-Warehouse",
        price: 1199.00,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://ebay.com/itm/112983719827",
      success: true,
      product: {
        title: "Charizard Base Set Shadowless 4/102 Pokemon Foil TCG Card holo holographic",
        description: "Extremely rare iconic childhood Pokemon Card. Shadowless card design, beautiful shine holographic. Preserved safely inside standard optical grading case.",
        images: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=600"
        ],
        variants: [
          { id: "eb-chz-shl", title: "Pokemon Base Shadowless Charizard holo card", price: "2850.00", sku: "EB-PKM-SHL-CZARD", inventory: 1 }
        ],
        specifications: {
          "Exact Card Identification": "Base Set 4/102 Holo Rare Charizard Shadowless Edition",
          "TCG Condition": "Near Mint / Lightly Played grade condition",
          "Grading Authority agency": "PSA Authenticated raw foil inspection block",
          "Rarity scale": "Ultra-rare collectible"
        },
        vendor: "Collector-Goldmine-USA",
        price: 2850.00,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://ebay.com/itm/402819283719",
      success: true,
      product: {
        title: "Vintage Levi's 501 Button-Fly Raw Indigo Denim Jeans (W32 x L30) -- Pre-Owned",
        description: "Classic raw selvage denim jeans made with durable unwashed cotton denim. Thick comfortable fabric, custom stitching details, leather patch.",
        images: "https://images.unsplash.com/photo-1542272604-787c3835535d?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1542272604-787c3835535d?q=80&w=600"
        ],
        variants: [
          { id: "eb-levi-w32", title: "Vintage Indigo / W32 L30 Slim fit", price: "48.00", sku: "EB-LVI-501-W32", inventory: 5 }
        ],
        specifications: {
          "Condition rating": "Pre-owned - Good (beautiful faded whiskers and vintage look)",
          "Exact waist/inseam size": "Measured Waist size: 32 in, Inseam length: 30 in",
          "Manufacture era": "Late 1990s vintage collectors run",
          "Fabric Density composition": "Heavyweight 14 oz raw unwashed rigid selvage cotton denim"
        },
        vendor: "Americana-Vintage-Vault",
        price: 48.00,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://ebay.com/itm/182938172938",
      success: true,
      product: {
        title: "Bose QuietComfort 45 Over-Ear Headphones - Certified Refurbished",
        description: "Excellent certified refurbished audio companion. Packs world-famous active sound damping, crisp vocals, bluetooth 5.1 and luxury comfort skin pads.",
        images: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=600"
        ],
        variants: [
          { id: "eb-bose-qc45-blk", title: "Certified Excellent / Matte Triple Black", price: "189.00", sku: "EB-BOSE-QC45-RCT", inventory: 30 }
        ],
        specifications: {
          "Inspected Condition": "Refurbished - Certified Excellent (zero scrapes, 100% sound performance)",
          "Active Sound damping modes": "Quiet Mode, Aware surrounding pass-through filters",
          "Battery survival metric": "Up to 22 Hours of constant bluetooth streaming",
          "Retailer Protection": "Standard 2-Year warranty via Allstate"
        },
        vendor: "Bose-Certified-Recommerce-Store",
        price: 189.00,
        compare_at_price: 279.00,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://ebay.com/itm/122938173910",
      success: true,
      product: {
        title: "Seiko 5 Sport Automatic Wristwatch 21-Jewel Blue Dial (7S26-02J0) -- Serviced",
        description: "Classic high-end mechanical timepiece. Authentic Seiko automatic caliber with clean metal finishes, day-date window, and blue dial.",
        images: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1524592094714-0f0654e20314?q=80&w=600"
        ],
        variants: [
          { id: "eb-sk5-blu", title: "Satin Brushed steel with Blue Watch Dial face", price: "115.00", sku: "EB-SEI-SK5-BLU", inventory: 2 }
        ],
        specifications: {
          "Condition level": "Slightly used (Fully cleaned, running, and keeping accurate time)",
          "Acoustic Mechanical movement": "Seiko 7S26 automatic self-winding movement (21 rubies)",
          "Back Case window": "See-through hardlex exhibition glass panel",
          "Steel composition rating": "Solid 316L high corrosion resistant stainless steel"
        },
        vendor: "Tokyo-Timepiece-Exchange",
        price: 115.00,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://ebay.com/itm/142918371928",
      success: true,
      product: {
        title: "TaylorMade Stealth 2 Driver 10.5* Regular Flex Carbon-Fiber Club -- Preowned",
        description: "A gorgeous golf driver built with an advanced carbon face. Delivers super-high ball speed energy and excellent launch profiles on off-center drives.",
        images: "https://images.unsplash.com/photo-1535131749006-b7f58c99034b?q=80&w=600",
        gallery: [
          "https://images.unsplash.com/photo-1535131749006-b7f58c99034b?q=80&w=600"
        ],
        variants: [
          { id: "eb-tm-st2-drv", title: "Stealth 2 Driver 10.5° / Fujikura Ventus shaft", price: "299.00", sku: "EB-TM-STL2-DRV", inventory: 4 }
        ],
        specifications: {
          "Preowned Condition rating": "Used - Very Good condition (showing normal clean turf scuffs)",
          "Loft configuration angle": "10.5 Degrees adjustable loft sleeve",
          "Club shaft material": "Fujikura Ventus Red TR 5 graphite regular flex",
          "Head volume capacity": "460cc high aerodynamics composite head"
        },
        vendor: "Global-Golf-Liquidators",
        price: 299.00,
        compare_at_price: 549.00,
        currency: "USD",
        availability: true
      }
    },
    {
      url: "https://ebay.com/itm/202938174928", // The failure URL
      success: false,
      error: {
        rootCause: "Heavy anti-scalp scrape defense systems block standard headless HTTP requests routed from server containers.",
        errorMessage: "Network Tunnel Warning (503 Service Unavailable): The server rejected requests because no authenticated browser headers exist.",
        recoveryStrategy: "Initialize dynamic browser rendering (e.g. Playwright or Puppeteer) to spoof genuine browser interactions.",
        fixApplied: "Wrote robust AI backup rules to provide elegant fallback outcomes on raw network blocks."
      }
    }
  ]
};
