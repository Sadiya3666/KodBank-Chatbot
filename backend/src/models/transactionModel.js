const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Transaction model backed by local file storage
const DB_DIR = path.join(__dirname, '../../../mock_db');
const TX_FILE = path.join(DB_DIR, 'transactions.json');
const USER_FILE = path.join(DB_DIR, 'bankuser.json');

const readTx = () => {
  if (!fs.existsSync(TX_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(TX_FILE, 'utf8')); } catch { return []; }
};
const writeTx = (data) => fs.writeFileSync(TX_FILE, JSON.stringify(data, null, 2));
const readUsers = () => {
  if (!fs.existsSync(USER_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(USER_FILE, 'utf8')); } catch { return []; }
};
const writeUsers = (data) => fs.writeFileSync(USER_FILE, JSON.stringify(data, null, 2));

const getUserName = (id) => {
  const user = readUsers().find(u => u.customer_id === id);
  return user ? user.name : `User ${id}`;
};

class TransactionModel {

  // Execute a money transfer between two users
  async executeTransfer(fromCustomerId, toCustomerId, amount, description = 'Money transfer') {
    const txns = readTx();
    const users = readUsers();

    const sender = users.find(u => u.customer_id === fromCustomerId);
    const recipient = users.find(u => u.customer_id === toCustomerId);

    if (!sender) throw new Error('Sender not found');
    if (!recipient) throw new Error('Recipient not found');

    const newBalance = parseFloat(sender.balance) - parseFloat(amount);
    sender.balance = newBalance;
    recipient.balance = parseFloat(recipient.balance) + parseFloat(amount);
    writeUsers(users);

    const newId = txns.length > 0 ? Math.max(...txns.map(t => t.transaction_id)) + 1 : 1;
    const tx = {
      transaction_id: newId,
      from_customer_id: fromCustomerId,
      to_customer_id: toCustomerId,
      amount: parseFloat(amount),
      transaction_type: 'transfer',
      status: 'completed',
      description,
      transaction_date: new Date().toISOString(),
      from_customer_name: sender.name,
      to_customer_name: recipient.name
    };
    txns.unshift(tx);
    writeTx(txns);
    return tx;
  }

  // Execute a deposit
  async executeDeposit(customerId, amount, description = 'Deposit') {
    const users = readUsers();
    const user = users.find(u => u.customer_id === customerId);
    if (!user) throw new Error('User not found');
    
    user.balance = parseFloat(user.balance) + parseFloat(amount);
    writeUsers(users);

    const txns = readTx();
    const newId = txns.length > 0 ? Math.max(...txns.map(t => t.transaction_id)) + 1 : 1;
    const tx = {
      transaction_id: newId,
      from_customer_id: null,
      to_customer_id: customerId,
      amount: parseFloat(amount),
      transaction_type: 'deposit',
      status: 'completed',
      description,
      transaction_date: new Date().toISOString(),
      from_customer_name: 'External',
      to_customer_name: user.name
    };
    txns.unshift(tx);
    writeTx(txns);
    return tx;
  }

  // Execute a withdrawal
  async executeWithdrawal(customerId, amount, description = 'Withdrawal') {
    const users = readUsers();
    const user = users.find(u => u.customer_id === customerId);
    if (!user) throw new Error('User not found');
    
    user.balance = parseFloat(user.balance) - parseFloat(amount);
    writeUsers(users);

    const txns = readTx();
    const newId = txns.length > 0 ? Math.max(...txns.map(t => t.transaction_id)) + 1 : 1;
    const tx = {
      transaction_id: newId,
      from_customer_id: customerId,
      to_customer_id: null,
      amount: parseFloat(amount),
      transaction_type: 'withdrawal',
      status: 'completed',
      description,
      transaction_date: new Date().toISOString(),
      from_customer_name: user.name,
      to_customer_name: 'External'
    };
    txns.unshift(tx);
    writeTx(txns);
    return tx;
  }

  // Get user's transactions with filtering
  async getUserTransactions(customerId, options = {}) {
    const { limit = 10, offset = 0, transaction_type, status } = options;
    let txns = readTx().filter(t =>
      t.from_customer_id === customerId || t.to_customer_id === customerId
    );
    if (transaction_type) txns = txns.filter(t => t.transaction_type === transaction_type);
    if (status) txns = txns.filter(t => t.status === status);
    return txns.slice(offset, offset + limit);
  }

  // Get recent transactions for a user
  async getRecentTransactions(customerId, limit = 5) {
    const txns = readTx().filter(t =>
      t.from_customer_id === customerId || t.to_customer_id === customerId
    );
    return txns.slice(0, limit);
  }

  // Get total transaction count for a user
  async getUserTransactionCount(customerId, options = {}) {
    const { transaction_type, status } = options;
    let txns = readTx().filter(t =>
      t.from_customer_id === customerId || t.to_customer_id === customerId
    );
    if (transaction_type) txns = txns.filter(t => t.transaction_type === transaction_type);
    if (status) txns = txns.filter(t => t.status === status);
    return txns.length;
  }

  // Get user transaction statistics
  async getUserTransactionStatistics(customerId, start_date, end_date) {
    const txns = readTx().filter(t =>
      t.from_customer_id === customerId || t.to_customer_id === customerId
    );
    const sent = txns.filter(t => t.from_customer_id === customerId && t.transaction_type === 'transfer')
      .reduce((sum, t) => sum + t.amount, 0);
    const received = txns.filter(t => t.to_customer_id === customerId && t.transaction_type === 'transfer')
      .reduce((sum, t) => sum + t.amount, 0);
    return { net_transfers: received - sent };
  }

  // Get transaction summary (for charts)
  async getTransactionSummary(customerId, days = 30) {
    return []; // No chart data for local mode
  }

  // Find a transaction by ID
  async findById(transactionId) {
    return readTx().find(t => t.transaction_id === transactionId) || null;
  }

  // Get transactions by type
  async getTransactionsByType(customerId, type, limit = 20, offset = 0) {
    const txns = readTx().filter(t =>
      (t.from_customer_id === customerId || t.to_customer_id === customerId) &&
      t.transaction_type === type
    );
    return txns.slice(offset, offset + limit);
  }

  // Search transactions
  async searchTransactions(customerId, searchTerm, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const term = searchTerm.toLowerCase();
    const txns = readTx().filter(t =>
      (t.from_customer_id === customerId || t.to_customer_id === customerId) &&
      (
        t.description?.toLowerCase().includes(term) ||
        t.transaction_type?.toLowerCase().includes(term) ||
        t.from_customer_name?.toLowerCase().includes(term) ||
        t.to_customer_name?.toLowerCase().includes(term)
      )
    );
    return txns.slice(offset, offset + limit);
  }
}

module.exports = new TransactionModel();
