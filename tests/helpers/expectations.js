const paginationKeys = ['page', 'limit', 'total', 'totalPages', 'hasNext', 'hasPrev'];

function expectSuccessEnvelope(body, { paginated = false, dataType = 'array', meta = false } = {}) {
  expect(body).toHaveProperty('status', 'success');
  expect(body).not.toHaveProperty('error');
  expect(body).toHaveProperty('data');

  if (dataType === 'array') {
    expect(Array.isArray(body.data)).toBe(true);
  } else if (dataType === 'object') {
    expect(typeof body.data).toBe('object');
    expect(body.data).not.toBeNull();
  }

  if (paginated) {
    expect(body).toHaveProperty('pagination');
    paginationKeys.forEach((key) => {
      expect(body.pagination).toHaveProperty(key);
    });
  } else {
    expect(body.pagination ?? null).toBeNull();
  }

  if (meta) {
    expect(body).toHaveProperty('meta');
    if (Array.isArray(meta)) {
      meta.forEach((key) => {
        expect(body.meta).toHaveProperty(key);
      });
    }
  }
}

function expectStandardError(body) {
  expect(body).toHaveProperty('status', 'error');
  expect(body).toHaveProperty('message');
}

module.exports = {
  expectSuccessEnvelope,
  expectStandardError
};
