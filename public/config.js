// Application configuration

const CONFIG = {
  // API Configuration
  api: {
    base: 'http://localhost:3000/api',
    timeout: 5000,
  },

  // Supabase (if needed for direct access)
  supabase: {
    url: 'https://your-project-id.supabase.co',
    anonKey: 'your-anon-key',
  },

  // UI Configuration
  ui: {
    pollInterval: 3000, // ms
    maxWaitTime: 60000, // ms (1 minute)
  },

  // Demo data
  properties: [
    {
      id: 'PROP-001',
      name: 'فيلا الساحل الذهبي',
      type: 'villa',
      location: 'الساحل الشمالي، مصر',
      price: 500,
      rating: 4.8,
      image: 'assets/property-1.jpg',
      amenities: ['مسبح', 'حديقة', 'إطلالة بحرية'],
    },
    {
      id: 'PROP-002',
      name: 'شقة فندقية بوسط البلد',
      type: 'apartment',
      location: 'القاهرة، مصر',
      price: 120,
      rating: 4.5,
      image: 'assets/property-2.jpg',
      amenities: ['موقف سيارات', 'مصعد', 'إنترنت فائق السرعة'],
    },
    {
      id: 'PROP-003',
      name: 'كوخ ريفي هادئ',
      type: 'house',
      location: 'الفيوم، مصر',
      price: 80,
      rating: 4.6,
      image: 'assets/property-3.jpg',
      amenities: ['مزرعة', 'ينابيع', 'سلام طبيعي'],
    },
  ],
};
