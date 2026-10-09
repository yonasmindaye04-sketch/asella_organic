
/**

 * frontend/src/telegram/shop/i18n.ts
 * Telegram Mini App translations.
 *
 * Scoped deliberately: LanguageContext holds the website's dictionary, and the
 * Mini App has its own vocabulary (orders, checkout, delivery) that the site
 * never renders. Keeping them separate avoids one dictionary growing two
 * vocabularies.
 *
 * Amharic and Oromo copy should be reviewed by a native speaker before launch.
 */

export type Language = 'en' | 'am' | 'or';

export const LANGUAGES: Array<{ id: Language; label: string; short: string }> = [
  { id: 'en', label: 'English', short: 'EN' },
  { id: 'am', label: 'አማርኛ', short: 'አማ' },
  { id: 'or', label: 'Afaan Oromoo', short: 'OR' },
];

/**
 * Flat key -> string map. Nested objects are avoided so lookups stay a single
 * dictionary access and a missing key is obvious in dev.
 */
const EXTRA: Record<string, Record<string, string>> = {
  en: {
    'city.addisAbaba': 'Addis Ababa',
    'city.otherRegions': 'Other Regions',
    'city.abroad': 'Abroad',
    'checkout.namePlaceholder': 'e.g. Abebe Balcha',
    'checkout.phonePlaceholder': '+251 900 000 000',
    'checkout.locationPlaceholder': 'e.g. Bole, Medhanialem, next to...',
    'checkout.notesPlaceholder': 'Special instructions or delivery timing...',
    'checkout.submitting': 'Submitting Order...',
    'checkout.submit': 'Confirm Order — {total}',
    'account.cityPlaceholder': 'e.g. Addis Ababa',
    'account.areaPlaceholder': 'e.g. Bole, near',
    'account.shopNow': 'Shop now',
    'account.namePlaceholder': 'Abebe Balcha',
    'account.phonePlaceholder': '+251 900 000 000',
    'cart.referralPlaceholder': 'e.g. ASL-789',
    'detail.genericTag': 'Organic Supplement',
    'detail.unitPrice': 'Unit Price',
    'detail.packageSize': 'Select Package Size:',
    'detail.addCheckout': 'Add to Cart & Checkout',
    'discover.payment': 'Payment on delivery',
    'discover.paymentBody': 'Pay cash when your order arrives.',
    'discover.rider': 'Pay our delivery rider when your order arrives.',
    'tip.start.title': 'Start with one product',
    'tip.start.body':
      'Add a single supplement to your routine for two weeks before stacking another.',
    'tip.steep.title': 'Steep your tea',
    'tip.steep.body':
      'Allow 5 to 8 minutes in hot water. Longer steeping pulls bitterness out of dried leaves.',
    'tip.store.title': 'Store it sealed',
    'tip.store.body':
      'Keep powders and oils away from direct sunlight to protect their active compounds.',
    'payment.cashOnDelivery': 'Cash on delivery',
    'confirm.payment': 'Payment:',
    'confirm.body': 'Thank you for your order. We will contact you shortly to confirm delivery.',
    'confirm.note': 'Keep this screen for your records.',
    'notifications.loadError': 'Could not load notifications',
    'notifications.markAllRead': 'Mark all as read',
    'notifications.emptyHint': 'Order updates will appear here.',
    'orders.moreItems': '+{count} more',
    'common.currency': 'Birr',
    'common.storeSections': 'Store sections',
  },
  am: {
    'city.addisAbaba': 'አዲስ አበባ',
    'city.otherRegions': 'ሌሎች ክልሎች',
    'city.abroad': 'ውጭ ሀገር',
    'checkout.namePlaceholder': 'ለምሳሌ አበበ ባልቻ',
    'checkout.phonePlaceholder': '+251 900 000 000',
    'checkout.locationPlaceholder': 'ለምሳሌ ቦሌ፣ መድኃኔዓለም...',
    'checkout.notesPlaceholder': 'ልዩ መመሪያ ወይም የመድረሻ ጊዜ...',
    'checkout.submitting': 'ትዕዛዝ በመላክ ላይ...',
    'checkout.submit': 'ትዕዛዝ አረጋግጥ — {total}',
    'account.cityPlaceholder': 'ለምሳሌ አዲስ አበባ',
    'account.areaPlaceholder': 'ለምሳሌ ቦሌ',
    'account.shopNow': 'አሁን ይግዙ',
    'account.namePlaceholder': 'አበበ ባልቻ',
    'account.phonePlaceholder': '+251 900 000 000',
    'cart.referralPlaceholder': 'ለምሳሌ ASL-789',
    'detail.genericTag': 'ኦርጋኒክ ማሟያ',
    'detail.unitPrice': 'የአንድ ዋጋ',
    'detail.packageSize': 'የማሸጊያ መጠን ይምረጡ፦',
    'detail.addCheckout': 'ወደ ቅርጫት አክለው ይክፈሉ',
    'discover.payment': 'በመድረሻ ጊዜ ክፍያ',
    'discover.paymentBody': 'ትዕዛዝዎ ሲደርስ በጥሬ ገንዘብ ይክፈሉ።',
    'discover.rider': 'ትዕዛዝዎ ሲደርስ ለማድረሻ አሽከርካሪያችን ይክፈሉ።',
    'tip.start.title': 'በአንድ ምርት ይጀምሩ',
    'tip.start.body':
      'ሌላ ምርት ከመጨመርዎ በፊት ለሁለት ሳምንታት አንድ ማሟያ ወደ ዕለትዎ ያክሉ።',
    'tip.steep.title': 'ሻይዎን በደንብ ያፍሉ',
    'tip.steep.body':
      'በትኩስ ውሃ ውስጥ ከ5 እስከ 8 ደቂቃ ያቆዩት። ለረዥም ጊዜ ማቆየት የደረቁ ቅጠሎችን መራራ ያደርጋል።',
    'tip.store.title': 'በታሸገ ቦታ ያስቀምጡ',
    'tip.store.body':
      'የተፈጥሮ ይዘታቸውን ለመጠበቅ ዱቄት እና ዘይቶችን ከቀጥታ የፀሐይ ብርሃን ያርቁ።',
    'payment.cashOnDelivery': 'በመድረሻ ጊዜ ክፍያ',
    'confirm.payment': 'ክፍያ፦',
    'confirm.body': 'ለትዕዛዝዎ እናመሰግናለን። ለማረጋገጥ በቅርቡ እናገኝዎታለን።',
    'confirm.note': 'ለመረጃነትዎ ይህንን ማያ ገጽ ያስቀምጡ።',
    'notifications.loadError': 'ማሳወቂያዎችን መጫን አልተቻለም',
    'notifications.markAllRead': 'ሁሉንም እንደተነበበ አድርግ',
    'notifications.emptyHint': 'የትዕዛዝ ለውጦች እዚህ ይታያሉ።',
    'orders.moreItems': '+{count} ተጨማሪ',
    'common.currency': 'ብር',
    'common.storeSections': 'የሱቅ ክፍሎች',
  },
  or: {
    'city.addisAbaba': 'Finfinnee',
    'city.otherRegions': 'Naannoolee Biroo',
    'city.abroad': 'Biyya Alaa',
    'checkout.namePlaceholder': 'Fkn. Abebe Balchaa',
    'checkout.phonePlaceholder': '+251 900 000 000',
    'checkout.locationPlaceholder': 'Fkn. Boolee, Medhanealam...',
    'checkout.notesPlaceholder': 'Ibsa addaa ykn yeroo geejjibaa...',
    'checkout.submitting': 'Ajaja ergaa jira...',
    'checkout.submit': 'Ajaja mirkaneessi — {total}',
    'account.cityPlaceholder': 'Fkn. Finfinnee',
    'account.areaPlaceholder': 'Fkn. Boolee',
    'account.shopNow': 'Amma biti',
    'account.namePlaceholder': 'Abebe Balchaa',
    'account.phonePlaceholder': '+251 900 000 000',
    'cart.referralPlaceholder': 'Fkn. ASL-789',
    'detail.genericTag': 'Dabalata Orgaanikii',
    'detail.unitPrice': 'Gatii Tokkoo',
    'detail.packageSize': 'Hamma Saamsamaa filadhu:',
    'detail.addCheckout': 'Gara korjootti dabaliifi kaffali',
    'discover.payment': "Kaffaltii yeroo geejjibaa",
    'discover.paymentBody': "Yeroo ajajni kee ga'u maallaqa qaqaadhaan kaffali.",
    'discover.rider': "Yeroo ajajni kee ga'u ogeessa geejjibaa keenyaaf kaffali.",
    'tip.start.title': 'Oomisha tokkoon eegali',
    'tip.start.body':
      'Oomisha biraa dabalachuu kee dura, torban lamaaf dabalata tokko qofa fayyadami.',
    'tip.steep.title': 'Shaayii kee sirriitti danfisi',
    'tip.steep.body':
      'Bishaan ho\'aa keessatti daqiiqaa 5 hanga 8 tursiisi. Yeroo dheeraaf tursiisuun baala gogaa hadhaawaa taasisa.',
    'tip.store.title': 'Bakka cufameetti kaa\'i',
    'tip.store.body':
      'Qabiyyee isaanii eeguuf, daakuufi zayitoota aduun kallattiin bakkatti hin argineetti kaa\'i.',
    'payment.cashOnDelivery': 'Kaffaltii yeroo geejjibaa',
    'confirm.payment': 'Kaffaltii:',
    'confirm.body': 'Ajaja keetiif galatoomi. Geejjiba mirkaneessuuf dhiyootti si quunnamma.',
    'confirm.note': 'Ragaa kana of eeggannoodhaan qabi.',
    'notifications.loadError': 'Akeekkachiisa fiduun hin danda\'amne',
    'notifications.markAllRead': 'Hunda akka dubbifametti mallatteessi',
    'notifications.emptyHint': 'Odeeffannoon haaraan asitti ni mul\'ata.',
    'orders.moreItems': '+{count} dabalataa',
    'common.currency': 'Birrii',
    'common.storeSections': 'Kutaalee suuqii',
  },
};

const en = {
  ...EXTRA.en,
  // Tabs
  'tab.store': 'Store',
  'tab.discover': 'Discover',
  'tab.orders': 'Orders',
  'tab.account': 'Account',

  // Header
  'header.brand': 'Asella Organic',
  'header.cart': 'Open cart',
  'header.back': 'Go back',
  'header.theme.light': 'Switch to light theme',
  'header.theme.dark': 'Switch to dark theme',
  'header.language': 'Language',
  'header.notifications': 'Notifications',

  // Store tab
  'store.title': 'For you',
  'store.count': '{count} products',
  'store.search': 'Search Moringa, Shilajit, Black Seed...',
  'store.searchLabel': 'Search organic products',
  'store.filters': 'Filters',
  'store.inStockOnly': 'In-stock items only',
  'store.sort': 'Sort products',
  'store.sort.recommended': 'Recommended',
  'store.sort.priceAsc': 'Price: low to high',
  'store.sort.priceDesc': 'Price: high to low',
  'store.sort.name': 'Name A-Z',
  'store.addToCart': 'Add to Cart',
  'store.unavailable': 'Unavailable',
  'store.inCart': '{count} in cart',
  'store.popular': 'Popular',
  'store.view': 'View {name}',
  'store.packageSize': 'Package size for {name}',
  'store.empty': 'No products match your search.',
  'store.loading': 'Loading organic catalog...',
  'store.loadError': 'Could not load the catalog. Pull to try again.',

  // Categories
  'cat.all': 'All products',
  'cat.bestsellers': 'Best Sellers',
  'cat.superfood': 'Superfood',
  'cat.oils': 'Oils',
  'cat.herbs': 'Herbs',
  'cat.traditional': 'Traditional',

  // Discover tab
  'discover.title': 'Discover',
  'discover.subtitle': 'Learn what fits your routine, sourced from the Ethiopian highlands.',
  'discover.shopByCategory': 'Shop by category',
  'discover.bestSellers': 'Best sellers',
  'discover.highDemand': 'In high demand',
  'discover.howToUse': 'How to use them',
  'discover.payment': 'Payment on delivery',
  'discover.paymentBody': 'Pay our delivery rider when your order arrives.',

  // Orders tab
  'orders.title': 'My orders',
  'orders.subtitle': 'Your organic finds, all in one place.',
  'orders.keepShopping': 'Keep shopping',
  'orders.search': 'Search your purchases or order ID',
  'orders.searchLabel': 'Search orders',
  'orders.filter.all': 'All orders',
  'orders.filter.processing': 'Processing',
  'orders.filter.delivered': 'Delivered',
  'orders.filter.refunded': 'Refunded',
  'orders.count': '{count} orders',
  'orders.countOne': '1 order',
  'orders.loading': 'Loading orders...',
  'orders.empty': 'No orders found for this filter.',
  'orders.browse': 'Browse the store',
  'orders.viewItems': 'View my items',
  'orders.seller': 'Asella Organic',
  'orders.error': 'Could not load your orders.',
  'orders.retry': 'Try again',

  // Order detail
  'order.back': 'Back to orders',
  'order.destination': 'Destination',
  'order.payment': 'Payment',

  // Cart
  'cart.title': 'Shopping Cart',
  'cart.items': '{count} item(s)',
  'cart.empty': 'Your cart is empty.',
  'cart.browse': 'Browse products',
  'cart.referral': 'Referral or Affiliate Code (Optional)',
  'cart.referralPlaceholder': 'e.g. ASL-789',
  'cart.subtotal': 'Subtotal',
  'cart.delivery': 'Delivery',
  'cart.deliveryValue': 'Calculated upon dispatch',
  'cart.total': 'Total',
  'cart.checkout': 'Proceed to Checkout',
  'cart.remove': 'Remove {name}',
  'cart.increase': 'Increase {name} quantity',
  'cart.decrease': 'Decrease {name} quantity',

  // Checkout
  'checkout.title': 'Delivery Details',
  'checkout.subtitle': 'Enter your details. Payment is confirmed upon delivery via Telebirr, CBE, or Cash.',
  'checkout.name': 'Full Name *',
  'checkout.namePlaceholder': 'e.g. Abebe Balcha',
  'checkout.phone': 'Phone Number *',
  'checkout.city': 'City *',
  'checkout.orderType': 'Order Type',
  'checkout.orderTypeValue': 'Direct Delivery',
  'checkout.location': 'Specific Delivery Area / Landmark *',
  'checkout.locationPlaceholder': 'e.g. Bole, Medhanialem, next to...',
  'checkout.notes': 'Order Notes (Optional)',
  'checkout.notesPlaceholder': 'Special instructions or delivery timing...',
  'checkout.total': 'Order Total:',
  'checkout.receiptNote': 'Receipt will be sent directly to your Telegram chat.',
  'checkout.submit': 'Confirm Order — {total}',
  'checkout.submitting': 'Submitting Order...',

  // Validation
  'error.name': 'Please provide your full name',
  'error.phone': 'Please provide a valid phone number',
  'error.location': 'Please provide your delivery address or area',
  'error.cartEmpty': 'Your cart is empty',
  'error.orderFailed': 'Unable to place order',

  // Confirmation
  'confirm.title': 'Order Received',
  'confirm.body': 'Thank you {name}. Your order has been placed and registered.',
  'confirm.orderId': 'Order ID:',
  'confirm.total': 'Total:',
  'confirm.destination': 'Destination:',
  'confirm.note': 'We have dispatched your order details to our delivery team and sent an official receipt to your Telegram chat.',
  'confirm.track': 'Track Order Status',
  'confirm.continue': 'Continue Shopping',

  // Account
  'account.space': 'Your space on Asella Organic',
  'account.customer': 'Asella customer',
  'account.orders': 'Your orders',
  'account.ordersCaption': 'Purchases & delivery',
  'account.spent': 'Total spent',
  'account.spentCaption': 'Balance & payment history',
  'account.shopNow': 'Shop now',
  'account.shopNowCaption': 'Reorder your essentials',
  'account.active': '{count} active',
  'account.done': '{count} delivered',
  'account.profile': 'Your profile',
  'account.profileSub': 'Saved details speed up checkout on your next order.',
  'account.displayName': 'Display name',
  'account.displayNamePlaceholder': 'Abebe Balcha',
  'account.phone': 'Phone number',
  'account.city': 'City',
  'account.deliveryArea': 'Delivery area',
  'account.save': 'Save profile',
  'account.saving': 'Saving...',
  'account.saved': 'Profile saved at {time}',
  'account.telegramUser': 'Telegram account',
  'account.loggedInAs': 'Signed in as your Telegram account',

  // Notifications
  'notifications.title': 'Notifications',
  'notifications.empty': 'No notifications yet.',
  'notifications.markAllRead': 'Mark all as read',
  'notifications.orderCreated': 'Order received',
  'notifications.orderUpdate': 'Order update',

  // Generic
  'common.close': 'Close',
  'common.retry': 'Retry',
  'common.currency': 'ETB',
} as const;

export type TranslationKey = keyof typeof en;

/**
 * Amharic translations. Kept as a partial map so an untranslated key falls
 * back to English rather than rendering a blank label.
 */
const am: Partial<Record<TranslationKey, string>> = {
  ...EXTRA.am,
  'tab.store': 'ገበያ',
  'tab.discover': 'አዳዲስ',
  'tab.orders': 'ትዕዛዞች',
  'tab.account': 'መለያ',

  'header.brand': 'አሰላ ኦርጋኒክ',
  'header.cart': 'ቅርጫት ክፈት',
  'header.back': 'ተመለስ',
  'header.theme.light': 'ወደ ብሩህ ገጽታ ቀይር',
  'header.theme.dark': 'ወደ ጨለማ ገጽታ ቀይር',
  'header.language': 'ቋንቋ',
  'header.notifications': 'ማሳወቂያዎች',

  'store.title': 'ለእርስዎ',
  'store.count': '{count} ምርቶች',
  'store.search': 'ሞሪንጋ፣ ሺላጅት፣ ጥቁር አዝሙድ ይፈልጉ...',
  'store.searchLabel': 'የተፈጥሮ ምርት ይፈልጉ',
  'store.filters': 'ማጣሪያዎች',
  'store.inStockOnly': 'በክምችት ያሉ ብቻ',
  'store.sort': 'ምርቶችን ደርድር',
  'store.sort.recommended': 'የተመረጠ',
  'store.sort.priceAsc': 'ዋጋ: ዝቅተኛ ወደ ከፍተኛ',
  'store.sort.priceDesc': 'ዋጋ: ከፍተኛ ወደ ዝቅተኛ',
  'store.sort.name': 'ስም አ-ፐ',
  'store.addToCart': 'ወደ ቅርጫት ጨምር',
  'store.unavailable': 'አሁን የለም',
  'store.inCart': '{count} በቅርጫት ውስጥ',
  'store.popular': 'ተወዳጅ',
  'store.view': '{name} ይመልከቱ',
  'store.packageSize': 'የማሸጊያ መጠን {name}',
  'store.empty': 'ከፍለጋዎ ጋር የሚዛመድ ምርት የለም።',
  'store.loading': 'የተፈጥሮ ምርቶችን በመጫን ላይ...',
  'store.loadError': 'ካታሎጉን መጫን አልተቻለም። እባክዎ እንደገና ይሞክሩ።',

  'cat.all': 'ሁሉም ምርቶች',
  'cat.bestsellers': 'በብዛት የተሸጡ',
  'cat.superfood': 'ሱፐርፉድ',
  'cat.oils': 'ዘይቶች',
  'cat.herbs': 'ዕፅዋት',
  'cat.traditional': 'ባህላዊ',

  'discover.title': 'አዳዲስ ምርቶች',
  'discover.subtitle': 'ለእርስዎ የሚስማማውን፣ ከኢትዮጵያ ተራራማ አካባቢዎች የተገኙ ምርቶችን ያግኙ።',
  'discover.shopByCategory': 'በምድብ ይገበያዩ',
  'discover.bestSellers': 'በብዛት የተሸጡ',
  'discover.highDemand': 'በከፍተኛ ፍላጎት ያሉ',
  'discover.howToUse': 'እንዴት እንጠቀምባቸው',
  'discover.payment': 'በመድረሻ ጊዜ ክፍያ',
  'discover.paymentBody': 'ትዕዛዝዎ ሲደርስ ለማድረሻ አሽከርካሪያችን ይክፈሉ።',

  'orders.title': 'ትዕዛዞቼ',
  'orders.subtitle': 'ሁሉም የተፈጥሮ ምርት ግዢዎችዎ በአንድ ቦታ።',
  'orders.keepShopping': 'ግዢዎን ይቀጥሉ',
  'orders.search': 'ግዢዎችዎን ወይም የትዕዛዝ መለያ ይፈልጉ',
  'orders.searchLabel': 'ትዕዛዞችን ይፈልጉ',
  'orders.filter.all': 'ሁሉም ትዕዛዞች',
  'orders.filter.processing': 'በሂደት ላይ',
  'orders.filter.delivered': 'ደርሷል',
  'orders.filter.refunded': 'ተመልሷል',
  'orders.count': '{count} ትዕዛዞች',
  'orders.countOne': '1 ትዕዛዝ',
  'orders.loading': 'ትዕዛዞችን በመጫን ላይ...',
  'orders.empty': 'ለዚህ ማጣሪያ ትዕዛዝ አልተገኘም።',
  'orders.browse': 'ወደ ገበያ ይሂዱ',
  'orders.viewItems': 'እቃዎቼን ይመልከቱ',
  'orders.seller': 'አሰላ ኦርጋኒክ',
  'orders.error': 'ትዕዛዞችዎን መጫን አልተቻለም።',
  'orders.retry': 'እንደገና ይሞክሩ',

  'order.back': 'ወደ ትዕዛዞች ተመለስ',
  'order.destination': 'መድረሻ',
  'order.payment': 'ክፍያ',

  'cart.title': 'የግዢ ቅርጫት',
  'cart.items': '{count} ምርት(ቶች)',
  'cart.empty': 'ቅርጫትዎ ባዶ ነው።',
  'cart.browse': 'ምርቶችን ይመልከቱ',
  'cart.referral': 'የሪፈራል ወይም የአጋር ኮድ (አማራጭ)',
  'cart.referralPlaceholder': 'ለምሳሌ ASL-789',
  'cart.subtotal': 'ንዑስ ድምር',
  'cart.delivery': 'ማድረሻ',
  'cart.deliveryValue': 'በሚላክበት ጊዜ ይሰላል',
  'cart.total': 'ጠቅላላ',
  'cart.checkout': 'ወደ ክፍያ ይቀጥሉ',
  'cart.remove': '{name} አስወግድ',
  'cart.increase': '{name} ብዛት ጨምር',
  'cart.decrease': '{name} ብዛት ቀንስ',

  'checkout.title': 'የመድረሻ ዝርዝር',
  'checkout.subtitle': 'ዝርዝርዎን ያስገቡ። ክፍያው በመድረሻ ጊዜ በቴሌብር፣ በCBE ወይም በጥሬ ገንዘብ ይረጋገጣል።',
  'checkout.name': 'ሙሉ ስም *',
  'checkout.namePlaceholder': 'ለምሳሌ አበበ ባልቻ',
  'checkout.phone': 'የስልክ ቁጥር *',
  'checkout.city': 'ከተማ *',
  'checkout.orderType': 'የትዕዛዝ አይነት',
  'checkout.orderTypeValue': 'ቀጥታ ማድረሻ',
  'checkout.location': 'የተለየ መድረሻ / ምልክት *',
  'checkout.locationPlaceholder': 'ለምሳሌ ቦሌ፣ መድኃኔዓለም...',
  'checkout.notes': 'የትዕዛዝ ማስታወሻ (አማራጭ)',
  'checkout.notesPlaceholder': 'ልዩ መመሪያ ወይም የመድረሻ ጊዜ...',
  'checkout.total': 'ጠቅላላ ትዕዛዝ፦',
  'checkout.receiptNote': 'ደረሰኝ በቀጥታ ወደ ቴሌግራምዎ ይላካል።',
  'checkout.submit': 'ትዕዛዙን ያረጋግጡ — {total}',
  'checkout.submitting': 'ትዕዛዝ በመላክ ላይ...',

  'error.name': 'እባክዎ ሙሉ ስምዎን ያስገቡ',
  'error.phone': 'እባክዎ ትክክለኛ የስልክ ቁጥር ያስገቡ',
  'error.location': 'እባክዎ የመድረሻ አድራሻዎን ያስገቡ',
  'error.cartEmpty': 'ቅርጫትዎ ባዶ ነው',
  'error.orderFailed': 'ትዕዛዝ ማስገባት አልተቻለም',

  'confirm.title': 'ትዕዛዝ ተቀብለናል',
  'confirm.body': 'እናመሰግናለን {name}። ትዕዛዝዎ ተቀባይነት አግኝቷል።',
  'confirm.orderId': 'የትዕዛዝ መለያ፦',
  'confirm.total': 'ጠቅላላ፦',
  'confirm.destination': 'መድረሻ፦',
  'confirm.note': 'የትዕዛዝዎን ዝርዝር ለማድረሻ ቡድናችን ልከናል። ኦፊሴላዊ ደረሰኝም ወደ ቴሌግራምዎ ተልኳል።',
  'confirm.track': 'የትዕዛዝ ሁኔታ ይከታተሉ',
  'confirm.continue': 'ግዢዎን ይቀጥሉ',

  'account.space': 'በአሰላ ኦርጋኒክ ውስጥ ያለዎት ቦታ',
  'account.customer': 'የአሰላ ደንበኛ',
  'account.orders': 'ትዕዛዞችዎ',
  'account.ordersCaption': 'ግዢ እና ማድረሻ',
  'account.spent': 'ጠቅላላ ወጪ',
  'account.spentCaption': 'ቀሪ ሂሳብ እና የክፍያ ታሪክ',
  'account.shopNow': 'አሁን ይግዙ',
  'account.shopNowCaption': 'የሚያስፈልጉትን እንደገና ይዘዙ',
  'account.active': '{count} በሂደት ላይ',
  'account.done': '{count} ደርሰዋል',
  'account.profile': 'መገለጫዎ',
  'account.profileSub': 'የተቀመጡ ዝርዝሮች ቀጣዩን ግዢዎን ያፋጥኑታል።',
  'account.displayName': 'የማሳያ ስም',
  'account.displayNamePlaceholder': 'አበበ ባልቻ',
  'account.phone': 'የስልክ ቁጥር',
  'account.city': 'ከተማ',
  'account.deliveryArea': 'የመድረሻ አካባቢ',
  'account.save': 'መገለጫ አስቀምጥ',
  'account.saving': 'በማስቀመጥ ላይ...',
  'account.saved': 'መገለጫ በ{time} ተቀምጧል',
  'account.telegramUser': 'የቴሌግራም መለያ',
  'account.loggedInAs': 'በቴሌግራም መለያዎ ገብተዋል',

  'notifications.title': 'ማሳወቂያዎች',
  'notifications.empty': 'እስካሁን ምንም ማሳወቂያ የለም።',
  'notifications.markAllRead': 'ሁሉንም እንደተነበበ አድርግ',
  'notifications.orderCreated': 'ትዕዛዝ ተቀብለናል',
  'notifications.orderUpdate': 'የትዕዛዝ ማሻሻያ',

  'common.close': 'ዝጋ',
  'common.retry': 'እንደገና ሞክር',
  'common.currency': 'ብር',
};

/** Afaan Oromoo translations. Partial map with an English fallback, as above. */
const or: Partial<Record<TranslationKey, string>> = {
  ...EXTRA.or,
  'tab.store': 'Suuqii',
  'tab.discover': 'Barbaadi',
  'tab.orders': 'Ajajoota',
  'tab.account': 'Akkaawuntii',

  'header.brand': 'Asella Organic',
  'header.cart': 'Korjoo bani',
  'header.back': 'Duubatti',
  'header.theme.light': 'Gara ifaatti jijjiiri',
  'header.theme.dark': 'Gara dukkanaatti jijjiiri',
  'header.language': 'Afaan',
  'header.notifications': 'Akeekkachiisoota',

  'store.title': 'Siif',
  'store.count': 'Oomishaalee {count}',
  'store.search': 'Moringa, Shilajit, Abasuuda barbaadi...',
  'store.searchLabel': 'Oomisha orgaanikii barbaadi',
  'store.filters': 'Filoowwan',
  'store.inStockOnly': 'Kan istookii keessa jiru qofa',
  'store.sort': 'Oomishaalee tartiibessi',
  'store.sort.recommended': 'Kan gorfame',
  'store.sort.priceAsc': 'Gatii: gadaanaa irraa gara olaanaatti',
  'store.sort.priceDesc': 'Gatii: olaanaa irraa gara gadaanatti',
  'store.sort.name': 'Maqaa A-Z',
  'store.addToCart': 'Gara korjootti dabali',
  'store.unavailable': 'Hin jiru',
  'store.inCart': 'Korjoo keessa {count} jira',
  'store.popular': 'Jaallatamaa',
  'store.view': '{name} ilaali',
  'store.packageSize': 'Hamma saamsamaa {name}',
  'store.empty': 'Oomishni ati barbaadde hin argamne.',
  'store.loading': 'Kaataaloogii fidaa jira...',
  'store.loadError': 'Kaataaloogii fiduun hin danda\'amne. Irra deebi\'ii yaali.',

  'cat.all': 'Oomishaalee hunda',
  'cat.bestsellers': 'Baay\'ee kan gurguraman',
  'cat.superfood': 'Superfood',
  'cat.oils': 'Zayitoota',
  'cat.herbs': 'Qimaamii',
  'cat.traditional': 'Aadaa',

  'discover.title': 'Barbaadi',
  'discover.subtitle': 'Oomisha gaarren Itoophiyaa irraa dhufe, kan siif ta\'u bari.',
  'discover.shopByCategory': 'Ramaddiin biti',
  'discover.bestSellers': 'Baay\'ee kan gurguraman',
  'discover.highDemand': 'Kan baay\'ee barbaadaman',
  'discover.howToUse': 'Akkaataa itti fayyadaman',
  'discover.payment': 'Kaffaltii yeroo geejjibaa',
  'discover.paymentBody': 'Yeroo ajajni kee ga\'u ogeessa geejjibaa keenyaaf kaffali.',

  'orders.title': 'Ajajoota koo',
  'orders.subtitle': 'Ajajoota orgaanikii kee hundi bakka tokkotti.',
  'orders.keepShopping': 'Bittaa itti fufi',
  'orders.search': 'Bittaawwan ykn lakk. ajajaa kee barbaadi',
  'orders.searchLabel': 'Ajajoota barbaadi',
  'orders.filter.all': 'Ajajoota hunda',
  'orders.filter.processing': 'Adeemsifamaa jira',
  'orders.filter.delivered': 'Dhaqqabeera',
  'orders.filter.refunded': 'Deebi\'eera',
  'orders.count': 'Ajajoota {count}',
  'orders.countOne': 'Ajaja 1',
  'orders.loading': 'Ajajoota fidaa jira...',
  'orders.empty': 'Filannoo kanaan ajajni hin argamne.',
  'orders.browse': 'Suuqii daawwadhu',
  'orders.viewItems': 'Oomisha koo ilaali',
  'orders.seller': 'Asella Organic',
  'orders.error': 'Ajajoota kee fiduun hin danda\'amne.',
  'orders.retry': 'Irra deebi\'i',

  'order.back': 'Gara ajajootaatti deebi\'i',
  'order.destination': 'Bakka itti geejjibamu',
  'order.payment': 'Kaffaltii',

  'cart.title': 'Korjoo Bittaa',
  'cart.items': 'Oomisha(lee) {count}',
  'cart.empty': 'Korjoon kee duwwaadha.',
  'cart.browse': 'Oomishaalee daawwadhu',
  'cart.referral': 'Koodii Riferaalii (Filannoo)',
  'cart.referralPlaceholder': 'Fkn. ASL-789',
  'cart.subtotal': 'Ida\'ama xiqqaa',
  'cart.delivery': 'Geejjiba',
  'cart.deliveryValue': 'Yeroo ergame shallagama',
  'cart.total': 'Waliigala',
  'cart.checkout': 'Gara kaffaltiitti darbi',
  'cart.remove': '{name} haqi',
  'cart.increase': 'Baay\'ina {name} dabali',
  'cart.decrease': 'Baay\'ina {name} hir\'isi',

  'checkout.title': 'Ibsa Geejjibaa',
  'checkout.subtitle': 'Odeeffannoo kee galchi. Kaffaltiin yeroo meeshaan ga\'u Telebirr, CBE ykn maallaqa qaqaadhaan mirkanaa\'a.',
  'checkout.name': 'Maqaa Guutuu *',
  'checkout.namePlaceholder': 'Fkn. Abebe Balchaa',
  'checkout.phone': 'Lakkoofsa Bilbilaa *',
  'checkout.city': 'Magaalaa *',
  'checkout.orderType': 'Gosa Ajajaa',
  'checkout.orderTypeValue': 'Kallattiin Geejjibuu',
  'checkout.location': 'Bakka Addaa ykn Mallattoo *',
  'checkout.locationPlaceholder': 'Fkn. Boolee, Medhanealam...',
  'checkout.notes': 'Ibsa Ajajaa (Filannoo)',
  'checkout.notesPlaceholder': 'Ibsa addaa ykn yeroo geejjibaa...',
  'checkout.total': 'Waliigala Ajajaa:',
  'checkout.receiptNote': 'Nagaheen kallattiin gara Telegram chat keetiitti ni ergama.',
  'checkout.submit': 'Ajaja Mirkaneessi — {total}',
  'checkout.submitting': 'Ajaja ergaa jira...',

  'error.name': 'Maaloo maqaa guutuu kee galchi',
  'error.phone': 'Maaloo lakkoofsa bilbilaa sirrii galchi',
  'error.location': 'Maaloo teessoo geejjibaa kee galchi',
  'error.cartEmpty': 'Korjoon kee duwwaadha',
  'error.orderFailed': 'Ajaja galchuun hin danda\'amne',

  'confirm.title': 'Ajajni Fudhatameera',
  'confirm.body': 'Galatoomi {name}. Ajajni kee galmaa\'eera.',
  'confirm.orderId': 'Lakkoofsa Ajajaa:',
  'confirm.total': 'Waliigala:',
  'confirm.destination': 'Bakka itti geejjibamu:',
  'confirm.note': 'Ibsa ajaja keetii gara garee geejjibaa keenyaatti ergineerra, nagahee seera qabeessas gara Telegram chat keetiitti ergineerra.',
  'confirm.track': 'Haala Ajajaa Hordofi',
  'confirm.continue': 'Bittaa Itti Fufi',

  'account.space': 'Bakka kee Asella Organic keessatti',
  'account.customer': 'Maamila Asella',
  'account.orders': 'Ajajoota kee',
  'account.ordersCaption': 'Bittaawwaniifi geejjiba',
  'account.spent': 'Waliigala kaffalame',
  'account.spentCaption': 'Hafteefi seenaa kaffaltii',
  'account.shopNow': 'Amma biti',
  'account.shopNowCaption': 'Waan siif barbaachisu irra deebi\'ii ajaji',
  'account.active': 'Hojii irra kan jiran {count}',
  'account.done': 'Kan dhaqqaban {count}',
  'account.profile': 'Pirofaayilii kee',
  'account.profileSub': 'Odeeffannoo qusatame ajaja kee itti aanu ariifachiisa.',
  'account.displayName': 'Maqaa mul\'atu',
  'account.displayNamePlaceholder': 'Abebe Balchaa',
  'account.phone': 'Lakkoofsa bilbilaa',
  'account.city': 'Magaalaa',
  'account.deliveryArea': 'Naannoo geejjibaa',
  'account.save': 'Pirofaayilii olkaawi',
  'account.saving': 'Olkaawaa jira...',
  'account.saved': 'Pirofaayiliin sa\'aatii {time} olkaawameera',
  'account.telegramUser': 'Akkaawuntii Telegram',
  'account.loggedInAs': 'Akka akkaawuntii Telegram keetiitti galteetta',

  'notifications.title': 'Akeekkachiisoota',
  'notifications.empty': 'Akeekkachiisni haaraan hin jiru.',
  'notifications.markAllRead': 'Hunda dubbifame jedhii mallatteessi',
  'notifications.orderCreated': 'Ajajni fudhatameera',
  'notifications.orderUpdate': 'Ajaja fooyya\'e',

  'common.close': 'Cufi',
  'common.retry': 'Irra deebi\'i',
  'common.currency': 'Birrii',
};

const DICTIONARIES: Record<Language, Partial<Record<TranslationKey, string>>> = { en, am, or };

export function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'am' || value === 'or';
}

export type TranslateVars = Record<string, string | number>;

/**
 * Resolves a key for the given language, interpolating `{placeholders}`.
 * Falls back to English, then to the key itself, so a missing translation
 * degrades to something readable instead of a blank label.
 */
export function translate(
  language: Language,
  key: TranslationKey | string,
  vars: TranslateVars = {}
): string {
  const dictionary = DICTIONARIES[language] ?? en;
  const template = (dictionary as Record<string, string | undefined>)[key] ?? (en as Record<string, string>)[key];

  if (!template) return key;

  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

/** Keys present in English but missing from a translation. Used by tests. */
export function missingTranslations(language: Language): TranslationKey[] {
  const dictionary = DICTIONARIES[language] ?? {};
  return (Object.keys(en) as TranslationKey[]).filter((key) => !dictionary[key]);
}
