import React, { useState, useEffect } from 'react';
import bankService from '../../services/bankService';
import { useAuth } from '../../hooks/useAuth';
import './Dashboard.css';

const Passbook = ({ onBack }) => {
    const { user } = useAuth();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null); // eslint-disable-line no-unused-vars
    const [balance, setBalance] = useState(0);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                // Fetch balance first
                const balanceRes = await bankService.getBalance();
                setBalance(balanceRes.data.balance);

                // Fetch all transactions to show in passbook style
                const transRes = await bankService.getTransactionHistory({ limit: 100, offset: 0 });
                setData(transRes.data.transactions);
            } catch (err) {
                setError(err.message || 'Failed to sync passbook');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
        }).format(amount);
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit'
        });
    };

    return (
        <div className="passbook-section">
            <div className="section-header">
                <button onClick={onBack} className="back-button">← Back</button>
                <div className="passbook-header-info">
                    <h2>Virtual Passbook</h2>
                    <div className="balance-info">
                        <span className="label">Available Balance:</span>
                        <span className="value">{formatCurrency(balance)}</span>
                    </div>
                </div>
            </div>

            <div className="passbook-container">
                <div className="passbook-inner">
                    <div className="passbook-cover">
                        <div className="bank-branch">KODBANK - MAIN BRANCH</div>
                        <div className="account-holder">NAME: {user?.name?.toUpperCase()}</div>
                        <div className="account-no">A/C NO: {user?.customer_id?.toString().padStart(10, '0')}</div>
                    </div>

                    <table className="passbook-table">
                        <thead>
                            <tr>
                                <th>DATE</th>
                                <th>PARTICULARS</th>
                                <th>WITHDRAWAL (DR)</th>
                                <th>DEPOSIT (CR)</th>
                                <th className="text-right">BOOK STATUS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="5" className="text-center">Syncing...</td></tr>
                            ) : data.length === 0 ? (
                                <tr><td colSpan="5" className="text-center">No entries yet</td></tr>
                            ) : (
                                data.map((item, idx) => {
                                    const isDebit = item.transaction_type === 'withdrawal' ||
                                        (item.transaction_type === 'transfer' && item.from_customer_id === user?.customer_id);
                                    const isCredit = item.transaction_type === 'deposit' ||
                                        (item.transaction_type === 'transfer' && item.to_customer_id === user?.customer_id);

                                    return (
                                        <tr key={item.transaction_id}>
                                            <td>{formatDate(item.transaction_date)}</td>
                                            <td>
                                                <div className="particular-cell">
                                                    {item.description || 'TRANSFER'}
                                                    <span className="trans-id">Ref: {item.transaction_id}</span>
                                                </div>
                                            </td>
                                            <td className="amount-debit">{isDebit ? formatCurrency(item.amount) : '-'}</td>
                                            <td className="amount-credit">{isCredit ? formatCurrency(item.amount) : '-'}</td>
                                            <td className="text-right">
                                                <span className={`pass-status ${item.status}`}>{item.status.substring(0, 1).toUpperCase()}</span>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                    <div className="passbook-footer">
                        --- END OF ENTRIES AS ON {new Date().toLocaleDateString()} ---
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Passbook;
