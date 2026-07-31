import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

(async () => {
    try {
        const pool = mysql.createPool('mysql://root:@localhost:3306/asella_organic');
        const hash = await bcrypt.hash('test1234', 12);
        await pool.query('UPDATE staff_users SET password_hash = ? WHERE username = ?', [hash, 'dawit.admin']);
        console.log('Password for dawit.admin reset to test1234 successfully!');
        process.exit();
    } catch(err) {
        console.error(err);
        process.exit(1);
    }
})();
