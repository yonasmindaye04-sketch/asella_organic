import fs from 'fs';
import path from 'path';

const sqlPath = path.join(process.cwd(), 'db', 'sql', '004_dummy_data.sql');
let content = fs.readFileSync(sqlPath, 'utf8');

// Fix staff_users UUIDs
content = content.replace("'a0000006-0000-0000-0000-0000006'", "'a0000006-0000-0000-0000-000000000006'");
content = content.replace("'a0000007-0001-1111-1111-1111117'", "'a0000007-0001-1111-1111-111111111117'");

// Fix referral_configs UUID
content = content.replace("'rc000001-0000-0000-0000-0000-0000011'", "'rc000001-0000-0000-0000-000000000011'");

fs.writeFileSync(sqlPath, content, 'utf8');
console.log('Fixed malformed UUIDs in 004_dummy_data.sql');
