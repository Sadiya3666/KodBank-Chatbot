import React, { useState, useEffect } from 'react';
import bankService from '../../services/bankService';
import { useAuth } from '../../hooks/useAuth';
import './Dashboard.css';

const TransactionHistory = ({ onBack, limit = null, showViewAll = false }) => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    offset: 0,
    limit: limit || 10,
    total: 0
  });

  const [searchTerm, setSearchTerm] = useState('');

  const fetchTransactions = async (offset = 0, search = '') => {
    try {
      setLoading(true);
      let response;
      if (search) {
        response = await bankService.searchTransactions({ q: search, limit: pagination.limit, offset });
      } else {
        response = await bankService.getTransactionHistory({
          limit: pagination.limit,
          offset
        });
      }

      setTransactions(response.data.transactions);
      setPagination(prev => ({
        ...prev,
        total: response.data.total || response.data.count || response.data.transactions.length,
        offset
      }));
      setError(null);
    } catch (error) {
      setError(error.message || 'Failed to fetch transactions');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    const value = e.target.value;
    setSearchTerm(value);

    // Debounce search
    if (window.searchTimeout) clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(() => {
      fetchTransactions(0, value);
    }, 500);
  };

  useEffect(() => {
    fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (dateString, showTime = true) => {
    const options = {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    };
    if (showTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
    }
    return new Date(dateString).toLocaleString('en-IN', options);
  };

  const getAmountClass = (type, fromId) => {
    if (type === 'deposit') return 'amount-credit';
    if (type === 'withdrawal') return 'amount-debit';
    if (type === 'transfer') {
      return fromId === user?.id || fromId === user?.customer_id ? 'amount-debit' : 'amount-credit';
    }
    return '';
  };

  const handlePageChange = (newOffset) => {
    fetchTransactions(newOffset, searchTerm);
  };

  const handleExportCSV = () => {
    const csvContent = [
      ['Date', 'Type', 'Amount', 'Description', 'Status'],
      ...transactions.map(t => [
        formatDate(t.transaction_date),
        t.transaction_type,
        formatCurrency(t.amount),
        t.description || 'N/A',
        t.status
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading && transactions.length === 0) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">🔄</div>
        <p>Loading transactions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <div className="error-icon">❌</div>
        <p>{error}</p>
        <button onClick={() => fetchTransactions()} className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="transaction-history">
      {onBack && (
        <div className="section-header">
          <button onClick={onBack} className="back-button">
            ← Back
          </button>
          <h2>Transaction History</h2>
        </div>
      )}

      <div className="history-controls">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search transactions..."
            value={searchTerm}
            onChange={handleSearch}
            className="search-input"
          />
        </div>
        {!limit && (
          <div className="history-actions">
            <button onClick={handleExportCSV} className="export-button">
              📥 Export CSV
            </button>
          </div>
        )}
      </div>

      <div className="banking-table-container">
        <table className="banking-table">
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Reference No.</th>
              <th>Transaction Type</th>
              <th>Description</th>
              <th>Status</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan="6" className="empty-row">
                  No transactions found
                </td>
              </tr>
            ) : (
              transactions.map((transaction) => (
                <tr key={transaction.transaction_id}>
                  <td>{formatDate(transaction.transaction_date)}</td>
                  <td><span className="ref-no">#{transaction.transaction_id}</span></td>
                  <td>
                    <span className={`type-badge ${transaction.transaction_type}`}>
                      {transaction.transaction_type.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <div className="desc-cell">
                      {transaction.description || 'Banking Transaction'}
                      {transaction.transaction_type === 'transfer' && (
                        <span className="transfer-details">
                          {transaction.from_customer_id === user?.customer_id
                            ? `To: ${transaction.to_customer_id}`
                            : `From: ${transaction.from_customer_id}`}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`status-dot ${transaction.status}`}></span>
                    {transaction.status}
                  </td>
                  <td className={`text-right font-bold ${getAmountClass(transaction.transaction_type, transaction.from_customer_id)}`}>
                    {getAmountClass(transaction.transaction_type, transaction.from_customer_id) === 'amount-debit' ? '-' : '+'}
                    {formatCurrency(transaction.amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!limit && pagination.total > pagination.limit && (
        <div className="pagination">
          <button
            onClick={() => handlePageChange(Math.max(0, pagination.offset - pagination.limit))}
            disabled={pagination.offset === 0 || loading}
            className="pagination-button"
          >
            ← Previous
          </button>
          <span className="page-info">
            Page {Math.floor(pagination.offset / pagination.limit) + 1} of {Math.ceil(pagination.total / pagination.limit)}
          </span>
          <button
            onClick={() => handlePageChange(pagination.offset + pagination.limit)}
            disabled={pagination.offset + pagination.limit >= pagination.total || loading}
            className="pagination-button"
          >
            Next →
          </button>
        </div>
      )}

      {showViewAll && (
        <div className="view-all-container">
          <button onClick={onBack} className="view-all-button">
            View Full Statement
          </button>
        </div>
      )}
    </div>
  );
};

export default TransactionHistory;

