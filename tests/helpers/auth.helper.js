const request = require('supertest');
const app = require('../../src/app');

class AuthHelper {
  constructor() {
    this.tokens = {};
  }

  async createTestUser(email = 'test@ethnos.app', password = 'TestPass123@', role = 'user') {
    const userData = { email, password, role };
    
    try {
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);
      
      if (response.status === 201) {
        this.tokens[email] = {
          accessToken: response.body.data.accessToken,
          refreshToken: response.body.data.refreshToken,
          user: response.body.data.user
        };
        return this.tokens[email];
      } else {
        return await this.loginUser(email, password);
      }
    } catch (error) {
      return await this.loginUser(email, password);
    }
  }

  async loginUser(email, password) {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email, password });
    
    if (response.status === 200) {
      this.tokens[email] = {
        accessToken: response.body.data.accessToken,
        refreshToken: response.body.data.refreshToken,
        user: response.body.data.user
      };
      return this.tokens[email];
    }
    
    throw new Error(`Login failed: ${response.body.message}`);
  }

  getAuthHeader(email = 'test@ethnos.app') {
    const token = this.tokens[email];
    if (!token) {
      throw new Error(`No token found for user ${email}. Call createTestUser() first.`);
    }
    return `Bearer ${token.accessToken}`;
  }

  async authenticatedRequest(method, url, email = 'test@ethnos.app') {
    const authHeader = this.getAuthHeader(email);
    
    switch (method.toLowerCase()) {
      case 'get':
        return request(app).get(url).set('Authorization', authHeader);
      case 'post':
        return request(app).post(url).set('Authorization', authHeader);
      case 'put':
        return request(app).put(url).set('Authorization', authHeader);
      case 'delete':
        return request(app).delete(url).set('Authorization', authHeader);
      case 'patch':
        return request(app).patch(url).set('Authorization', authHeader);
      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }
  }

  async createAdminUser(email = 'admin@test.ethnos.app', password = 'AdminPass123@') {
    return await this.createTestUser(email, password, 'admin');
  }

  clearTokens() {
    this.tokens = {};
  }

  hasValidToken(email = 'test@ethnos.app') {
    return !!this.tokens[email]?.accessToken;
  }
}

module.exports = AuthHelper;