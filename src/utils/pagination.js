


function createPagination(page, limit, total) {
  const currentPage = Math.max(1, parseInt(page) || 1);
  const itemsPerPage = Math.max(1, parseInt(limit) || 10);
  const totalItems = Math.max(0, parseInt(total) || 0);
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / itemsPerPage);
  const offset = (currentPage - 1) * itemsPerPage;
  
  return {
    page: currentPage,
    limit: itemsPerPage,
    total: totalItems,
    totalPages: totalPages,
    hasNext: totalPages > 0 ? currentPage < totalPages : false,
    hasPrev: totalPages > 0 ? currentPage > 1 : false,
    offset
  };
}


function normalizePagination(query) {
  const limit = Math.min(Math.max(1, parseInt(query.limit) || 10), 100);
  
  let page = 1;
  if (query.page) {
    page = Math.max(1, parseInt(query.page) || 1);
  } else if (query.offset !== undefined) {
    const offset = Math.max(0, parseInt(query.offset) || 0);
    page = Math.floor(offset / limit) + 1;
  }
  
  const offset = (page - 1) * limit;
  
  return {
    page,
    limit,
    offset
  };
}


function calculateOffset(page, limit) {
  const currentPage = Math.max(1, parseInt(page) || 1);
  const itemsPerPage = Math.max(1, parseInt(limit) || 10);
  return (currentPage - 1) * itemsPerPage;
}


function calculatePage(offset, limit) {
  const currentOffset = Math.max(0, parseInt(offset) || 0);
  const itemsPerPage = Math.max(1, parseInt(limit) || 10);
  return Math.floor(currentOffset / itemsPerPage) + 1;
}

module.exports = {
  createPagination,
  calculateOffset,
  calculatePage,
  normalizePagination
};
