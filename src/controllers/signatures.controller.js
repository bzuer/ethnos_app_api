const signaturesService = require('../services/signatures.service');
const { validationResult } = require('express-validator');
const { logger } = require('../middleware/errorHandler');

class SignaturesController {
  /**
   * @swagger
   * /signatures:
   *   get:
   *     tags:
   *       - Signatures
   *     summary: Get all name signatures with pagination and filtering
   *     description: Retrieve a paginated list of academic name signatures with optional search functionality
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 20
   *         description: Number of signatures to return per page
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           minimum: 0
   *           default: 0
   *         description: Number of signatures to skip
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *         description: Search term to filter signatures by name
   *       - in: query
   *         name: sortBy
   *         schema:
   *           type: string
   *           enum: [signature, created_at, id]
   *           default: signature
   *         description: Field to sort by
   *       - in: query
   *         name: sortOrder
   *         schema:
   *           type: string
   *           enum: [ASC, DESC]
   *           default: ASC
   *         description: Sort order
   *     responses:
   *       200:
   *         description: List of signatures retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 signatures:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       id:
   *                         type: integer
   *                         description: Signature ID
   *                       signature:
   *                         type: string
   *                         description: Author name signature
   *                       created_at:
   *                         type: string
   *                         format: date-time
   *                         description: Creation timestamp
   *                       persons_count:
   *                         type: integer
   *                         description: Number of persons linked to this signature
   *                 pagination:
   *                   type: object
   *                   properties:
   *                     total:
   *                       type: integer
   *                       description: Total number of signatures
   *                     limit:
   *                       type: integer
   *                       description: Number of signatures per page
   *                     offset:
   *                       type: integer
   *                       description: Number of signatures skipped
   *                     pages:
   *                       type: integer
   *                       description: Total number of pages
   *       400:
   *         description: Invalid request parameters
   *       500:
   *         description: Internal server error
   */
  async getAllSignatures(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          status: 'error',
          error: 'Validation failed',
          message: 'Validation failed', 
          details: errors.array(),
          errors: errors.array() 
        });
      }

      const {
        limit = 20,
        offset = 0,
        search,
        sortBy = 'signature',
        sortOrder = 'ASC'
      } = req.query;

      const options = {
        limit: Math.min(parseInt(limit) || 20, 100),
        offset: parseInt(offset) || 0,
        search,
        sortBy,
        sortOrder,
        // Light mode: omit expensive counts for low-usage endpoint
        includeCounts: String(req.query.light || 'false').toLowerCase() !== 'true'
      };

      const result = await signaturesService.getAllSignatures(options);
      
      logger.info('Signatures list retrieved', {
        endpoint: '/signatures',
        count: result.signatures.length,
        total: result.pagination.total,
        page: options.limit ? Math.floor(options.offset / options.limit) + 1 : 1,
        responseTime: `${Date.now() - req.startTime}ms`
      });

      res.json({
        status: 'success',
        data: result.signatures,
        pagination: result.pagination
      });
    } catch (error) {
      logger.error('Error in getAllSignatures:', error);
      next(error);
    }
  }

  /**
   * @swagger
   * /signatures/{id}:
   *   get:
   *     tags:
   *       - Signatures
   *     summary: Get signature by ID
   *     description: Retrieve detailed information about a specific name signature
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Signature ID
   *     responses:
   *       200:
   *         description: Signature details retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 id:
   *                   type: integer
   *                   description: Signature ID
   *                 signature:
   *                   type: string
   *                   description: Author name signature
   *                 created_at:
   *                   type: string
   *                   format: date-time
   *                   description: Creation timestamp
   *                 persons_count:
   *                   type: integer
   *                   description: Number of persons linked to this signature
   *       404:
   *         description: Signature not found
   *       500:
   *         description: Internal server error
   */
  async getSignatureById(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          status: 'error',
          message: 'Validation failed', 
          errors: errors.array() 
        });
      }

      const { id } = req.params;
      
      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({ 
          status: 'error',
          message: 'Invalid signature ID' 
        });
      }

      const signature = await signaturesService.getSignatureById(parseInt(id));
      
      if (!signature) {
        return res.status(404).json({ 
          status: 'error',
          message: 'Signature not found' 
        });
      }

      logger.info(`Retrieved signature ${id}`, {
        endpoint: `/signatures/${id}`,
        signature: signature.signature,
        personsCount: signature.persons_count
      });

      res.json({
        status: 'success',
        ...signature
      });
    } catch (error) {
      logger.error(`Error in getSignatureById for ID ${req.params.id}:`, error);
      next(error);
    }
  }

  /**
   * @swagger
   * /signatures/{id}/persons:
   *   get:
   *     tags:
   *       - Signatures
   *     summary: Get persons linked to a signature
   *     description: Retrieve a paginated list of persons associated with a specific signature
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: Signature ID
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 20
   *         description: Number of persons to return per page
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           minimum: 0
   *           default: 0
   *         description: Number of persons to skip
   *     responses:
   *       200:
   *         description: Persons retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 persons:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       id:
   *                         type: integer
   *                         description: Person ID
   *                       preferred_name:
   *                         type: string
   *                         description: Person's preferred name
   *                       given_names:
   *                         type: string
   *                         description: Person's given names
   *                       family_name:
   *                         type: string
   *                         description: Person's family name
   *                       orcid:
   *                         type: string
   *                         nullable: true
   *                         description: ORCID identifier
   *                       is_verified:
   *                         type: integer
   *                         description: Verification status
   *                 pagination:
   *                   type: object
   *                   properties:
   *                     total:
   *                       type: integer
   *                       description: Total number of persons
   *                     limit:
   *                       type: integer
   *                       description: Number of persons per page
   *                     offset:
   *                       type: integer
   *                       description: Number of persons skipped
   *                     pages:
   *                       type: integer
   *                       description: Total number of pages
   *       400:
   *         description: Invalid parameters
   *       404:
   *         description: Signature not found
   *       500:
   *         description: Internal server error
   */
  async getSignaturePersons(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          status: 'error',
          message: 'Validation failed', 
          errors: errors.array() 
        });
      }

      const { id } = req.params;
      const { limit = 20, offset = 0 } = req.query;
      
      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({ 
          status: 'error',
          message: 'Invalid signature ID' 
        });
      }

      const options = {
        limit: Math.min(parseInt(limit) || 20, 100),
        offset: parseInt(offset) || 0
      };

      const result = await signaturesService.getSignaturePersons(parseInt(id), options);
      
      if (!result) {
        return res.status(404).json({ 
          status: 'error',
          message: 'Signature not found' 
        });
      }

      logger.info(`Retrieved ${result.persons.length} persons for signature ${id}`, {
        endpoint: `/signatures/${id}/persons`,
        options,
        total: result.pagination.total
      });

      res.json({
        status: 'success',
        persons: result.persons,
        pagination: result.pagination
      });
    } catch (error) {
      logger.error(`Error in getSignaturePersons for signature ${req.params.id}:`, error);
      next(error);
    }
  }

  /**
   * @swagger
   * /signatures/statistics:
   *   get:
   *     tags:
   *       - Signatures
   *     summary: Get signature statistics
   *     description: Retrieve statistical information about all signatures in the database
   *     responses:
   *       200:
   *         description: Signature statistics retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 total_signatures:
   *                   type: integer
   *                   description: Total number of signatures
   *                 short_signatures:
   *                   type: integer
   *                   description: Number of signatures with 10 or fewer characters
   *                 medium_signatures:
   *                   type: integer
   *                   description: Number of signatures with 11-20 characters
   *                 long_signatures:
   *                   type: integer
   *                   description: Number of signatures with more than 20 characters
   *                 avg_signature_length:
   *                   type: number
   *                   description: Average signature length
   *                 linked_signatures:
   *                   type: integer
   *                   description: Number of signatures linked to persons
   *                 unlinked_signatures:
   *                   type: integer
   *                   description: Number of signatures not linked to persons
   *       500:
   *         description: Internal server error
   */
  async getSignatureStatistics(req, res, next) {
    try {
      const stats = await signaturesService.getSignatureStatistics();
      
      logger.info('Retrieved signature statistics', {
        endpoint: '/signatures/statistics',
        totalSignatures: stats.total_signatures
      });

      res.json({
        status: 'success',
        data: stats,
        ...stats
      });
    } catch (error) {
      logger.error('Error in getSignatureStatistics:', error);
      next(error);
    }
  }

  /**
   * @swagger
   * /signatures/search:
   *   get:
   *     tags:
   *       - Signatures
   *     summary: Search signatures
   *     description: Search for signatures by name with optional exact matching
   *     parameters:
   *       - in: query
   *         name: q
   *         required: true
   *         schema:
   *           type: string
   *         description: Search term for signature name
   *       - in: query
   *         name: exact
   *         schema:
   *           type: boolean
   *           default: false
   *         description: Whether to perform exact matching
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 20
   *         description: Number of results to return per page
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           minimum: 0
   *           default: 0
   *         description: Number of results to skip
   *     responses:
   *       200:
   *         description: Search results retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 signatures:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       id:
   *                         type: integer
   *                         description: Signature ID
   *                       signature:
   *                         type: string
   *                         description: Author name signature
   *                       created_at:
   *                         type: string
   *                         format: date-time
   *                         description: Creation timestamp
   *                       persons_count:
   *                         type: integer
   *                         description: Number of persons linked to this signature
   *                 pagination:
   *                   type: object
   *                   properties:
   *                     total:
   *                       type: integer
   *                       description: Total number of matching signatures
   *                     limit:
   *                       type: integer
   *                       description: Number of signatures per page
   *                     offset:
   *                       type: integer
   *                       description: Number of signatures skipped
   *                     pages:
   *                       type: integer
   *                       description: Total number of pages
   *                 searchTerm:
   *                   type: string
   *                   description: The search term used
   *                 exact:
   *                   type: boolean
   *                   description: Whether exact matching was used
   *       400:
   *         description: Missing or invalid search parameters
   *       500:
   *         description: Internal server error
   */
  async getSignatureWorks(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { id } = req.params;
      const { page = 1, limit = 20 } = req.query;
      
      const result = await signaturesService.getSignatureWorks(id, { page, limit });
      
      if (!result) {
        return res.status(404).json({
          status: 'error',
          message: `Signature with ID ${id} not found`
        });
      }

      logger.info(`Signature ${id} works retrieved: ${result.data.length} items`);
      
      res.json({
        status: 'success',
        ...result
      });
    } catch (error) {
      logger.error(`Error retrieving works for signature ${req.params.id}:`, error);
      next(error);
    }
  }

  async searchSignatures(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          status: 'error',
          message: 'Validation failed', 
          errors: errors.array() 
        });
      }

      const { q, exact = false, limit = 20, offset = 0 } = req.query;
      
      if (!q || q.trim().length === 0) {
        return res.status(400).json({ 
          status: 'error',
          message: 'Search query (q) parameter is required' 
        });
      }

      const options = {
        limit: Math.min(parseInt(limit) || 20, 100),
        offset: parseInt(offset) || 0,
        exact: exact === 'true' || exact === true
      };

      const result = await signaturesService.searchSignatures(q.trim(), options);
      
      logger.info(`Found ${result.signatures.length} signatures matching search`, {
        endpoint: '/signatures/search',
        searchTerm: q,
        exact: options.exact,
        total: result.pagination.total
      });

      res.json({
        status: 'success',
        data: result.signatures,
        pagination: result.pagination,
        searchTerm: q.trim(),
        exact: options.exact
      });
    } catch (error) {
      logger.error(`Error in searchSignatures for query "${req.query.q}":`, error);
      next(error);
    }
  }
}

module.exports = new SignaturesController();
