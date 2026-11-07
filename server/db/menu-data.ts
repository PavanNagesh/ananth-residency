/**
 * Ananth Residency delivery menu, transcribed from the printed menu (four pages, prices in rupees).
 * Lines printed as "A / B / C" at one price are split into separate dishes so each one
 * has its own on/off switch and can be searched by name.
 * Presets: B = Breakfast, L = Lunch, D = Dinner.
 */
export type SeedItem = {
  name: string;
  price: number;
  description?: string;
  variants?: { name: string; price: number }[];
  presets?: string; // e.g. "BLD"
};
export type SeedCategory = { name: string; note?: string; presets: string; items: SeedItem[] };

const withButter = (price: number) => [
  { name: "Plain", price },
  { name: "With butter", price: price + 15 },
];

const each = (names: string[], price: number, extra: Partial<SeedItem> = {}): SeedItem[] =>
  names.map((name) => ({ name, price, ...extra }));

export const MENU: SeedCategory[] = [
  {
    name: "Lunch Thali",
    note: "Served 11:30 am to 3:30 pm. No thali on Sundays.",
    presets: "L",
    items: [
      { name: "South Indian Thali", price: 220 },
      { name: "North Indian Thali", price: 260 },
    ],
  },
  {
    name: "Soups",
    presets: "LD",
    items: [
      ...each(["Tomato Soup", "Veg Clear Soup", "Veg Manchow Soup", "Hot & Sour Soup", "Sweet Corn Soup", "Palak Soup"], 180),
      { name: "Cream of Veg Soup", price: 150 },
      ...each(["Cream of Mushroom Soup", "Noodle Soup", "Lemon Coriander Soup"], 180),
      { name: "Tiranga Soup", price: 190 },
    ],
  },
  {
    name: "Starters",
    presets: "LD",
    items: [
      { name: "Finger Chips", price: 150 },
      { name: "Aloo Chaat", price: 170 },
      ...each(["Hara Bhara Kabab", "Veg Seekh Kabab"], 230),
      ...each(["Mushroom Tikka", "Paneer Tikka", "Paneer Seekh Kabab"], 275),
      ...each(["Paneer Cheese Seekh Kabab", "Paneer Malwani Tikka", "Paneer Malai Kabab"], 325),
      { name: "Paneer Roast Tikka", price: 290 },
      { name: "Paneer Peshwari Tikka", price: 325 },
      { name: "Paneer Maqmali Kabab", price: 360 },
      { name: "Cheese Cherry Pineapple", price: 230 },
    ],
  },
  {
    name: "Chinese Starters",
    presets: "LD",
    items: [
      ...each(["Veg Manchurian", "Gobi Manchurian", "Gobi Chilly", "Crispy Vegetables"], 230),
      ...each(["Paneer Manchurian", "Paneer Chilly"], 280),
      ...each(["Babycorn Manchurian", "Babycorn Chilly", "Mushroom Manchurian", "Mushroom Chilly"], 265),
      ...each(["Paneer Hong Kong", "Paneer Dry Red Chilly Schezwan", "Paneer Schezwan (Dry)"], 280),
      ...each(["Veg Spring Rolls", "Crispy Honey Vegetables"], 240),
      ...each(["Veg Schezwan Finger", "Veg Lollipop"], 250),
      ...each(["Veg Bullet", "Veg Delight", "Veg Gold Coin"], 265),
      ...each(["Paneer Satay", "Paneer Thread"], 300),
    ],
  },
  {
    name: "North Indian Curries",
    note: "From the Sabzi Mandi.",
    presets: "LD",
    items: [
      ...each(["Aloo Gobhi", "Aloo Matar", "Aloo Palak", "Aloo Baingan", "Jeera Aloo", "Aloo Methi", "Aloo Shimla"], 240, { presets: "BLD" }),
      ...each(["Baingan Masala", "Baingan Bhartha"], 240),
      { name: "Babycorn Masala", price: 265 },
      ...each(["Bhendi Masala", "Bhendi Fry"], 240),
      { name: "Bhendi Oil Fry", price: 230 },
      { name: "Bhendi Illahabadi", price: 280 },
      { name: "Chana Masala", price: 240, presets: "BLD" },
      { name: "Chana Bathura", price: 275, presets: "BLD" },
      { name: "Capsicum Masala", price: 240 },
      ...each(["Dum Aloo Punjabi", "Dum Aloo Kashmiri"], 265),
      { name: "Green Peas Masala", price: 240 },
      ...each(["Special Veg", "Candle Special"], 300),
      ...each(["Kaju Masala", "Kaju Kurma", "Kaju Handi", "Kaju Kadai"], 300),
      ...each(["Methi Matar", "Methi Malai", "Methi Masala"], 275),
      ...each(["Mushroom Masala", "Mushroom Matar"], 270),
      { name: "Mushroom Paneer Masala", price: 300 },
      ...each(["Mushroom Kadai", "Mushroom Handi", "Mushroom Mayuri"], 290),
      ...each(["Malai Kofta", "Navaratna Kurma"], 275),
      { name: "Nargis Kofta", price: 325 },
      { name: "Palak Matar", price: 240 },
      { name: "Palak Paneer", price: 300 },
      ...each(["Paneer Matar", "Paneer Makhanwala"], 300),
      ...each(
        ["Paneer Butter Masala", "Paneer Tikka Masala", "Paneer Bhurji", "Paneer Tawa Masala", "Paneer Kadai", "Paneer Handi"],
        290,
      ),
      ...each(["Paneer Lajawab", "Paneer Chamcham", "Paneer Pasanda", "Paneer Lababdar"], 290),
      { name: "Residency Special Veg", price: 300, description: "The house speciality." },
      ...each(["Stuffed Tomato", "Stuffed Capsicum"], 250),
      ...each(["Veg Kadai", "Veg Handi", "Veg Kurma", "Veg Kofta", "Veg Tawa"], 250),
      ...each(["Veg Chilli Milli", "Veg Hariyali", "Veg Bhuna", "Veg Koliwada"], 250),
      ...each(["Veg Jaipuri", "Veg Makhanwala", "Veg Kolhapuri", "Veg Hyderabadi"], 250),
      ...each(["Veg Shiwani", "Veg Nawabi", "Veg Maharaja", "Veg Lahori", "Veg Gulegulzar"], 280),
      ...each(["Veg Asmani Kurma", "Veg Chandani", "Veg Anarkali", "Veg Afghani"], 280),
      ...each(["Veg Patiyala", "Veg Sapna", "Veg Tiranga"], 300),
    ],
  },
  {
    name: "Dal",
    presets: "BLD",
    items: [
      { name: "Dal Fry", price: 170 },
      { name: "Dal Tadka", price: 190 },
      ...each(["Dal Kolhapuri", "Dal Palak", "Dal Methi", "Dal Adraki", "Dal Makhani", "Dal Kadai"], 205, { presets: "LD" }),
    ],
  },
  {
    name: "Indian Breads",
    note: "Extra butter ₹15.",
    presets: "BLD",
    items: [
      { name: "Roti", price: 50, variants: withButter(50) },
      { name: "Paratha", price: 60, variants: withButter(60) },
      { name: "Kulcha", price: 60, variants: withButter(60) },
      { name: "Naan", price: 60, variants: withButter(60) },
      { name: "Garlic Naan", price: 100, variants: withButter(100) },
      { name: "Aloo Paratha", price: 100, variants: withButter(100) },
      { name: "Garlic Cheese Naan", price: 135 },
      { name: "Missi Roti", price: 70, variants: withButter(70) },
      ...each(["Paneer Stuffed Paratha", "Cheese Stuffed Paratha"], 150),
      { name: "Stuffed Paratha", price: 110 },
      { name: "Pudina Paratha", price: 100, variants: withButter(100) },
      { name: "Methi Paratha", price: 100, variants: withButter(100) },
      { name: "Cheese Naan", price: 120 },
      { name: "Roti Basket (Tokri)", price: 350, presets: "LD", description: "An assortment of breads." },
      { name: "Chapati", price: 35, variants: withButter(35) },
      { name: "Phulka", price: 30, variants: withButter(30) },
      { name: "Roomali Roti", price: 120, presets: "LD" },
    ],
  },
  {
    name: "Rice & Biryani",
    presets: "LD",
    items: [
      ...each(["Veg Pulao", "Green Peas Pulao"], 220),
      { name: "Kashmiri Pulao", price: 250 },
      ...each(["Cheese Pulao", "Paneer Pulao"], 265),
      { name: "Veg Biryani", price: 230 },
      ...each(["Dum Biryani", "Hyderabadi Biryani", "Paneer Biryani"], 240),
      ...each(["Jeera Rice", "Lemon Rice"], 205, { presets: "BLD" }),
      { name: "Ghee Rice", price: 230 },
      { name: "Steam Rice", price: 180 },
      { name: "Plain Rice", price: 145 },
      { name: "Curd Rice", price: 180, presets: "BLD" },
      ...each(["Dal Khichdi", "Palak Khichdi"], 220, { presets: "BLD" }),
    ],
  },
  {
    name: "Chinese Main Course",
    note: "Gravy.",
    presets: "LD",
    items: [
      ...each(["Veg Hot Garlic", "Veg Sweet & Sour", "Paneer in Choice of Sauce", "Baby Corn in Choice of Sauce", "Mushroom in Choice of Sauce"], 265),
      { name: "Diced Veg with Cashewnuts", price: 280 },
    ],
  },
  {
    name: "Noodles & Fried Rice",
    presets: "LD",
    items: [
      { name: "Veg Hakka Noodles", price: 230 },
      ...each(["Hong Kong Noodles", "Schezwan Noodles", "Singapore Noodles"], 250),
      { name: "Veg Fried Rice", price: 230 },
      ...each(["Schezwan Fried Rice", "Onion Chilly Fried Rice"], 240),
      ...each(["Tomato Fried Rice", "Mushroom Fried Rice"], 250),
      ...each(["Veg Triple Schezwan Rice", "Veg Thai Fried Rice", "American Chopsuey", "Chinese Chopsuey"], 265),
    ],
  },
  {
    name: "Salad, Papad & Raita",
    presets: "BLD",
    items: [
      ...each(["Roasted Papad", "Fry Papad"], 50, { presets: "LD" }),
      { name: "Masala Papad", price: 70, presets: "LD" },
      { name: "Curd", price: 90 },
      ...each(["Green Salad", "Tomato Salad", "Tandoori Salad"], 110, { presets: "LD" }),
      ...each(["Veg Raita", "Boondi Raita", "Pineapple Raita"], 110),
    ],
  },
  {
    name: "Desserts",
    presets: "LD",
    items: [
      { name: "Vanilla with Hot Chocolate", price: 190 },
      ...each(["Gadbad", "Banana Split", "Triple Sundae"], 215),
      { name: "Honeymoon Special", price: 240 },
      { name: "Gulab Jamun with Ice Cream", price: 170 },
      { name: "Gajar Halwa with Ice Cream", price: 190 },
    ],
  },
  {
    name: "Ice Cream",
    presets: "LD",
    items: [
      ...["Vanilla", "Strawberry"].map((name) => ({
        name: `${name} Ice Cream`,
        price: 80,
        variants: [
          { name: "Single scoop", price: 80 },
          { name: "Double scoop", price: 160 },
        ],
      })),
      ...["Chocolate", "Pista", "Mango", "Butterscotch", "Kesar Pista"].map((name) => ({
        name: `${name} Ice Cream`,
        price: 85,
        variants: [
          { name: "Single scoop", price: 85 },
          { name: "Double scoop", price: 170 },
        ],
      })),
    ],
  },
];

export const PRESETS = [
  { key: "B", name: "Breakfast" },
  { key: "L", name: "Lunch" },
  { key: "D", name: "Dinner" },
] as const;
