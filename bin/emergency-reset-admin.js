// File: bin/emergency-reset-admin.js - SECURE VERSION WITH TELEGRAM
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
const readline = require('readline');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Telegram Bot - only require if config exists
let TelegramBot = null;
try {
  TelegramBot = require('node-telegram-bot-api');
} catch (error) {
  // Telegram not installed - will use fallback
}

async function emergencyAdminReset() {
  console.log('🚨 RESTAURANTPRO ERP - IT ADMIN EMERGENCY RESET\n');
  console.log('🔐 MULTI-LAYER SECURITY VERIFICATION REQUIRED\n');
  console.log('=============================================\n');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  try {
    // === LAYER 1: IT ADMIN IDENTITY VERIFICATION ===
    console.log('📋 LAYER 1: IT ADMIN CREDENTIALS');
    console.log('--------------------------------');
    
    const inputUsername = await question(rl, 'IT Admin Username: ');
    const inputPassword = await question(rl, 'IT Admin Password: ', true);
    
    // Verify against stored credentials (both username and password)
    const storedCreds = await loadItAdminCredentials();
    
    // Check username first
    if (inputUsername !== storedCreds.username) {
      console.log('\n❌ Invalid IT Admin username. Access denied.');
      logSecurityEvent('failed_auth', { 
        adminId: inputUsername,
        reason: 'username_mismatch' 
      });
      rl.close();
      process.exit(1);
    }
    
    // Then check password
    const isValid = await bcrypt.compare(inputPassword, storedCreds.passwordHash);
    if (!isValid) {
      console.log('\n❌ Invalid IT Admin password. Access denied.');
      logSecurityEvent('failed_auth', { 
        adminId: inputUsername,
        reason: 'password_mismatch' 
      });
      rl.close();
      process.exit(1);
    }
    
    // === LAYER 2: TIME-BASED ONE-TIME PASSWORD ===
    console.log('\n📱 LAYER 2: VERIFICATION CODE');
    console.log('----------------------------------');
    
    const currentHour = new Date().getHours();
    const otp = generateTOTP(currentHour);
    
    // Load client info for Telegram message
    const clientInfo = await loadClientInfo();
    
    // Try to send via Telegram
    let telegramSent = false;
    if (TelegramBot) {
      try {
        await sendTelegramOTP(otp, inputUsername, clientInfo.restaurant_name);
        console.log('✅ Verification code sent via Telegram');
        console.log('📱 Check your Telegram messages for the code');
        telegramSent = true;
      } catch (telegramError) {
        console.log('⚠️  Telegram send failed:', telegramError.message);
        telegramSent = false;
      }
    }
    
    // Fallback to console display
    if (!telegramSent) {
      console.log(`\n🔐 Verification Code: ${otp}`);
      console.log('⚠️  This code is valid for 1 hour only');
      console.log('📝 Note: Configure Telegram for secure delivery');
    }
    
    const userOtp = await question(rl, 'Enter verification code: ');
    
    if (userOtp !== otp) {
      console.log('\n❌ Invalid verification code. Access denied.');
      logSecurityEvent('failed_totp', { 
        adminId: inputUsername,
        method: telegramSent ? 'telegram' : 'console' 
      });
      rl.close();
      process.exit(1);
    }
    
    // === LAYER 3: CLIENT RESTAURANT VERIFICATION ===
    console.log('\n🏪 LAYER 3: CLIENT VERIFICATION');
    console.log('------------------------------');
    
    console.log(`Restaurant: ${clientInfo.restaurant_name}`);
    console.log(`Owner: ${clientInfo.owner_name}`);
    
    const clientCode = await question(rl, 'Enter client verification code: ', true);
    
    if (clientCode !== clientInfo.verification_code) {
      console.log('\n❌ Invalid client code. Access denied.');
      logSecurityEvent('failed_client_auth', { adminId: inputUsername });
      rl.close();
      process.exit(1);
    }
    
    // === LAYER 4: SAFETY CONFIRMATION ===
    console.log('\n⚠️  LAYER 4: FINAL CONFIRMATION');
    console.log('----------------------------');
    
    console.log('\nYou are about to:');
    console.log('1. Reset admin password for:', clientInfo.restaurant_name);
    console.log('2. Generate new temporary password');
    console.log('3. This action will be logged and audited\n');
    
    const confirm = await question(rl, 'Type "CONFIRM_RESET" to proceed: ');
    
    if (confirm !== 'CONFIRM_RESET') {
      console.log('\n❌ Operation cancelled by user.');
      logSecurityEvent('cancelled', { adminId: inputUsername });
      rl.close();
      return;
    }
    
    // === ALL VERIFICATIONS PASSED - PROCEED ===
    console.log('\n✅ ALL SECURITY CHECKS PASSED\n');
    
    // Get database credentials
    console.log('📊 DATABASE CONNECTION');
    console.log('----------------------');
    const dbHost = await question(rl, 'DB Host [localhost]: ') || 'localhost';
    const dbUser = await question(rl, 'DB User [root]: ') || 'root';
    const dbPass = await question(rl, 'DB Password: ', true);
    const dbName = await question(rl, 'DB Name [restaurant_erp]: ') || 'restaurant_erp';
    
    // Connect and reset
    const connection = await mysql.createConnection({
      host: dbHost,
      user: dbUser,
      password: dbPass,
      database: dbName
    });
    
    console.log('\n✅ Connected to database');
    
    // Show current admin users
    const [admins] = await connection.execute(
      "SELECT id, username, email FROM users WHERE role = 'admin' AND status = 'active'"
    );
    
    if (admins.length === 0) {
      console.log('❌ No active admin accounts found!');
      await connection.end();
      rl.close();
      return;
    }
    
    console.log('\n👑 Current Admin Accounts:');
    admins.forEach(admin => {
      console.log(`   ${admin.id}. ${admin.username} (${admin.email})`);
    });
    
    // Ask which admin to reset
    const adminIdToReset = await question(rl, '\nEnter Admin ID to reset: ');
    
    // Verify admin exists
    const [verifyAdmin] = await connection.execute(
      'SELECT id, username, email FROM users WHERE id = ? AND role = "admin"',
      [adminIdToReset]
    );
    
    if (verifyAdmin.length === 0) {
      console.log('❌ Admin ID not found or not an admin!');
      await connection.end();
      rl.close();
      return;
    }
    
    // Generate strong random password
    const newPassword = generateStrongPassword();
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password
    await connection.execute(
      'UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?',
      [hashedPassword, adminIdToReset]
    );
    
    console.log('\n✅ ADMIN PASSWORD RESET SUCCESSFUL!');
    console.log('====================================');
    console.log(`Admin: ${verifyAdmin[0].username} (${verifyAdmin[0].email})`);
    console.log(`New Password: ${newPassword}`);
    
    // === COMPREHENSIVE LOGGING ===
    await logSecurityEvent('emergency_reset_completed', {
      adminId: inputUsername,
      restaurant: clientInfo.restaurant_name,
      targetAdminId: adminIdToReset,
      targetEmail: verifyAdmin[0].email,
      timestamp: new Date().toISOString(),
      ip: getServerIP()
    });
    
    // Send Telegram alert for completed reset
    if (TelegramBot) {
      try {
        await sendTelegramAlert('emergency_reset_completed', {
          adminId: inputUsername,
          restaurant: clientInfo.restaurant_name,
          targetEmail: verifyAdmin[0].email
        });
      } catch (tgError) {
        // Ignore Telegram errors in logging
      }
    }
    
    // Log to database if available
    try {
      await connection.execute(
        `INSERT INTO audit_logs (user_id, action, details, created_at) 
         VALUES (?, 'emergency_reset_by_it_admin', ?, NOW())`,
        [adminIdToReset, JSON.stringify({ 
          reset_by_it_admin: inputUsername,
          restaurant: clientInfo.restaurant_name,
          timestamp: new Date().toISOString()
        })]
      );
    } catch (logError) {
      console.log('📝 Note: Could not log to audit table');
    }
    
    console.log('\n📋 POST-RESET INSTRUCTIONS:');
    console.log('1. Login immediately with temporary password');
    console.log('2. Change password immediately');
    console.log('3. Verify system functionality');
    console.log('4. Contact client with new credentials');
    
    await connection.end();
    rl.close();
    
    // Save emergency reset record
    saveResetRecord({
      timestamp: new Date().toISOString(),
      it_admin: inputUsername,
      restaurant: clientInfo.restaurant_name,
      target_admin: verifyAdmin[0].email,
      action: 'password_reset',
      method: telegramSent ? 'telegram' : 'console'
    });
    
  } catch (error) {
    console.error('\n❌ Reset failed:', error.message);
    logSecurityEvent('reset_failed', { error: error.message });
    if (rl) rl.close();
  }
}

// === SECURITY HELPER FUNCTIONS ===

async function loadItAdminCredentials() {
  // Load both username and password hash from config
  try {
    // Check for new combined credentials file
    const combinedPath = path.join(__dirname, '../config/it-admin-credentials.json');
    
    if (fs.existsSync(combinedPath)) {
      // New format: JSON with both username and password_hash
      const creds = JSON.parse(fs.readFileSync(combinedPath, 'utf8'));
      return {
        username: creds.username || 'admin',
        passwordHash: creds.password_hash || creds.passwordHash
      };
    }
    
    // Check for old separate files
    const hashPath = path.join(__dirname, '../config/it-admin.hash');
    const userPath = path.join(__dirname, '../config/it-admin.username');
    
    if (fs.existsSync(hashPath) && fs.existsSync(userPath)) {
      // Old format: separate files
      return {
        username: fs.readFileSync(userPath, 'utf8').trim(),
        passwordHash: fs.readFileSync(hashPath, 'utf8').trim()
      };
    }
    
    // Default for initial setup
    console.warn('⚠️  No IT admin credentials found. Using setup defaults.');
    const defaultHash = await bcrypt.hash('SetupChangeThis123!', 10);
    return {
      username: 'setup_admin',
      passwordHash: defaultHash,
      is_default: true
    };
  } catch (error) {
    throw new Error(`Cannot load IT admin credentials: ${error.message}`);
  }
}

async function loadClientInfo() {
  // Load client verification info
  try {
    const clientPath = path.join(__dirname, '../config/client-info.json');
    if (fs.existsSync(clientPath)) {
      return JSON.parse(fs.readFileSync(clientPath, 'utf8'));
    }
    // Default for setup
    return {
      restaurant_name: 'SETUP_REQUIRED',
      owner_name: 'SETUP_REQUIRED',
      verification_code: 'SETUP123'
    };
  } catch (error) {
    throw new Error('Cannot load client information');
  }
}

function generateTOTP(hour) {
  // Simple time-based code
  const secret = process.env.TOTP_SECRET || 'RestaurantPro2024Secure';
  const hash = crypto.createHmac('sha256', secret)
    .update(hour.toString() + new Date().getDate())
    .digest('hex');
  return hash.substring(0, 8).toUpperCase();
}

async function loadTelegramConfig() {
  try {
    const tgPath = path.join(__dirname, '../config/telegram-bot.json');
    if (fs.existsSync(tgPath)) {
      const config = JSON.parse(fs.readFileSync(tgPath, 'utf8'));
      if (config.enabled !== false && config.bot_token && config.chat_id) {
        return config;
      }
    }
    return null; // Telegram not configured
  } catch (error) {
    console.warn('⚠️  Cannot load Telegram config:', error.message);
    return null;
  }
}

async function sendTelegramOTP(otp, adminUsername, restaurantName) {
  if (!TelegramBot) {
    throw new Error('Telegram Bot not installed');
  }
  
  const config = await loadTelegramConfig();
  if (!config) {
    throw new Error('Telegram not configured');
  }
  
  const bot = new TelegramBot(config.bot_token, { polling: false });
  
  // FIXED: Escape special characters for Markdown
  const escapedRestaurant = restaurantName.replace(/_/g, '\\_').replace(/\*/g, '\\*').replace(/\[/g, '\\[');
  const escapedAdmin = adminUsername.replace(/_/g, '\\_').replace(/\*/g, '\\*').replace(/\[/g, '\\[');

  // Option 1: Use HTML formatting (more reliable)
  const message = `
🚨 <b>RESTAURANTPRO ERP - EMERGENCY ACCESS VERIFICATION</b>

⏰ <b>Time:</b> ${new Date().toLocaleString()}
👤 <b>IT Admin:</b> ${escapedAdmin}
🏪 <b>Restaurant:</b> ${escapedRestaurant}
🔐 <b>Verification Code:</b> <code>${otp}</code>

⚠️ This code is valid for 1 hour only
⚠️ Do not share this code with anyone

<i>If you did NOT request this code, contact security immediately.</i>
`;
  
  try {
    await bot.sendMessage(config.chat_id, message, {
      parse_mode: 'HTML',  // Changed from Markdown to HTML
      disable_notification: false
    });
    
    console.log('✅ Telegram message sent successfully');
    
    // Also send to multiple chat IDs if needed
    if (config.additional_chat_ids && Array.isArray(config.additional_chat_ids)) {
      for (const chatId of config.additional_chat_ids) {
        try {
          await bot.sendMessage(chatId, `🔐 Verification Code: ${otp}\nFor: ${restaurantName}`);
        } catch (e) {
          // Ignore errors for additional chats
        }
      }
    }
    
    return true;
    
  } catch (error) {
    console.error('Telegram send error:', error.message);
    throw error; // Re-throw to trigger fallback
  }
}

async function sendTelegramAlert(event, details) {
  if (!TelegramBot) return;
  
  try {
    const config = await loadTelegramConfig();
    if (!config || config.emergency_notifications === false) return;
    
    const bot = new TelegramBot(config.bot_token, { polling: false });
    
    // Use HTML formatting
    const alertMessage = `
🚨 <b>EMERGENCY RESET ALERT</b>

<b>Event:</b> ${event}
<b>Time:</b> ${new Date().toLocaleString()}
<b>Restaurant:</b> ${(details.restaurant || 'N/A').replace(/[<>]/g, '')}
<b>Admin:</b> ${(details.adminId || 'N/A').replace(/[<>]/g, '')}
<b>Target Admin:</b> ${(details.targetEmail || 'N/A').replace(/[<>]/g, '')}

${event === 'emergency_reset_completed' ? '✅ RESET COMPLETED' : '⚠️ SECURITY EVENT'}
`;
    
    await bot.sendMessage(config.chat_id, alertMessage, {
      parse_mode: 'HTML'
    });
    
  } catch (error) {
    // Silent fail - don't break the main flow
    console.log('Telegram alert failed (non-critical):', error.message);
  }
}

function logSecurityEvent(event, data) {
  const logPath = path.join(__dirname, '../logs/security.log');
  const entry = {
    timestamp: new Date().toISOString(),
    event: event,
    data: data
  };
  
  // Ensure logs directory exists
  const logDir = path.dirname(logPath);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', { flag: 'a' });
}

function saveResetRecord(record) {
  const recordsPath = path.join(__dirname, '../logs/emergency-resets.json');
  
  // Ensure logs directory exists
  const logDir = path.dirname(recordsPath);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  let records = [];
  if (fs.existsSync(recordsPath)) {
    try {
      records = JSON.parse(fs.readFileSync(recordsPath, 'utf8'));
    } catch (e) {
      console.warn('Could not read reset records:', e.message);
    }
  }
  
  records.push(record);
  fs.writeFileSync(recordsPath, JSON.stringify(records, null, 2));
}

function getServerIP() {
  try {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const intf of interfaces[name]) {
        if (!intf.internal && intf.family === 'IPv4') {
          return intf.address;
        }
      }
    }
  } catch (e) {
    return 'unknown';
  }
  return 'unknown';
}

function generateStrongPassword() {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghijkmnpqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%^&*';
  
  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  
  const allChars = uppercase + lowercase + numbers + symbols;
  for (let i = 0; i < 8; i++) {
    password += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }
  
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

function question(rl, prompt, isPassword = false) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

// Run if called directly
if (require.main === module) {
  emergencyAdminReset();
}

module.exports = emergencyAdminReset;