const { responseFormatter } = require('../../src/middleware/responseFormatter');

function createMockReq({
  method = 'GET',
  path = '/',
  headers = {},
  query = {},
  params = {},
  body = {},
} = {}) {
  return {
    method,
    originalUrl: path,
    url: path,
    path,
    headers: { ...headers },
    get(name) {
      if (!name) return undefined;
      return this.headers[String(name).toLowerCase()];
    },
    query: { ...query },
    params: { ...params },
    body: { ...body },
  };
}

function createMockRes() {
  const headers = {};
  const res = {
    statusCode: 200,
    body: undefined,
    headers,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return headers[name.toLowerCase()];
    },
    removeHeader(name) {
      delete headers[name.toLowerCase()];
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.__sent = true;
      if (typeof this.__resolve === 'function') {
        try { this.__resolve({ res: this }); } catch (_) {}
      }
      return this;
    },
  };
  return res;
}

function withResponseFormatter(req, res) {
  responseFormatter(req, res, () => {});
  return res;
}

module.exports = {
  createMockReq,
  createMockRes,
  withResponseFormatter,
};
