import React, { useState } from 'react';
import bankService from '../../services/bankService';
import { useBalance } from '../../hooks/useBalance';
import { useNotification } from '../../context/NotificationContext';
import confetti from 'canvas-confetti';
import './Dashboard.css';

const DepositMoney = ({ onBack }) => {
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('Account top-up');
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});
    const [showConfirm, setShowConfirm] = useState(false);

    const { refreshBalance } = useBalance();
    const { showNotification } = useNotification();

    const validateForm = () => {
        const newErrors = {};
        const depositAmount = parseFloat(amount);

        if (!amount) {
            newErrors.amount = 'Amount is required';
        } else if (isNaN(depositAmount) || depositAmount <= 0) {
            newErrors.amount = 'Please enter a valid positive amount';
        } else if (depositAmount > 50000) {
            newErrors.amount = 'Maximum deposit amount is ₹50,000 per transaction';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleInitiateDeposit = (e) => {
        e.preventDefault();
        if (validateForm()) {
            setShowConfirm(true);
        }
    };

    const handleConfirmDeposit = async () => {
        setShowConfirm(false);
        setLoading(true);
        try {
            const response = await bankService.deposit(parseFloat(amount), description);

            if (response.success) {
                showNotification(`Success! ₹${amount} has been added to your account.`, 'success');

                // Trigger Confetti
                confetti({
                    particleCount: 150,
                    spread: 70,
                    origin: { y: 0.6 },
                    colors: ['#10b981', '#6366f1', '#f59e0b']
                });

                await refreshBalance();
                setAmount('');
                setDescription('Account top-up');
            }
        } catch (error) {
            const errorMessage = error.message || 'Deposit failed. Please try again.';
            showNotification(errorMessage, 'error');
            setErrors({ general: errorMessage });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="transfer-section">
            <div className="section-header">
                <button onClick={onBack} className="back-button">
                    ← Back to Dashboard
                </button>
                <h2>Add Balance</h2>
            </div>

            <div className="transfer-container">
                <div className="transfer-card-large">
                    <div className="transfer-card-header">
                        <div className="icon-circle deposit">📥</div>
                        <div className="header-text">
                            <h3>Direct Deposit</h3>
                            <p>Add funds to your KodBank account instantly</p>
                        </div>
                    </div>

                    <form onSubmit={handleInitiateDeposit} className="transfer-form">
                        {errors.general && (
                            <div className="error-message">{errors.general}</div>
                        )}

                        <div className="form-group">
                            <label htmlFor="amount">Amount (₹)</label>
                            <div className="amount-input-wrapper">
                                <span className="currency-symbol">₹</span>
                                <input
                                    type="number"
                                    id="amount"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0.00"
                                    className={errors.amount ? 'error' : ''}
                                    disabled={loading}
                                />
                            </div>
                            {errors.amount && <span className="error-text">{errors.amount}</span>}
                            <div className="quick-amounts">
                                {[1000, 5000, 10000, 25000].map(val => (
                                    <button
                                        key={val}
                                        type="button"
                                        onClick={() => setAmount(val.toString())}
                                        className="quick-amount-btn"
                                    >
                                        +₹{val.toLocaleString()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="form-group">
                            <label htmlFor="description">Description (Optional)</label>
                            <input
                                type="text"
                                id="description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="e.g. Salary, Gift, etc."
                                disabled={loading}
                            />
                        </div>

                        <div className="deposit-notice">
                            <p>ℹ️ Funds will be available in your account immediately after processing.</p>
                        </div>

                        <button
                            type="submit"
                            className="transfer-submit-btn deposit-btn"
                            disabled={loading || !amount}
                        >
                            {loading ? (
                                <>
                                    <span className="spinner-small"></span>
                                    Processing Deposit...
                                </>
                            ) : (
                                `Deposit ₹${amount || '0'}`
                            )}
                        </button>
                    </form>
                </div>

                {showConfirm && (
                    <div className="modal-overlay">
                        <div className="modal-content glass-card">
                            <div className="modal-header">
                                <h2>Confirm Deposit</h2>
                            </div>
                            <div className="modal-body">
                                <p>You are about to deposit <strong>₹{parseFloat(amount).toLocaleString()}</strong> into your account.</p>
                                {description && <p>Description: <em>{description}</em></p>}
                                <p>Do you want to proceed?</p>
                            </div>
                            <div className="modal-footer">
                                <button onClick={() => setShowConfirm(false)} className="btn-cancel">Cancel</button>
                                <button onClick={handleConfirmDeposit} className="btn-confirm">Confirm & Add Funds</button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="transfer-sidebar">
                    <div className="transfer-info-card">
                        <h4>Security Verified</h4>
                        <p>Your transaction is encrypted and secured by KodBank 256-bit SSL protocols.</p>
                        <div className="security-icons">
                            <span>🔒 SSL</span>
                            <span>🛡️ Secured</span>
                        </div>
                    </div>

                    <div className="transfer-info-card limits">
                        <h4>Deposit Limits</h4>
                        <div className="limit-item">
                            <span>Daily Limit</span>
                            <span>₹1,00,000</span>
                        </div>
                        <div className="limit-item">
                            <span>Per Transaction</span>
                            <span>₹50,000</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DepositMoney;
