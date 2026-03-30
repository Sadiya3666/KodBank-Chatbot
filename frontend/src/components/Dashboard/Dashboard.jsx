import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import useBalance from '../../hooks/useBalance';
import CheckBalance from './CheckBalance';
import TransferMoney from './TransferMoney';
import DepositMoney from './DepositMoney';
import TransactionHistory from './TransactionHistory';
import Passbook from './Passbook';
import './Dashboard.css';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const { fetchBalance } = useBalance();
  const [activeSection, setActiveSection] = useState('overview');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-content">
          <div className="logo-section">
            <h1 className="logo">KodBank</h1>
          </div>

          <div className="user-section">
            <div className="welcome-message">
              <span>Welcome, </span>
              <span className="user-name">{user?.name}</span>
            </div>

            <div className="user-info-brief">
              <span className="user-id">ID: {user?.customer_id}</span>
            </div>

            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="logout-button"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <nav className="dashboard-nav">
        <div className="nav-content">
          <button
            className={`nav-item ${activeSection === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveSection('overview')}
          >
            🏠 Overview
          </button>
          <button
            className={`nav-item ${activeSection === 'balance' ? 'active' : ''}`}
            onClick={() => setActiveSection('balance')}
          >
            💰 Check Balance
          </button>
          <button
            className={`nav-item ${activeSection === 'transfer' ? 'active' : ''}`}
            onClick={() => setActiveSection('transfer')}
          >
            💸 Transfer Money
          </button>
          <button
            className={`nav-item ${activeSection === 'deposit' ? 'active' : ''}`}
            onClick={() => setActiveSection('deposit')}
          >
            📥 Add Balance
          </button>
          <button
            className={`nav-item ${activeSection === 'history' ? 'active' : ''}`}
            onClick={() => setActiveSection('history')}
          >
            📊 History
          </button>
          <button
            className={`nav-item ${activeSection === 'passbook' ? 'active' : ''}`}
            onClick={() => setActiveSection('passbook')}
          >
            📖 Passbook
          </button>
        </div>
      </nav>

      <main className="dashboard-main">
        <div className="main-content">
          {activeSection === 'overview' && (
            <div className="overview-section">
              <h2>Account Overview</h2>

              {/* Quick Actions Card */}
              <div className="quick-actions-card">
                <div className="actions-header">
                  <h3>Quick Actions</h3>
                  <p>Common banking operations</p>
                </div>
                <div className="actions-grid">
                  <button onClick={() => setActiveSection('balance')} className="action-btn">
                    <span className="icon">💰</span> Check Balance
                  </button>
                  <button onClick={() => setActiveSection('transfer')} className="action-btn">
                    <span className="icon">💸</span> Send Money
                  </button>
                  <button onClick={() => setActiveSection('passbook')} className="action-btn">
                    <span className="icon">📖</span> View Passbook
                  </button>
                </div>
              </div>

              <div className="cards-grid">
                <div
                  className="bank-card balance-card"
                  onClick={() => setActiveSection('balance')}
                >
                  <div className="card-icon">💰</div>
                  <h3>Check Balance</h3>
                  <p>View your current account balance</p>
                  <button className="card-button">Check Balance</button>
                </div>

                <div
                  className="bank-card transfer-card"
                  onClick={() => setActiveSection('transfer')}
                >
                  <div className="card-icon">💸</div>
                  <h3>Transfer Money</h3>
                  <p>Send money to other customers</p>
                  <button className="card-button">Transfer Money</button>
                </div>

                <div
                  className="bank-card history-card"
                  onClick={() => setActiveSection('history')}
                >
                  <div className="card-icon">📊</div>
                  <h3>Statements</h3>
                  <p>View your digital transaction history</p>
                  <button className="card-button">View Statement</button>
                </div>

                <div
                  className="bank-card passbook-card"
                  onClick={() => setActiveSection('passbook')}
                >
                  <div className="card-icon">📖</div>
                  <h3>Virtual Passbook</h3>
                  <p>Access your traditional ledger book</p>
                  <button className="card-button">Open Passbook</button>
                </div>
              </div>

              <div className="recent-transactions">
                <h3>Recent Activity</h3>
                <TransactionHistory limit={5} showViewAll={true} onBack={() => setActiveSection('history')} />
              </div>
            </div>
          )}

          {activeSection === 'balance' && (
            <CheckBalance onBack={() => setActiveSection('overview')} />
          )}

          {activeSection === 'transfer' && (
            <TransferMoney onBack={() => setActiveSection('overview')} />
          )}

          {activeSection === 'deposit' && (
            <DepositMoney onBack={() => setActiveSection('overview')} />
          )}

          {activeSection === 'history' && (
            <TransactionHistory onBack={() => setActiveSection('overview')} />
          )}

          {activeSection === 'passbook' && (
            <Passbook onBack={() => setActiveSection('overview')} />
          )}
        </div>
      </main>

      {showLogoutConfirm && (
        <div className="modal-overlay">
          <div className="modal-content glass-card">
            <h3>Confirm Logout</h3>
            <p>Are you sure you want to end your session?</p>
            <div className="modal-footer">
              <button onClick={() => setShowLogoutConfirm(false)} className="btn-cancel">Cancel</button>
              <button onClick={handleLogout} className="btn-confirm">Logout</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;

