const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Local File Database — stored in mock_db folder next to the project root
const DB_DIR = path.join(__dirname, '../../../mock_db');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const getFilePath = (table) => path.join(DB_DIR, `${table.toLowerCase()}.json`);

const readTable = (table) => {
  const fp = getFilePath(table);
  if (!fs.existsSync(fp)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
};

const writeTable = (table, data) => {
  try { fs.writeFileSync(getFilePath(table), JSON.stringify(data, null, 2)); }
  catch (e) { logger.error(`DB write error for ${table}:`, e.message); }
};

class Database {
  async testConnection() {
    console.log('✅ DATABASE: Running in Full Local-File Mode (no cloud needed)');
    return { success: true };
  }

  async query(text, params = []) {
    const textUp = text.trim().toUpperCase();

    // ─── HELPER: extract first table name ────────────────────────────────
    const extractTable = (sql) => {
      const m = sql.match(/(?:FROM|INSERT INTO|UPDATE|DELETE FROM)\s+([a-zA-Z0-9_]+)/i);
      return m ? m[1] : null;
    };

    // ─── 1. TOKEN BLACKLIST CHECK (is_active = FALSE) ─────────────────────
    // Query: SELECT 1 FROM BankUserJwt WHERE token_value = $1 AND (is_active = FALSE ...)
    if (textUp.includes('IS_ACTIVE = FALSE') || textUp.includes('IS_ACTIVE = FALSE')) {
      const tokens = readTable('BankUserJwt');
      const now = new Date();
      const rows = tokens.filter(t =>
        t.token_value === params[0] &&
        (t.is_active === false || t.is_active === 0 || (t.expiry_time && new Date(t.expiry_time) <= now))
      );
      return { rows, rowCount: rows.length };
    }

    // ─── 2. JOIN QUERY: Token Validation  ────────────────────────────────
    if (textUp.includes('JOIN BANKUSER')) {
      const tokens = readTable('BankUserJwt');
      const users  = readTable('BankUser');
      const now = new Date();
      const rows = tokens
        .filter(t =>
          t.token_value === params[0] &&
          (t.is_active === true || t.is_active === 1) &&
          (!t.expiry_time || new Date(t.expiry_time) > now)
        )
        .map(t => {
          const user = users.find(u => u.customer_id === t.customer_id);
          return user ? { ...t, name: user.name, email: user.email } : t;
        });
      return { rows, rowCount: rows.length };
    }

    // ─── 3. STATISTICS / Complex GROUP BY ────────────────────────────────
    if (textUp.includes('COUNT(T.TRANSACTION_ID)') || textUp.includes('LEFT JOIN')) {
      const users = readTable('BankUser');
      const user  = users.find(u => u.customer_id === parseInt(params[0]));
      if (user) {
        return {
          rows: [{ ...user, total_transactions: 0, total_deposits: 0, total_withdrawals: 0, total_sent: 0, total_received: 0 }],
          rowCount: 1
        };
      }
      return { rows: [], rowCount: 0 };
    }

    // ─── 4. SELECT ────────────────────────────────────────────────────────
    if (textUp.startsWith('SELECT')) {
      const table = extractTable(text);
      if (!table) return { rows: [], rowCount: 0 };
      const data = readTable(table);
      let rows = data;

      if (textUp.includes('WHERE EMAIL =')) {
        rows = data.filter(u =>
          u.email?.toLowerCase().trim() === params[0]?.toLowerCase().trim()
        );
      } else if (textUp.includes('WHERE TOKEN_VALUE =')) {
        // Active tokens only (findActiveToken)
        rows = data.filter(t =>
          t.token_value === params[0] &&
          (t.is_active === true || t.is_active === 1)
        );
      } else if (textUp.includes('WHERE CUSTOMER_ID =')) {
        rows = data.filter(u => u.customer_id === parseInt(params[0]));
      }

      return { rows, rowCount: rows.length };
    }

    // ─── 5. INSERT ────────────────────────────────────────────────────────
    if (textUp.startsWith('INSERT INTO')) {
      const table = extractTable(text);
      const data  = readTable(table);
      const isJwt = textUp.includes('BANKUSERJWT');
      const idKey = isJwt ? 'token_id' : 'customer_id';
      const newId = data.length > 0 ? Math.max(...data.map(i => parseInt(i[idKey]) || 0)) + 1 : 1;

      let newItem = { [idKey]: newId, created_at: new Date().toISOString() };

      if (isJwt) {
        newItem = { ...newItem, customer_id: params[0], token_value: params[1], expiry_time: params[2], is_active: params[3] !== undefined ? params[3] : true };
      } else {
        // BankUser insert
        newItem = { ...newItem, name: params[0], email: params[1] ? params[1].toLowerCase().trim() : '', password: params[2], balance: parseFloat(params[3]) || 500, updated_at: new Date().toISOString() };
      }

      data.push(newItem);
      writeTable(table, data);
      return { rows: [newItem], rowCount: 1 };
    }

    // ─── 6. UPDATE ────────────────────────────────────────────────────────
    if (textUp.startsWith('UPDATE')) {
      const table = extractTable(text);
      const data  = readTable(table);
      let count   = 0;

      let updatedRows = [];
      if (textUp.includes('WHERE TOKEN_VALUE =')) {
        // Deactivate / update token by token_value (param[0])
        data.forEach(t => {
          if (t.token_value === params[0]) { t.is_active = false; count++; updatedRows.push(t); }
        });
      } else if (textUp.includes('WHERE CUSTOMER_ID =')) {
        // The WHERE id is always the LAST param
        const id = parseInt(params[params.length - 1]);
        const idx = data.findIndex(u => u.customer_id === id);
        if (idx !== -1) {
          if (textUp.includes('BALANCE ='))  data[idx].balance  = parseFloat(params[0]);
          if (textUp.includes('PASSWORD =')) data[idx].password = params[0];
          if (textUp.includes('NAME ='))     data[idx].name     = params[0];
          if (textUp.includes('EMAIL ='))    data[idx].email    = params[0]?.toLowerCase();
          data[idx].updated_at = new Date().toISOString();
          count = 1;
          updatedRows = [data[idx]];
        }
      } else if (textUp.includes('WHERE CUSTOMER_ID')) {
        const id = parseInt(params[params.length - 1]);
        data.forEach(t => {
          if (t.customer_id === id) { t.is_active = false; count++; updatedRows.push(t); }
        });
      }

      writeTable(table, data);
      return { rows: updatedRows, rowCount: count };
    }

    // ─── 7. DELETE ────────────────────────────────────────────────────────
    if (textUp.startsWith('DELETE')) {
      const table = extractTable(text);
      const data  = readTable(table);
      const prev  = data.length;
      const remaining = data.filter(r => r.customer_id !== parseInt(params[0]));
      writeTable(table, remaining);
      return { rows: [], rowCount: prev - remaining.length };
    }

    return { rows: [], rowCount: 0 };
  }

  async one(text, params = []) {
    const res = await this.query(text, params);
    return res.rows[0] || null;
  }

  async many(text, params = []) {
    const res = await this.query(text, params);
    return res.rows;
  }

  async transaction(callback) {
    // Pass a thin client that routes back to this.query
    return callback({ query: (t, p) => this.query(t, p) });
  }

  async healthCheck() {
    return { status: 'healthy', mode: 'local-file' };
  }

  async runMigrations() {
    console.log('✅ Mock DB: migrations skipped (using local file storage)');
  }
}

module.exports = new Database();
