const fs = require('fs');
const path = require('path');

const iconMap = {
  'fa-trophy': 'emoji_events',
  'fa-circle-info': 'info',
  'fa-circle-check': 'check_circle',
  'fa-triangle-exclamation': 'warning',
  'fa-circle-xmark': 'cancel',
  'fa-money-bill-wave': 'payments',
  'fa-money-bill-transfer': 'currency_exchange',
  'fa-piggy-bank': 'savings',
  'fa-cart-shopping': 'shopping_cart',
  'fa-clock': 'schedule',
  'fa-truck-fast': 'local_shipping',
  'fa-check-circle': 'check_circle',
  'fa-magnifying-glass': 'search',
  'fa-user': 'person',
  'fa-store': 'store',
  'fa-calendar-day': 'event',
  'fa-bell': 'notifications',
  'fa-chevron-down': 'expand_more',
  'fa-gear': 'settings',
  'fa-arrow-right-from-bracket': 'logout',
  'fa-plus': 'add',
  'fa-xmark': 'close',
  'fa-clock-rotate-left': 'history',
  'fa-check': 'check',
  'fa-box-open': 'inventory_2',
  'fa-ban': 'block',
  'fa-search': 'search',
  'fa-link': 'link',
  'fa-image': 'image',
  'fa-eye': 'visibility',
  'fa-trash': 'delete',
  'fa-pen': 'edit',
  'fa-upload': 'upload',
  'fa-download': 'download',
  'fa-ellipsis-v': 'more_vert',
  'fa-chart-line': 'show_chart',
  'fa-list': 'list',
  'fa-file-invoice': 'receipt',
  'fa-envelope': 'mail',
  'fa-phone': 'phone',
  'fa-arrow-left': 'arrow_back',
  'fa-arrow-right': 'arrow_forward',
  'fa-spinner': 'progress_activity',
  'fa-circle-notch': 'progress_activity',
  'fa-times': 'close',
  'fa-bars': 'menu',
  'fa-star': 'star'
};

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

walkDir('c:/Users/Yonas/Desktop/asella_organic/frontend/src', function(filePath) {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts') || filePath.endsWith('.jsx') || filePath.endsWith('.js')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // Replace literal <i className="fa-solid fa-icon ..."></i> with <span className="material-symbols-outlined ...">icon</span>
    // Note: the regex needs to capture everything else in className
    
    // First, for <i className="fa-solid fa-X ..."></i> or <i className="fa-solid fa-X" />
    content = content.replace(/<i\s+className=(['"`])([^'"`]*?)fa-solid\s+(fa-[a-z0-9-]+)([^'"`]*?)(['"`])\s*(?:><\/i>|\/>)/g, (match, q1, before, faIcon, after, q2) => {
      const matIcon = iconMap[faIcon] || faIcon.replace('fa-', '');
      const newClass = `material-symbols-outlined${before}${after}`.trim().replace(/\s+/g, ' ');
      return `<span className=${q1}${newClass}${q2}>${matIcon}</span>`;
    });

    // Handle generic strings like `fa-solid fa-icon` outside of <i ...> mostly in ToastProvider or KPICards
    // Wait, KPICards has icon: "fa-solid fa-money-bill-wave"
    // So we should replace "fa-solid fa-X" with "material-symbols-outlined" and somehow deal with the fact that it needs inner text.
    // Let's look at KPICards usage.
    
    // In ToastProvider: t.type === 'error' ? 'fa-circle-xmark text-red-600' :
    // If it's returning a class string for an icon component, we might have to edit ToastProvider manually.
    
    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Updated', filePath);
    }
  }
});
