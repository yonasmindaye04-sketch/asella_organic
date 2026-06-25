import fs from 'fs';
import path from 'path';

const sqlPath = path.join(process.cwd(), 'db', 'sql', '004_dummy_data.sql');
let content = fs.readFileSync(sqlPath, 'utf8');

// Fix swapped columns in telegram_users (lines where the 5th param is a timestamp and 6th is 'vendor' or 'manager')
// Example: (6474604883, NULL, 'Gene Geremu', 'Gene Geremu Gaaga🐾', '2026-04-01 10:59:05.045000', 'vendor')
const regex = /,\s*'(\d{4}-\d{2}-\d{2}[^']+)'\s*,\s*'([^']+)'\)/g;

content = content.replace(regex, (match, timestamp, role) => {
    // only swap if role is like 'vendor' or 'manager' or 'sales'
    if (['vendor', 'manager', 'sales'].includes(role)) {
        return `, '${role}', '${timestamp}')`;
    }
    return match;
});

fs.writeFileSync(sqlPath, content, 'utf8');
console.log('Fixed swapped columns in 004_dummy_data.sql');
