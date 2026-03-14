const database = require('../config/database');
const logger = require('../utils/logger');

class JWTModel {
  constructor() {
    this.tableName = 'BankUserJwt';
  }

  // Store JWT token
  async storeToken(tokenData) {
    try {
      const { customer_id, token_value, expiry_time } = tokenData;

      const query = `
        INSERT INTO ${this.tableName} (customer_id, token_value, expiry_time, is_active) 
        VALUES ($1, $2, $3, $4) 
        RETURNING token_id, customer_id, created_at, expiry_time, is_active
      `;

      const result = await database.query(query, [customer_id, token_value, expiry_time, true]);

      logger.info('JWT token stored', {
        token_id: result.rows[0].token_id,
        customer_id
      });

      return result.rows[0];
    } catch (error) {
      logger.error('JWT token storage failed:', error);
      throw error;
    }
  }

  // Find active token by token value
  async findActiveToken(tokenValue) {
    try {
      const query = `
        SELECT token_id, customer_id, token_value, expiry_time, created_at, is_active 
        FROM ${this.tableName} 
        WHERE token_value = $1 AND is_active = TRUE
      `;

      const result = await database.query(query, [tokenValue]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Find active token failed:', error);
      throw error;
    }
  }

  // Find all active tokens for a user
  async findActiveTokensByUserId(customerId) {
    try {
      const query = `
        SELECT token_id, token_value, expiry_time, created_at, is_active 
        FROM ${this.tableName} 
        WHERE customer_id = $1 AND is_active = TRUE 
        ORDER BY created_at DESC
      `;

      const result = await database.query(query, [customerId]);
      return result.rows;
    } catch (error) {
      logger.error('Find active tokens by user ID failed:', error);
      throw error;
    }
  }

  // Deactivate token (logout)
  async deactivateToken(tokenValue) {
    try {
      const query = `
        UPDATE ${this.tableName} 
        SET is_active = FALSE 
        WHERE token_value = $1 
        RETURNING token_id, customer_id, is_active
      `;

      const result = await database.query(query, [tokenValue]);

      if (result.rows.length === 0) {
        logger.warn('Token not found for deactivation', { token_value: tokenValue });
        return null;
      }

      logger.info('JWT token deactivated', {
        token_id: result.rows[0].token_id,
        customer_id: result.rows[0].customer_id
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Token deactivation failed:', error);
      throw error;
    }
  }

  // Deactivate all tokens for a user
  async deactivateAllTokensForUser(customerId) {
    try {
      const query = `
        UPDATE ${this.tableName} 
        SET is_active = FALSE 
        WHERE customer_id = $1 AND is_active = TRUE 
        RETURNING token_id
      `;

      const result = await database.query(query, [customerId]);

      logger.info('All tokens deactivated for user', {
        customer_id,
        count: result.rows.length
      });

      return result.rows.length;
    } catch (error) {
      logger.error('Deactivate all tokens failed:', error);
      throw error;
    }
  }

  // Validate token exists and is active
  async validateToken(tokenValue) {
    try {
      const query = `
        SELECT t.token_id, t.customer_id, t.expiry_time, t.created_at,
               u.name, u.email
        FROM ${this.tableName} t
        JOIN BankUser u ON t.customer_id = u.customer_id
        WHERE t.token_value = $1 AND t.is_active = TRUE AND t.expiry_time > NOW()
      `;

      const result = await database.query(query, [tokenValue]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Token validation failed:', error);
      throw error;
    }
  }

  // Clean up expired tokens
  async cleanupExpiredTokens() {
    try {
      const query = `
        DELETE FROM ${this.tableName} 
        WHERE expiry_time < NOW() OR is_active = FALSE 
        RETURNING token_id
      `;

      const result = await database.query(query);

      logger.info('Expired tokens cleaned up', {
        count: result.rowCount
      });

      return result.rowCount;
    } catch (error) {
      logger.error('Expired tokens cleanup failed:', error);
      throw error;
    }
  }

  // Get token count for user
  async getTokenCountForUser(customerId, activeOnly = false) {
    try {
      let query = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE customer_id = $1`;
      const params = [customerId];

      if (activeOnly) {
        query += ' AND is_active = TRUE AND expiry_time > NOW()';
      }

      const result = await database.query(query, params);
      return parseInt(result.rows[0].count);
    } catch (error) {
      logger.error('Get token count failed:', error);
      throw error;
    }
  }

  // Get token details
  async getTokenDetails(tokenId) {
    try {
      const query = `
        SELECT t.token_id, t.customer_id, t.expiry_time, t.created_at, t.is_active,
               u.name, u.email
        FROM ${this.tableName} t
        JOIN BankUser u ON t.customer_id = u.customer_id
        WHERE t.token_id = $1
      `;

      const result = await database.query(query, [tokenId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Get token details failed:', error);
      throw error;
    }
  }

  // Get all tokens for user (including inactive)
  async getAllTokensForUser(customerId, limit = 50, offset = 0) {
    try {
      const query = `
        SELECT token_id, token_value, expiry_time, created_at, is_active 
        FROM ${this.tableName} 
        WHERE customer_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2 OFFSET $3
      `;

      const result = await database.query(query, [customerId, limit, offset]);
      return result.rows;
    } catch (error) {
      logger.error('Get all tokens for user failed:', error);
      throw error;
    }
  }

  // Extend token expiry
  async extendTokenExpiry(tokenValue, newExpiryTime) {
    try {
      const query = `
        UPDATE ${this.tableName} 
        SET expiry_time = $2 
        WHERE token_value = $1 AND is_active = TRUE 
        RETURNING token_id, customer_id, expiry_time
      `;

      const result = await database.query(query, [tokenValue, newExpiryTime]);

      if (result.rows.length === 0) {
        return null;
      }

      logger.info('Token expiry extended', {
        token_id: result.rows[0].token_id,
        customer_id: result.rows[0].customer_id
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Token expiry extension failed:', error);
      throw error;
    }
  }

  // Get tokens expiring soon
  async getTokensExpiringSoon(withinMinutes = 30) {
    try {
      const query = `
        SELECT t.token_id, t.customer_id, t.expiry_time, t.created_at,
               u.name, u.email
        FROM ${this.tableName} t
        JOIN BankUser u ON t.customer_id = u.customer_id
        WHERE t.is_active = TRUE 
        AND t.expiry_time BETWEEN NOW() AND NOW() + INTERVAL '${withinMinutes} minutes'
        ORDER BY t.expiry_time ASC
      `;

      const result = await database.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Get tokens expiring soon failed:', error);
      throw error;
    }
  }

  // Get token statistics
  async getTokenStatistics() {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_tokens,
          COUNT(CASE WHEN is_active = TRUE AND expiry_time > NOW() THEN 1 END) as active_tokens,
          COUNT(CASE WHEN is_active = FALSE OR expiry_time <= NOW() THEN 1 END) as inactive_tokens,
          COUNT(CASE WHEN expiry_time <= NOW() AND is_active = TRUE THEN 1 END) as expired_tokens,
          COUNT(CASE WHEN expiry_time > NOW() AND expiry_time <= NOW() + INTERVAL '1 hour' AND is_active = TRUE THEN 1 END) as expiring_soon
        FROM ${this.tableName}
      `;

      const result = await database.query(query);
      return result.rows[0];
    } catch (error) {
      logger.error('Get token statistics failed:', error);
      throw error;
    }
  }

  // Get daily token usage
  async getDailyTokenUsage(days = 30) {
    try {
      const query = `
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as tokens_created,
          COUNT(CASE WHEN is_active = TRUE THEN 1 END) as active_tokens
        FROM ${this.tableName} 
        WHERE created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `;

      const result = await database.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Get daily token usage failed:', error);
      throw error;
    }
  }

  // Blacklist token (alternative to deactivation)
  async blacklistToken(tokenValue) {
    try {
      return await this.deactivateToken(tokenValue);
    } catch (error) {
      logger.error('Token blacklisting failed:', error);
      throw error;
    }
  }

  // Check if token is blacklisted
  async isTokenBlacklisted(tokenValue) {
    try {
      const query = `
        SELECT 1 FROM ${this.tableName} 
        WHERE token_value = $1 AND (is_active = FALSE OR expiry_time <= NOW())
      `;

      const result = await database.query(query, [tokenValue]);
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Check if token is blacklisted failed:', error);
      return false;
    }
  }

  // Remove old inactive tokens (cleanup)
  async removeOldInactiveTokens(olderThanDays = 30) {
    try {
      const query = `
        DELETE FROM ${this.tableName} 
        WHERE (is_active = FALSE OR expiry_time <= NOW()) 
        AND created_at < NOW() - INTERVAL '${olderThanDays} days'
        RETURNING token_id
      `;

      const result = await database.query(query);

      logger.info('Old inactive tokens removed', {
        count: result.rowCount
      });

      return result.rowCount;
    } catch (error) {
      logger.error('Remove old inactive tokens failed:', error);
      throw error;
    }
  }

  // Create token blacklist table if not exists
  async createBlacklistTable() {
    try {
      const query = `
        CREATE TABLE IF NOT EXISTS blacklisted_tokens (
          id SERIAL PRIMARY KEY,
          token TEXT NOT NULL UNIQUE,
          expiry_time TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `;


      await database.query(query);
      logger.info('Blacklist table ensured');
    } catch (error) {
      logger.error('Create blacklist table failed:', error);
      throw error;
    }
  }
}

module.exports = new JWTModel();
