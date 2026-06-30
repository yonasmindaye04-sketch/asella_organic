export interface CarouselProduct {
  id: number;
  name: string;
  tag: string;
  desc: string;
  icon: string;
  bgFrom: string;
  bgTo: string;
  /** Replace with your actual image path e.g. '/images/myrrh-oil.jpg' */
  image?: string;
  slug: string;
  price?: number;
}

export const carouselProducts: CarouselProduct[] = [
  {
    id: 1,
    name: "Kerebe (Myrrh) Oil",
    tag: "Skin & Wellness",
    desc: "Soothing and skin-supporting properties with a calming traditional aroma. 30ml.",
    icon: "🌿",
    bgFrom: "#c8960a",
    bgTo: "#6b3a08",
    slug: "kerebe-myrrh-oil",
  },
  {
    id: 2,
    name: "Moringa Powder",
    tag: "Immunity & Energy",
    desc: "Rich in antioxidants, vitamins, and minerals to support a healthy lifestyle.",
    icon: "🍃",
    bgFrom: "#2d7a50",
    bgTo: "#123820",
    slug: "moringa-powder",
  },
  {
    id: 3,
    name: "Black Seed Oil",
    tag: "Anti-inflammatory",
    desc: "Cold-pressed Nigella sativa, prized for centuries for its powerful healing properties.",
    icon: "🌑",
    bgFrom: "#5a4080",
    bgTo: "#1a0830",
    slug: "black-seed-oil",
  },
  {
    id: 4,
    name: "Turmeric Capsules",
    tag: "Joint & Gut Health",
    desc: "High-curcumin Ethiopian turmeric to support inflammation response and digestion.",
    icon: "💛",
    bgFrom: "#e08020",
    bgTo: "#7a2808",
    slug: "turmeric-capsules",
  },
  {
    id: 5,
    name: "Honey & Propolis",
    tag: "Natural Antibiotic",
    desc: "Raw Ethiopian forest honey with propolis for immune and wound support.",
    icon: "🍯",
    bgFrom: "#d4a020",
    bgTo: "#6a3800",
    slug: "honey-propolis",
  },
];
