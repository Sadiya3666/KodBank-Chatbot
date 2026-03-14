
-- KodBank Database Schema
-- Created on: 2026-02-19
-- Description: Complete database schema for KodBank application

-- Drop tables if they exist (for clean migration)
DROP TABLE IF EXISTS Transactions CASCADE;
DROP TABLE IF EXISTS BankUserJwt CASCADE;
DROP TABLE IF EXISTS BankUser CASCADE;

-- Create BankUser table
CREATE TABLE BankUser (
    customer_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,  -- Hashed password (bcrypt)
    balance DECIMAL(15, 2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create BankUserJwt table for token management
CREATE TABLE BankUserJwt (
    token_id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    token_value TEXT NOT NULL,
    expiry_time TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (customer_id) REFERENCES BankUser(customer_id) ON DELETE CASCADE
);

-- Create Transactions table for transaction history
CREATE TABLE Transactions (
    transaction_id SERIAL PRIMARY KEY,
    from_customer_id INTEGER NOT NULL,
    to_customer_id INTEGER,
    amount DECIMAL(15, 2) NOT NULL,
    transaction_type VARCHAR(20) NOT NULL,  -- 'transfer', 'deposit', 'withdrawal'
    transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'completed',  -- 'completed', 'pending', 'failed'
    description TEXT,
    FOREIGN KEY (from_customer_id) REFERENCES BankUser(customer_id),
    FOREIGN KEY (to_customer_id) REFERENCES BankUser(customer_id)
);

-- Create indexes for better performance
CREATE INDEX idx_bankuser_email ON BankUser(email);
CREATE INDEX idx_bankuser_created_at ON BankUser(created_at);
CREATE INDEX idx_bankuserjwt_customer_id ON BankUserJwt(customer_id);
CREATE INDEX idx_bankuserjwt_token_value ON BankUserJwt(token_value);
CREATE INDEX idx_bankuserjwt_expiry_time ON BankUserJwt(expiry_time);
CREATE INDEX idx_transactions_from_customer ON Transactions(from_customer_id);
CREATE INDEX idx_transactions_to_customer ON Transactions(to_customer_id);
CREATE INDEX idx_transactions_date ON Transactions(transaction_date);
CREATE INDEX idx_transactions_type ON Transactions(transaction_type);
CREATE INDEX idx_transactions_status ON Transactions(status);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for BankUser table
CREATE TRIGGER update_bankuser_updated_at 
    BEFORE UPDATE ON BankUser 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add constraints for transaction amounts
ALTER TABLE Transactions ADD CONSTRAINT chk_amount_positive 
    CHECK (amount > 0);

-- Add constraints for transaction types
ALTER TABLE Transactions ADD CONSTRAINT chk_transaction_type 
    CHECK (transaction_type IN ('transfer', 'deposit', 'withdrawal'));

-- Add constraints for transaction status
ALTER TABLE Transactions ADD CONSTRAINT chk_transaction_status 
    CHECK (status IN ('completed', 'pending', 'failed'));

-- Add constraints for balance
ALTER TABLE BankUser ADD CONSTRAINT chk_balance_non_negative 
    CHECK (balance >= 0);

-- Add constraints for email format
ALTER TABLE BankUser ADD CONSTRAINT chk_email_format 
    CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- Add constraints for name
ALTER TABLE BankUser ADD CONSTRAINT chk_name_length 
    CHECK (LENGTH(TRIM(name)) >= 2 AND LENGTH(TRIM(name)) <= 100);

-- Create function to clean up expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM BankUserJwt 
    WHERE expiry_time < CURRENT_TIMESTAMP OR is_active = FALSE;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to validate transfer
CREATE OR REPLACE FUNCTION validate_transfer(
    p_from_customer_id INTEGER,
    p_to_customer_id INTEGER,
    p_amount DECIMAL
)
RETURNS BOOLEAN AS $$
DECLARE
    from_balance DECIMAL;
    from_exists BOOLEAN;
    to_exists BOOLEAN;
BEGIN
    -- Check if sender exists
    SELECT EXISTS(SELECT 1 FROM BankUser WHERE customer_id = p_from_customer_id) 
    INTO from_exists;
    
    IF NOT from_exists THEN
        RETURN FALSE;
    END IF;
    
    -- Check if recipient exists (for transfers)
    IF p_to_customer_id IS NOT NULL THEN
        SELECT EXISTS(SELECT 1 FROM BankUser WHERE customer_id = p_to_customer_id) 
        INTO to_exists;
        
        IF NOT to_exists THEN
            RETURN FALSE;
        END IF;
    END IF;
    
    -- Check if sender has sufficient balance
    SELECT balance INTO from_balance 
    FROM BankUser 
    WHERE customer_id = p_from_customer_id;
    
    IF from_balance < p_amount THEN
        RETURN FALSE;
    END IF;
    
    -- Check if transferring to self
    IF p_from_customer_id = p_to_customer_id THEN
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Create function to execute transfer
CREATE OR REPLACE FUNCTION execute_transfer(
    p_from_customer_id INTEGER,
    p_to_customer_id INTEGER,
    p_amount DECIMAL,
    p_description TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    transaction_id_val INTEGER;
    from_balance DECIMAL;
    to_balance DECIMAL;
BEGIN
    -- Lock the rows to prevent concurrent modifications
    SELECT balance INTO from_balance 
    FROM BankUser 
    WHERE customer_id = p_from_customer_id 
    FOR UPDATE;
    
    IF p_to_customer_id IS NOT NULL THEN
        SELECT balance INTO to_balance 
        FROM BankUser 
        WHERE customer_id = p_to_customer_id 
        FOR UPDATE;
    END IF;
    
    -- Validate transfer
    IF NOT validate_transfer(p_from_customer_id, p_to_customer_id, p_amount) THEN
        RAISE EXCEPTION 'Invalid transfer';
    END IF;
    
    -- Deduct from sender
    UPDATE BankUser 
    SET balance = balance - p_amount 
    WHERE customer_id = p_from_customer_id;
    
    -- Add to recipient
    IF p_to_customer_id IS NOT NULL THEN
        UPDATE BankUser 
        SET balance = balance + p_amount 
        WHERE customer_id = p_to_customer_id;
    END IF;
    
    -- Create transaction record
    INSERT INTO Transactions (
        from_customer_id, 
        to_customer_id, 
        amount, 
        transaction_type, 
        status, 
        description
    ) VALUES (
        p_from_customer_id, 
        p_to_customer_id, 
        p_amount, 
        'transfer', 
        'completed', 
        p_description
    ) RETURNING transaction_id INTO transaction_id_val;
    
    RETURN transaction_id_val;
END;
$$ LANGUAGE plpgsql;

-- Create function to deposit money
CREATE OR REPLACE FUNCTION deposit_money(
    p_customer_id INTEGER,
    p_amount DECIMAL,
    p_description TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    transaction_id_val INTEGER;
BEGIN
    -- Validate input
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be positive';
    END IF;
    
    IF NOT EXISTS(SELECT 1 FROM BankUser WHERE customer_id = p_customer_id) THEN
        RAISE EXCEPTION 'Customer not found';
    END IF;
    
    -- Add money to account
    UPDATE BankUser 
    SET balance = balance + p_amount 
    WHERE customer_id = p_customer_id;
    
    -- Create transaction record
    INSERT INTO Transactions (
        from_customer_id, 
        amount, 
        transaction_type, 
        status, 
        description
    ) VALUES (
        p_customer_id, 
        p_amount, 
        'deposit', 
        'completed', 
        p_description
    ) RETURNING transaction_id INTO transaction_id_val;
    
    RETURN transaction_id_val;
END;
$$ LANGUAGE plpgsql;

-- Create function to withdraw money
CREATE OR REPLACE FUNCTION withdraw_money(
    p_customer_id INTEGER,
    p_amount DECIMAL,
    p_description TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    transaction_id_val INTEGER;
    current_balance DECIMAL;
BEGIN
    -- Validate input
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be positive';
    END IF;
    
    -- Check if customer exists and get balance
    SELECT balance INTO current_balance
    FROM BankUser 
    WHERE customer_id = p_customer_id;
    
    IF current_balance IS NULL THEN
        RAISE EXCEPTION 'Customer not found';
    END IF;
    
    IF current_balance < p_amount THEN
        RAISE EXCEPTION 'Insufficient balance';
    END IF;
    
    -- Deduct money from account
    UPDATE BankUser 
    SET balance = balance - p_amount 
    WHERE customer_id = p_customer_id;
    
    -- Create transaction record
    INSERT INTO Transactions (
        from_customer_id, 
        amount, 
        transaction_type, 
        status, 
        description
    ) VALUES (
        p_customer_id, 
        p_amount, 
        'withdrawal', 
        'completed', 
        p_description
    ) RETURNING transaction_id INTO transaction_id_val;
    
    RETURN transaction_id_val;
END;
$$ LANGUAGE plpgsql;

-- Create view for transaction summary
CREATE VIEW transaction_summary AS
SELECT 
    t.transaction_id,
    t.from_customer_id,
    t.to_customer_id,
    t.amount,
    t.transaction_type,
    t.status,
    t.transaction_date,
    t.description,
    from_user.name as from_customer_name,
    to_user.name as to_customer_name
FROM Transactions t
LEFT JOIN BankUser from_user ON t.from_customer_id = from_user.customer_id
LEFT JOIN BankUser to_user ON t.to_customer_id = to_user.customer_id;

-- Create view for customer dashboard
CREATE VIEW customer_dashboard AS
SELECT 
    u.customer_id,
    u.name,
    u.email,
    u.balance,
    u.created_at,
    u.updated_at,
    COUNT(t.transaction_id) as total_transactions,
    COALESCE(SUM(CASE WHEN t.transaction_type = 'deposit' THEN t.amount ELSE 0 END), 0) as total_deposits,
    COALESCE(SUM(CASE WHEN t.transaction_type = 'withdrawal' THEN t.amount ELSE 0 END), 0) as total_withdrawals,
    COALESCE(SUM(CASE WHEN t.transaction_type = 'transfer' AND t.from_customer_id = u.customer_id THEN t.amount ELSE 0 END), 0) as total_sent,
    COALESCE(SUM(CASE WHEN t.transaction_type = 'transfer' AND t.to_customer_id = u.customer_id THEN t.amount ELSE 0 END), 0) as total_received
FROM BankUser u
LEFT JOIN Transactions t ON (t.from_customer_id = u.customer_id OR t.to_customer_id = u.customer_id)
GROUP BY u.customer_id, u.name, u.email, u.balance, u.created_at, u.updated_at;

-- Create trigger to automatically set is_active to false for expired tokens
CREATE OR REPLACE FUNCTION deactivate_expired_tokens()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE BankUserJwt 
    SET is_active = FALSE 
    WHERE expiry_time < CURRENT_TIMESTAMP AND is_active = TRUE;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger that runs before any query on BankUserJwt (optional)
-- This is a simple way to ensure expired tokens are deactivated
-- Note: This might impact performance, so use with caution
-- CREATE TRIGGER trigger_deactivate_expired_tokens
--     BEFORE SELECT ON BankUserJwt
--     EXECUTE FUNCTION deactivate_expired_tokens();

-- Grant permissions (adjust as needed for your setup)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO kodbank_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO kodbank_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO kodbank_user;

-- Create initial admin user (optional - for setup)
-- This will be created by the seed script instead

COMMENT ON TABLE BankUser IS 'Core user table storing customer information';
COMMENT ON TABLE BankUserJwt IS 'JWT token management table for authentication';
COMMENT ON TABLE Transactions IS 'Transaction history table storing all banking transactions';

COMMENT ON COLUMN BankUser.customer_id IS 'Primary key for customer identification';
COMMENT ON COLUMN BankUser.name IS 'Full name of the customer';
COMMENT ON COLUMN BankUser.email IS 'Unique email address for login';
COMMENT ON COLUMN BankUser.password IS 'Hashed password using bcrypt';
COMMENT ON COLUMN BankUser.balance IS 'Current account balance';

COMMENT ON COLUMN BankUserJwt.token_id IS 'Primary key for token identification';
COMMENT ON COLUMN BankUserJwt.customer_id IS 'Foreign key referencing the customer';
COMMENT ON COLUMN BankUserJwt.token_value IS 'JWT token string';
COMMENT ON COLUMN BankUserJwt.expiry_time IS 'Token expiration timestamp';
COMMENT ON COLUMN BankUserJwt.is_active IS 'Flag to indicate if token is active';

COMMENT ON COLUMN Transactions.transaction_id IS 'Primary key for transaction identification';
COMMENT ON COLUMN Transactions.from_customer_id IS 'Customer sending money or performing action';
COMMENT ON COLUMN Transactions.to_customer_id IS 'Customer receiving money (NULL for deposits/withdrawals)';
COMMENT ON COLUMN Transactions.amount IS 'Transaction amount';
COMMENT ON COLUMN Transactions.transaction_type IS 'Type: transfer, deposit, withdrawal';
COMMENT ON COLUMN Transactions.status IS 'Status: completed, pending, failed';
COMMENT ON COLUMN Transactions.description IS 'Optional transaction description';

-- Migration completed successfully
-- Version: 001
-- Date: 2026-02-19
