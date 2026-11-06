import { ServiceType } from '@prisma/client';

/** Deterministic PRNG so every run of the seed derives the same people, shops and addresses. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
    shuffle: <T>(arr: readonly T[]): T[] => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

export interface Area {
  name: string;
  lat: number;
  lng: number;
  /** How many approved shops the area gets. */
  shops: number;
  /** Price level: 1.0 is the citywide baseline. */
  tier: number;
  /** Relative share of customers living here. */
  weight: number;
}

// Approximate centres of named Lahore localities.
export const AREAS: Area[] = [
  { name: 'Gulberg I', lat: 31.525, lng: 74.343, shops: 1, tier: 1.1, weight: 2 },
  { name: 'Gulberg II', lat: 31.5185, lng: 74.3535, shops: 2, tier: 1.25, weight: 3 },
  { name: 'Gulberg III', lat: 31.5125, lng: 74.3455, shops: 3, tier: 1.3, weight: 4 },
  { name: 'Gulberg IV', lat: 31.5075, lng: 74.3395, shops: 1, tier: 1.2, weight: 2 },
  { name: 'Gulberg V', lat: 31.5, lng: 74.3345, shops: 1, tier: 1.15, weight: 2 },
  { name: 'DHA Phase 1', lat: 31.483, lng: 74.399, shops: 2, tier: 1.3, weight: 3 },
  { name: 'DHA Phase 2', lat: 31.473, lng: 74.413, shops: 2, tier: 1.3, weight: 3 },
  { name: 'DHA Phase 3', lat: 31.465, lng: 74.425, shops: 2, tier: 1.35, weight: 3 },
  { name: 'DHA Phase 4', lat: 31.458, lng: 74.44, shops: 2, tier: 1.35, weight: 3 },
  { name: 'DHA Phase 5', lat: 31.47, lng: 74.455, shops: 3, tier: 1.4, weight: 4 },
  { name: 'DHA Phase 6', lat: 31.46, lng: 74.47, shops: 2, tier: 1.4, weight: 3 },
  { name: 'DHA Phase 7', lat: 31.44, lng: 74.455, shops: 1, tier: 1.35, weight: 2 },
  { name: 'DHA Phase 8', lat: 31.42, lng: 74.465, shops: 1, tier: 1.3, weight: 2 },
  { name: 'DHA Y-Block', lat: 31.462, lng: 74.433, shops: 1, tier: 1.4, weight: 2 },
  { name: 'Lahore Cantt', lat: 31.533, lng: 74.39, shops: 2, tier: 1.15, weight: 3 },
  { name: 'Cavalry Ground', lat: 31.514, lng: 74.369, shops: 2, tier: 1.2, weight: 2 },
  { name: 'Fortress Stadium', lat: 31.533, lng: 74.377, shops: 1, tier: 1.15, weight: 1 },
  { name: 'Askari 10', lat: 31.529, lng: 74.435, shops: 1, tier: 1.1, weight: 2 },
  { name: 'Askari 11', lat: 31.45, lng: 74.4, shops: 1, tier: 1.1, weight: 2 },
  { name: 'Model Town', lat: 31.4825, lng: 74.3265, shops: 3, tier: 1.15, weight: 4 },
  { name: 'Muslim Town', lat: 31.5195, lng: 74.3275, shops: 1, tier: 1.05, weight: 2 },
  { name: 'Garden Town', lat: 31.5, lng: 74.3205, shops: 1, tier: 1.1, weight: 2 },
  { name: 'Barkat Market', lat: 31.503, lng: 74.326, shops: 1, tier: 1.1, weight: 1 },
  { name: 'Faisal Town', lat: 31.484, lng: 74.3035, shops: 2, tier: 1.1, weight: 3 },
  { name: 'Johar Town', lat: 31.4695, lng: 74.2745, shops: 3, tier: 1.05, weight: 5 },
  { name: 'Wapda Town', lat: 31.4385, lng: 74.2655, shops: 2, tier: 1.0, weight: 3 },
  { name: 'Valencia Town', lat: 31.418, lng: 74.233, shops: 1, tier: 1.0, weight: 2 },
  { name: 'Allama Iqbal Town', lat: 31.5115, lng: 74.2925, shops: 2, tier: 1.0, weight: 3 },
  { name: 'Samanabad', lat: 31.529, lng: 74.2985, shops: 1, tier: 0.9, weight: 2 },
  { name: 'Shadman', lat: 31.5365, lng: 74.3305, shops: 1, tier: 1.0, weight: 2 },
  { name: 'Township', lat: 31.435, lng: 74.3, shops: 1, tier: 0.9, weight: 2 },
  { name: 'Sabzazar', lat: 31.49, lng: 74.26, shops: 1, tier: 0.9, weight: 2 },
  { name: 'Gulshan-e-Ravi', lat: 31.561, lng: 74.285, shops: 1, tier: 0.85, weight: 2 },
  { name: 'Anarkali', lat: 31.568, lng: 74.3105, shops: 1, tier: 0.85, weight: 1 },
  { name: 'Mall Road', lat: 31.5595, lng: 74.326, shops: 1, tier: 1.0, weight: 1 },
  { name: 'Data Darbar', lat: 31.579, lng: 74.305, shops: 1, tier: 0.8, weight: 1 },
  { name: 'Chauburji', lat: 31.54, lng: 74.306, shops: 1, tier: 0.85, weight: 1 },
  { name: 'Ichra', lat: 31.535, lng: 74.32, shops: 1, tier: 0.85, weight: 2 },
  { name: 'Mozang', lat: 31.547, lng: 74.324, shops: 1, tier: 0.85, weight: 1 },
  { name: 'Garhi Shahu', lat: 31.559, lng: 74.3395, shops: 1, tier: 0.9, weight: 1 },
  { name: 'Krishan Nagar', lat: 31.5555, lng: 74.347, shops: 1, tier: 0.85, weight: 1 },
  { name: 'Qila Gujjar Singh', lat: 31.5475, lng: 74.3335, shops: 1, tier: 0.9, weight: 1 },
  { name: 'Mughalpura', lat: 31.571, lng: 74.372, shops: 1, tier: 0.85, weight: 2 },
  { name: 'Baghbanpura', lat: 31.5815, lng: 74.3555, shops: 1, tier: 0.85, weight: 1 },
  { name: 'Harbanspura', lat: 31.58, lng: 74.378, shops: 1, tier: 0.85, weight: 1 },
  { name: 'Shalimar', lat: 31.5855, lng: 74.3815, shops: 1, tier: 0.85, weight: 1 },
  { name: 'Tajpura', lat: 31.578, lng: 74.36, shops: 1, tier: 0.8, weight: 1 },
  { name: 'Shahdara', lat: 31.628, lng: 74.297, shops: 1, tier: 0.8, weight: 2 },
  { name: 'Ravi Road', lat: 31.593, lng: 74.316, shops: 1, tier: 0.8, weight: 1 },
  { name: 'Bund Road', lat: 31.579, lng: 74.28, shops: 1, tier: 0.85, weight: 1 },
  { name: 'Misri Shah', lat: 31.564, lng: 74.297, shops: 1, tier: 0.8, weight: 1 },
  { name: 'Sanda', lat: 31.547, lng: 74.287, shops: 1, tier: 0.85, weight: 1 },
  { name: 'Walton', lat: 31.497, lng: 74.368, shops: 1, tier: 1.0, weight: 2 },
  { name: 'Jail Road', lat: 31.5337, lng: 74.3305, shops: 1, tier: 1.05, weight: 2 },
  { name: 'Ferozepur Road', lat: 31.5105, lng: 74.332, shops: 1, tier: 1.0, weight: 2 },
  { name: 'Multan Road', lat: 31.498, lng: 74.252, shops: 1, tier: 0.9, weight: 2 },
  { name: 'Thokar Niaz Baig', lat: 31.469, lng: 74.229, shops: 1, tier: 0.9, weight: 2 },
  { name: 'Raiwind Road', lat: 31.4, lng: 74.23, shops: 1, tier: 0.95, weight: 2 },
  { name: 'Hamza Town', lat: 31.448, lng: 74.212, shops: 1, tier: 0.9, weight: 1 },
  { name: 'Bahria Town', lat: 31.364, lng: 74.181, shops: 3, tier: 1.2, weight: 4 },
  { name: 'Lake City', lat: 31.3835, lng: 74.21, shops: 1, tier: 1.15, weight: 2 },
  { name: 'Park View', lat: 31.41, lng: 74.185, shops: 1, tier: 1.05, weight: 1 },
  { name: 'Kahna', lat: 31.352, lng: 74.365, shops: 1, tier: 0.8, weight: 1 },
  { name: 'Bedian Road', lat: 31.43, lng: 74.44, shops: 1, tier: 1.1, weight: 1 },
  { name: 'Eden', lat: 31.422, lng: 74.43, shops: 1, tier: 1.1, weight: 1 },
  { name: 'Defence Raya', lat: 31.385, lng: 74.475, shops: 1, tier: 1.3, weight: 1 },
  { name: 'Paragon City', lat: 31.455, lng: 74.49, shops: 1, tier: 1.1, weight: 1 },
  { name: 'Izmir Town', lat: 31.48, lng: 74.29, shops: 1, tier: 1.0, weight: 1 },
  { name: 'Nespak Housing Society', lat: 31.459, lng: 74.245, shops: 1, tier: 1.0, weight: 1 },
  { name: 'PCSIR Housing Society', lat: 31.438, lng: 74.279, shops: 1, tier: 1.0, weight: 1 },
  { name: 'Punjab Society', lat: 31.458, lng: 74.264, shops: 1, tier: 1.0, weight: 1 },
  { name: 'Bank Stop', lat: 31.462, lng: 74.321, shops: 1, tier: 0.95, weight: 1 },
  { name: 'EME Society', lat: 31.478, lng: 74.408, shops: 1, tier: 1.15, weight: 2 },
  { name: 'Canal View', lat: 31.409, lng: 74.256, shops: 1, tier: 1.0, weight: 1 },
  { name: 'Kot Lakhpat', lat: 31.466, lng: 74.308, shops: 1, tier: 0.85, weight: 1 },
  { name: 'Wahdat Road', lat: 31.508, lng: 74.285, shops: 1, tier: 0.9, weight: 1 },
  { name: 'Mustafa Town', lat: 31.516, lng: 74.274, shops: 1, tier: 0.9, weight: 1 },
  { name: 'Sui Gas Housing Society', lat: 31.4505, lng: 74.248, shops: 1, tier: 1.0, weight: 1 },
  { name: 'Lahore Medical Housing Society', lat: 31.432, lng: 74.29, shops: 1, tier: 1.0, weight: 1 },
  { name: 'Architects Engineers Society', lat: 31.472, lng: 74.296, shops: 1, tier: 1.0, weight: 1 },
];

export const MALE_FIRST = [
  'Muhammad',
  'Ahmed',
  'Ali',
  'Hassan',
  'Hussain',
  'Usman',
  'Bilal',
  'Imran',
  'Kamran',
  'Faisal',
  'Shahid',
  'Tariq',
  'Naveed',
  'Asif',
  'Zahid',
  'Khalid',
  'Saad',
  'Hamza',
  'Danish',
  'Farhan',
  'Adeel',
  'Waqas',
  'Rizwan',
  'Junaid',
  'Umar',
  'Talha',
  'Shoaib',
  'Irfan',
  'Nadeem',
  'Arslan',
  'Haris',
  'Fahad',
  'Salman',
  'Zeeshan',
  'Rashid',
  'Majid',
  'Sajid',
  'Kashif',
  'Noman',
  'Yasir',
  'Atif',
  'Babar',
  'Mubashir',
  'Furqan',
  'Osama',
  'Waleed',
  'Shahzad',
  'Tahir',
  'Zubair',
  'Aamir',
  'Ijaz',
  'Abdul Rehman',
  'Abdullah',
  'Ibrahim',
  'Ismail',
  'Sohail',
  'Fawad',
  'Raheel',
  'Murtaza',
  'Qasim',
];

export const FEMALE_FIRST = [
  'Ayesha',
  'Fatima',
  'Zainab',
  'Maryam',
  'Hira',
  'Sana',
  'Sadia',
  'Nimra',
  'Iqra',
  'Amna',
  'Bushra',
  'Rabia',
  'Mehwish',
  'Saba',
  'Farah',
  'Nadia',
  'Samina',
  'Shazia',
  'Rubina',
  'Uzma',
  'Kiran',
  'Anum',
  'Hania',
  'Mahnoor',
  'Laiba',
  'Eman',
  'Areeba',
  'Komal',
  'Sidra',
  'Aroosa',
  'Tahira',
  'Naila',
  'Rukhsana',
  'Humaira',
  'Sumaira',
  'Asma',
  'Khadija',
  'Hafsa',
  'Sehrish',
  'Mariam',
  'Zoya',
  'Alina',
  'Javeria',
  'Rida',
  'Mahira',
  'Aiman',
  'Noor',
  'Sobia',
  'Lubna',
  'Shabnam',
];

export const SURNAMES = [
  'Khan',
  'Ahmed',
  'Malik',
  'Butt',
  'Chaudhry',
  'Sheikh',
  'Qureshi',
  'Siddiqui',
  'Raza',
  'Hussain',
  'Iqbal',
  'Mirza',
  'Bhatti',
  'Gill',
  'Cheema',
  'Ansari',
  'Rana',
  'Dar',
  'Awan',
  'Lodhi',
  'Mughal',
  'Baig',
  'Javed',
  'Akhtar',
  'Nawaz',
  'Rehman',
  'Aslam',
  'Farooq',
  'Hashmi',
  'Zaidi',
  'Naqvi',
  'Rizvi',
  'Kazmi',
  'Abbasi',
  'Gondal',
  'Warraich',
  'Virk',
  'Sandhu',
  'Tarar',
  'Bajwa',
  'Kiani',
  'Niazi',
  'Satti',
  'Mehmood',
  'Anwar',
  'Shah',
  'Pervaiz',
  'Saeed',
  'Yousaf',
  'Latif',
  'Rafique',
  'Zafar',
  'Haider',
  'Randhawa',
  'Mian',
  'Khawaja',
  'Sethi',
  'Ghauri',
  'Hayat',
  'Waheed',
];

const BRANDS = [
  'Al-Karam',
  'Noor',
  'Sparkle',
  'Fresh Fold',
  'Bismillah',
  'Royal Crown',
  'Madina',
  'Shan',
  'Zam Zam',
  'Lahori',
  'Mughal',
  'Elite',
  'Crystal',
  'Blue Star',
  'Shahi',
  'Sunrise',
  'Bright',
  'Clean Touch',
  'Dilkash',
  'Gulzar',
  'Hamdard',
  'Rehmat',
  'Al-Falah',
  'Modern',
  'Classic',
  'Premier',
  'Diamond',
  'Golden',
  'Silver Line',
  'Pearl',
  'Rainbow',
  'Perfect',
  'Spotless',
  'Pressto',
  'Gulab',
  'Chenab',
  'Badshahi',
  'Minar',
  'Al-Hamd',
  'Taj',
  'Zeenat',
  'Roshan',
  'Sitara',
  'Naz',
  'Lucky Star',
  'Bahar',
  'Al-Madad',
  'Faisal',
  'Ghazali',
  'Afzal',
  'New Star',
  'Pak Fresh',
  'Sufi',
  'Mehfil',
  'Rang Mahal',
  'Kohinoor',
  'Lahore Fresh',
  'Jannat',
  'Al-Noor',
  'Khalid',
  'Raja',
  'Super Clean',
];
const TYPES = [
  'Dry Cleaners',
  'Laundry',
  'Laundry & Dry Cleaners',
  'Steam Press',
  'Washing Company',
  'Cleaners',
  'Dry Clean Centre',
  'Wash & Iron',
  'Laundry Services',
  'Dry Cleaning House',
];

/** A shop name unique per slot index; some are named after the locality they serve. */
export function shopName(index: number, area: string, r: ReturnType<typeof rng>): string {
  if (r.chance(0.28)) return `${area.replace(/^DHA /, 'DHA ')} ${r.pick(['Steam Press', 'Laundry', 'Dry Cleaners', 'Wash & Iron'])}`;
  return `${BRANDS[index % BRANDS.length]} ${r.pick(TYPES)}`;
}

export const SHOP_STREETS = [
  'Main Boulevard',
  'Market Road',
  'Commercial Area',
  'Service Road',
  'Main Bazaar',
  'Block Market',
  'Shopping Centre',
];
export const HOME_STREETS = ['Street', 'Lane', 'Road'];

export const SHOP_DESCRIPTIONS = [
  'Wash, iron and dry cleaning for everyday and wedding wear, with free pickup and delivery.',
  'Family-run laundry serving the neighbourhood for over a decade. Careful hand finishing.',
  'Steam press and dry cleaning specialists: suits, sherwanis, lehengas and heavy dupattas.',
  'Same-day ironing and 48-hour wash and fold. We handle delicate fabrics with care.',
  'Premium dry cleaning with eco-friendly solvents. Bridal and formal wear a speciality.',
  'Affordable wash and iron for students and families. Quilts, curtains and bedding too.',
  'Quick-turnaround laundry with careful stain treatment and neat packaging.',
];

export interface GarmentDef {
  name: string;
  nameUr: string;
  category: 'Wash & Fold' | 'Wash & Iron' | 'Dry Cleaning' | 'Ironing' | 'Household';
  type: ServiceType;
  price: number;
  hours: number;
}

export const GARMENTS: GarmentDef[] = [
  { name: 'Shalwar Kameez', nameUr: 'شلوار قمیض', category: 'Wash & Iron', type: ServiceType.WASH_IRON, price: 250, hours: 48 },
  {
    name: 'Shalwar Kameez (Dry Clean)',
    nameUr: 'شلوار قمیض (ڈرائی کلین)',
    category: 'Dry Cleaning',
    type: ServiceType.DRY_CLEAN,
    price: 550,
    hours: 72,
  },
  { name: 'Kurta', nameUr: 'کرتا', category: 'Wash & Iron', type: ServiceType.WASH_IRON, price: 150, hours: 48 },
  { name: 'Shirt', nameUr: 'شرٹ', category: 'Wash & Iron', type: ServiceType.WASH_IRON, price: 120, hours: 48 },
  { name: 'Shirt (Iron Only)', nameUr: 'شرٹ (صرف استری)', category: 'Ironing', type: ServiceType.IRON_ONLY, price: 50, hours: 24 },
  { name: 'Trouser', nameUr: 'پتلون', category: 'Wash & Iron', type: ServiceType.WASH_IRON, price: 140, hours: 48 },
  { name: 'Jeans', nameUr: 'جینز', category: 'Wash & Fold', type: ServiceType.WASH_FOLD, price: 160, hours: 48 },
  { name: 'T-Shirt', nameUr: 'ٹی شرٹ', category: 'Wash & Fold', type: ServiceType.WASH_FOLD, price: 90, hours: 48 },
  { name: 'Waistcoat', nameUr: 'ویسٹ کوٹ', category: 'Dry Cleaning', type: ServiceType.DRY_CLEAN, price: 450, hours: 72 },
  { name: 'Coat', nameUr: 'کوٹ', category: 'Dry Cleaning', type: ServiceType.DRY_CLEAN, price: 800, hours: 72 },
  { name: 'Suit (2 Piece)', nameUr: 'سوٹ (دو پیس)', category: 'Dry Cleaning', type: ServiceType.DRY_CLEAN, price: 1100, hours: 72 },
  { name: 'Suit (3 Piece)', nameUr: 'سوٹ (تین پیس)', category: 'Dry Cleaning', type: ServiceType.DRY_CLEAN, price: 1500, hours: 72 },
  { name: 'Sherwani', nameUr: 'شیروانی', category: 'Dry Cleaning', type: ServiceType.DRY_CLEAN, price: 2200, hours: 96 },
  { name: 'Lehenga', nameUr: 'لہنگا', category: 'Dry Cleaning', type: ServiceType.DRY_CLEAN, price: 3500, hours: 120 },
  { name: 'Bridal Dress', nameUr: 'دلہن کا جوڑا', category: 'Dry Cleaning', type: ServiceType.DRY_CLEAN, price: 6000, hours: 144 },
  { name: 'Saree', nameUr: 'ساڑھی', category: 'Dry Cleaning', type: ServiceType.DRY_CLEAN, price: 1200, hours: 96 },
  { name: 'Dupatta', nameUr: 'دوپٹہ', category: 'Wash & Iron', type: ServiceType.WASH_IRON, price: 120, hours: 48 },
  {
    name: 'Dupatta (Dry Clean)',
    nameUr: 'دوپٹہ (ڈرائی کلین)',
    category: 'Dry Cleaning',
    type: ServiceType.DRY_CLEAN,
    price: 300,
    hours: 72,
  },
  { name: 'Abaya', nameUr: 'عبایا', category: 'Dry Cleaning', type: ServiceType.DRY_CLEAN, price: 600, hours: 72 },
  { name: 'Sweater', nameUr: 'سویٹر', category: 'Dry Cleaning', type: ServiceType.DRY_CLEAN, price: 450, hours: 72 },
  { name: 'Shawl', nameUr: 'شال', category: 'Dry Cleaning', type: ServiceType.DRY_CLEAN, price: 500, hours: 72 },
  { name: 'Bedsheet (Single)', nameUr: 'بیڈ شیٹ (سنگل)', category: 'Household', type: ServiceType.WASH_FOLD, price: 220, hours: 72 },
  { name: 'Bedsheet (Double)', nameUr: 'بیڈ شیٹ (ڈبل)', category: 'Household', type: ServiceType.WASH_FOLD, price: 320, hours: 72 },
  { name: 'Razai (Quilt)', nameUr: 'رضائی', category: 'Household', type: ServiceType.WASH_FOLD, price: 1100, hours: 120 },
  { name: 'Blanket', nameUr: 'کمبل', category: 'Household', type: ServiceType.WASH_FOLD, price: 900, hours: 120 },
  { name: 'Curtain (per panel)', nameUr: 'پردہ (فی پینل)', category: 'Household', type: ServiceType.WASH_FOLD, price: 450, hours: 96 },
  { name: 'Pillow Cover', nameUr: 'تکیے کا غلاف', category: 'Household', type: ServiceType.WASH_FOLD, price: 80, hours: 48 },
  { name: 'Towel', nameUr: 'تولیہ', category: 'Household', type: ServiceType.WASH_FOLD, price: 110, hours: 48 },
  { name: 'Bed Linen Set', nameUr: 'بیڈ لینن سیٹ', category: 'Household', type: ServiceType.WASH_IRON, price: 650, hours: 72 },
];

export const REVIEW_COMMENTS_GOOD = [
  'Clothes came back spotless and neatly folded. Will order again.',
  'Pickup was on time and the shalwar kameez were pressed perfectly.',
  'Very professional service. My suit looks brand new.',
  'Great value and the rider was polite. Highly recommended.',
  'Dry cleaning of my sherwani was excellent, no smell at all.',
  'Quick turnaround and fair price. Bedsheets smelled fresh.',
  'Bohat acha kaam, kapray bilkul saaf aur istri perfect.',
  'Time par delivery hui aur packing bhi bohat achi thi.',
];
export const REVIEW_COMMENTS_OK = [
  'Good overall but delivery was a little late.',
  'Clean clothes, though one shirt needed re-pressing.',
  'Decent service for the price. Packaging could be better.',
];
export const REVIEW_COMMENTS_BAD = [
  'A stain on my white kurta was still there after cleaning.',
  'Delivery was two hours late and nobody called.',
];

export const CANCEL_REASONS = [
  'Plans changed, I will not be home.',
  'Ordered by mistake.',
  'Found a nearby shop with faster turnaround.',
  'Need the clothes back sooner than the slot allows.',
];
export const REJECT_REASONS = [
  'We are fully booked for that pickup slot.',
  'Sorry, we cannot take bridal wear this week.',
  'Our shop is closing early today for a family event.',
];

export const COMPLAINTS: {
  type: 'COMPLAINT' | 'REDO';
  subject: string;
  description: string;
  reply: string;
  outcome: 'REFUND' | 'REDO' | 'REJECT';
  note: string;
}[] = [
  {
    type: 'COMPLAINT',
    subject: 'Shirt came back with a mark',
    description: 'The white shirt still has a dark mark on the collar after cleaning.',
    reply: 'Sorry about that. We can clean the shirt again at no charge.',
    outcome: 'REDO',
    note: 'The shop will collect and clean it again.',
  },
  {
    type: 'REDO',
    subject: 'Please wash again',
    description: 'The bedsheets still smell of detergent, so I would like them cleaned again.',
    reply: 'We will rewash them and rinse twice.',
    outcome: 'REDO',
    note: 'Redo approved.',
  },
  {
    type: 'COMPLAINT',
    subject: 'Button missing on kurta',
    description: 'One button on my kurta is missing after pressing. It was there when I handed it over.',
    reply: 'We checked and could not find it. We are happy to replace the button.',
    outcome: 'REFUND',
    note: 'Partial refund agreed for the button.',
  },
  {
    type: 'COMPLAINT',
    subject: 'Late delivery',
    description: 'My order arrived three hours after the delivery slot.',
    reply: 'We apologise, the rider was held up in traffic.',
    outcome: 'REJECT',
    note: 'Delivery was within the grace window.',
  },
];

export const PROMOS = [
  { code: 'EID25', discountType: 'PERCENT', value: '25', maxDiscount: '200', minOrderAmount: '500' },
  { code: 'LAHORE100', discountType: 'FLAT', value: '100', maxDiscount: null, minOrderAmount: '800' },
  { code: 'WELCOME10', discountType: 'PERCENT', value: '10', maxDiscount: '150', minOrderAmount: '300' },
  { code: 'SHAADI20', discountType: 'PERCENT', value: '20', maxDiscount: '500', minOrderAmount: '2000' },
  { code: 'SARDI15', discountType: 'PERCENT', value: '15', maxDiscount: '250', minOrderAmount: '1000' },
] as const;
