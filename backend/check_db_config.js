const { masterPool } = require('./config/database');

async function checkConfig() {
  try {
    const [rows] = await masterPool.execute("SELECT value FROM settings WHERE `key` = 'certificate_config'");
    if (rows.length > 0) {
      console.log('--- Certificate Config in DB ---');
      console.log(JSON.stringify(JSON.parse(rows[0].value), null, 2));
    } else {
      console.log('No certificate_config found in settings table.');
    }
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

checkConfig();
