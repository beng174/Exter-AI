import { hydrateAd } from "../shared/ad-records.js";
import type { Ad, Brand, Category, Creator, Review } from "../shared/types.js";

export const CATEGORIES: Category[] = [
  "Beauty & skincare",
  "Fashion",
  "Wellness",
  "Food & beverage",
  "Home fragrance & gifting",
];
export const PLATFORM_NAMES = ["Meta", "TikTok", "Google"] as const;
export const CONTENT_PLATFORMS = [
  "Meta",
  "TikTok",
  "Google",
  "Instagram",
  "Facebook",
  "LinkedIn",
  "X",
  "YouTube",
] as const;
const palettes = ["#dc8c9f", "#837ab7", "#8caa80", "#d6a84a"];
const workspaces = [
  {
    id: "rhode",
    name: "Rhode",
    domain: "rhodeskin.com",
    competitors: ["Glossier", "Summer Fridays", "The Ordinary"],
    voice: ["Minimal", "Approachable", "Skin-first"],
  },
  {
    id: "aritzia",
    name: "Aritzia",
    domain: "aritzia.com",
    competitors: ["COS", "Reformation", "Everlane"],
    voice: ["Confident", "Considered", "Modern"],
  },
  {
    id: "ritual",
    name: "Ritual",
    domain: "ritual.com",
    competitors: ["AG1", "Seed", "HUM Nutrition"],
    voice: ["Transparent", "Evidence-led", "Optimistic"],
  },
  {
    id: "olipop",
    name: "OLIPOP",
    domain: "drinkolipop.com",
    competitors: ["Poppi", "Culture Pop", "Health-Ade"],
    voice: ["Playful", "Nostalgic", "Feel-good"],
  },
];
export const ANGLES = [
  "Everyday rituals",
  "Real results",
  "Ingredient spotlight",
  "Creator-led stories",
  "Community proof",
  "Limited drop",
];
const audiences = [
  [
    "Skincare minimalists",
    "Ingredient-conscious shoppers",
    "Beauty explorers",
    "Gen Z trendsetters",
  ],
  [
    "Everyday minimalists",
    "Conscious shoppers",
    "Workwear refreshers",
    "Style explorers",
  ],
  [
    "Wellness beginners",
    "Ingredient-conscious shoppers",
    "Routine builders",
    "Active lifestyles",
  ],
  [
    "Mindful snackers",
    "Better-for-you shoppers",
    "Flavour explorers",
    "Active lifestyles",
  ],
];
const photos = [
  [
    "photo-1608571423902-eed4a5ad8108",
    "photo-1556229010-6c3f2c9ca5f8",
    "photo-1556228578-0d85b1a4d571",
    "photo-1571781926291-c477ebfd024b",
  ],
  [
    "photo-1483985988355-763728e1935b",
    "photo-1485230895905-ec40ba36b9bc",
    "photo-1445205170230-053b83016050",
    "photo-1483985988355-763728e1935b",
  ],
  [
    "photo-1544367567-0f2fcb009e0b",
    "photo-1518611012118-696072aa579a",
    "photo-1506126613408-eca07ce68773",
    "photo-1544367567-0f2fcb009e0b",
  ],
  [
    "photo-1544145945-f90425340c7e",
    "photo-1513558161293-cdaf765edfd7",
    "photo-1534353473418-4cfa6c56fd38",
    "photo-1544145945-f90425340c7e",
  ],
];
export const imageUrl = (photo: string) =>
  `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=700&q=80`;
export function seedData(now = new Date()): {
  brands: Brand[];
  ads: Ad[];
  creators: Creator[];
  reviews: Review[];
} {
  const brands: Brand[] = workspaces.map((w, i) => ({
    ...w,
    category: CATEGORIES[i],
    color: palettes[i],
    initials: w.name.slice(0, 1),
    mode: "demo",
    createdAt: now.toISOString(),
  }));
  const ads: Ad[] = [];
  for (const [ci, brand] of brands.entries()) {
    const names = [brand.name, ...brand.competitors];
    for (let i = 0; i < 600; i++) {
      const owner = i % 4;
      const angleIndex = Math.floor(i / 4) % ANGLES.length;
      const date = new Date(
        now.getTime() - ((i * 13) % 88) * 86400000 - (i % 20) * 60000,
      );
      const impressions = 4500 + ((i * 1931 + ci * 3197) % 250000);
      const engagementRate =
        1.1 + ((i * 17) % 46) / 10 + (angleIndex === 0 ? 1.4 : 0);
      const owned = owner === 0;
      const spend = owned ? Math.round(impressions * 0.013) : null;
      const conversions = owned
        ? Math.floor(impressions * (0.0007 + angleIndex * 0.00003))
        : null;
      ads.push({
        id: `sample-${brand.id}-${i}`,
        brandId: brand.id,
        brand: names[owner],
        platform: PLATFORM_NAMES[Math.floor(i / 4) % 3],
        category: brand.category,
        title: [
          `Your everyday, elevated.`,
          `The proof is in the ritual.`,
          `Good things start here.`,
          `Meet your new daily essential.`,
        ][owner],
        copy: `${names[owner]} — ${ANGLES[angleIndex].toLowerCase()}. A little moment that makes your day. This is fictional sample creative for exploring Exter.`,
        angle: ANGLES[angleIndex],
        audience: audiences[ci][Math.floor(i / 16) % 4],
        format: ["Video", "Carousel", "Image"][Math.floor(i / 12) % 3],
        image: `/images/ad-${
          [
            [1, 2, 3, 4],
            [5, 6, 5, 6],
            [7, 7, 7, 7],
            [8, 8, 8, 8],
          ][ci][owner]
        }.jpg`,
        color: palettes[(ci + owner) % 4],
        active: i % 7 !== 0,
        publishedAt: date.toISOString(),
        impressions,
        engagements: Math.round((impressions * engagementRate) / 100),
        spend,
        conversions,
        revenue: conversions === null ? null : conversions * (28 + ci * 8),
        owned,
        source: "sample",
        contentSource: i % 3 === 0 ? "organic" : "paid",
        sourceUrl: null,
      });
    }
  }
  const creatorNames = [
    [
      "Maya Chen",
      "@mayashelf",
      "New York, US",
      "photo-1534528741775-53994a69daeb",
    ],
    [
      "Sophie Williams",
      "@sophieskin",
      "London, UK",
      "photo-1524504388940-b1c1722653e1",
    ],
    [
      "Amara Jones",
      "@amarastyled",
      "London, UK",
      "photo-1531123897727-8f129e1688ce",
    ],
    [
      "Luca Martin",
      "@lucawears",
      "Paris, FR",
      "photo-1506794778202-cad84cf45f1d",
    ],
    [
      "Alex Rivera",
      "@alexinbalance",
      "Los Angeles, US",
      "photo-1500648767791-00dcc994a43e",
    ],
    [
      "Nia Brooks",
      "@wellwithnia",
      "New York, US",
      "photo-1534528741775-53994a69daeb",
    ],
    [
      "Emma Park",
      "@emmastastes",
      "Austin, US",
      "photo-1524504388940-b1c1722653e1",
    ],
    [
      "Jamie Reed",
      "@jamiesgoodthings",
      "London, UK",
      "photo-1506794778202-cad84cf45f1d",
    ],
  ];
  const creators: Creator[] = creatorNames.map((c, i) => {
    const ci = Math.floor(i / 2);
    return {
      id: `creator-${i}`,
      name: c[0],
      handle: c[1],
      category: CATEGORIES[ci],
      platforms: i % 2 ? ["Meta"] : ["TikTok", "Meta"],
      followers: 48000 + i * 17000,
      engagementRate: 4.8 + (i % 3) * 0.7,
      audience: audiences[ci][i % 4],
      voice: workspaces[ci].voice.slice(0, 2),
      match: 96 - (i % 2) * 7,
      image: `/images/creator-${i + 1}.jpg`,
      color: palettes[ci],
      location: c[2],
      reason: `Sample match based on shared ${CATEGORIES[ci].toLowerCase()} category and ${workspaces[ci].voice[0].toLowerCase()} tone. Audience and performance figures are fictional.`,
    };
  });
  const reviewTexts = [
    [
      "So easy to make part of my everyday routine. I keep coming back.",
      "Daily ritual",
      5,
    ],
    [
      "The ingredients and clear product story made me try this.",
      "Transparency",
      5,
    ],
    [
      "Love the experience, but the price is a little high for me.",
      "Price & value",
      3,
    ],
    [
      "I heard about this from a creator and it lived up to the recommendation.",
      "Creator trust",
      5,
    ],
    [
      "Delivery took longer than expected. The product itself is good.",
      "Delivery",
      2,
    ],
  ] as const;
  const reviews: Review[] = brands.flatMap((brand) =>
    reviewTexts.map((r, i) => ({
      id: `review-${brand.id}-${i}`,
      brandId: brand.id,
      author: ["Alex M.", "Sam T.", "Jordan K.", "Charlie W.", "Taylor R."][i],
      rating: r[2],
      text: r[0],
      theme: r[1],
      sentiment:
        r[2] > 3
          ? ("positive" as const)
          : r[2] === 3
            ? ("neutral" as const)
            : ("negative" as const),
      source: "Fictional sample review",
    })),
  );
  return { brands, ads: ads.map(hydrateAd), creators, reviews };
}
