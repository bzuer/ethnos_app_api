#!/usr/bin/env node

/**
 * Script para corrigir dados inconsistentes dos venues
 * 
 * Este script:
 * 1. Atualiza works_count com dados reais da tabela publications
 * 2. Corrige período de cobertura (coverage_start_year/coverage_end_year)  
 * 3. Reconstrói a tabela venue_yearly_stats com dados corretos
 * 4. Atualiza métricas de citações
 */

try { require('dotenv').config({ path: '/etc/node-backend.env' }); } catch (_) {}
const { pool } = require('../src/config/database');

const logger = {
  info: (msg, data = '') => console.log(`[INFO] ${msg}`, data),
  error: (msg, data = '') => console.error(`[ERROR] ${msg}`, data),
  warn: (msg, data = '') => console.warn(`[WARN] ${msg}`, data)
};

async function verifyInconsistencies() {
  logger.info('Verificando inconsistências antes da correção...');
  
  const [inconsistencies] = await pool.execute(`
    SELECT 
      COUNT(*) as total_venues,
      SUM(CASE WHEN v.works_count != COALESCE(pub_counts.actual_count, 0) THEN 1 ELSE 0 END) as count_inconsistencies,
      SUM(CASE WHEN v.coverage_start_year != pub_counts.min_year OR v.coverage_end_year != pub_counts.max_year THEN 1 ELSE 0 END) as coverage_inconsistencies
    FROM venues v
    LEFT JOIN (
      SELECT 
        venue_id, 
        COUNT(*) as actual_count,
        MIN(year) as min_year,
        MAX(year) as max_year
      FROM publications 
      WHERE venue_id IS NOT NULL
      GROUP BY venue_id
    ) pub_counts ON v.id = pub_counts.venue_id
  `);
  
  const stats = inconsistencies[0];
  logger.info('Estatísticas de inconsistências:', {
    total_venues: stats.total_venues,
    count_inconsistencies: stats.count_inconsistencies,
    coverage_inconsistencies: stats.coverage_inconsistencies
  });
  
  return stats;
}

async function fixWorksCount() {
  logger.info('Corrigindo works_count...');
  
  const [result] = await pool.execute(`
    UPDATE venues v 
    SET works_count = (
        SELECT COUNT(p.id) 
        FROM publications p 
        WHERE p.venue_id = v.id
    )
  `);
  
  logger.info(`works_count atualizado para ${result.affectedRows} venues`);
}

async function fixCoveragePeriod() {
  logger.info('Corrigindo período de cobertura...');
  
  const [result] = await pool.execute(`
    UPDATE venues v 
    SET 
        coverage_start_year = (
            SELECT MIN(p.year) 
            FROM publications p 
            WHERE p.venue_id = v.id AND p.year IS NOT NULL
        ),
        coverage_end_year = (
            SELECT MAX(p.year) 
            FROM publications p 
            WHERE p.venue_id = v.id AND p.year IS NOT NULL
        )
  `);
  
  logger.info(`Período de cobertura atualizado para ${result.affectedRows} venues`);
}

async function rebuildYearlyStats() {
  logger.info('Reconstruindo venue_yearly_stats...');
  
  // Primeiro, backup dos dados antigos (opcional)
  logger.info('Criando backup da tabela venue_yearly_stats...');
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS venue_yearly_stats_backup_${new Date().toISOString().slice(0,10).replace(/-/g,'')} 
    AS SELECT * FROM venue_yearly_stats
  `);
  
  // Limpar dados antigos
  await pool.execute('DELETE FROM venue_yearly_stats');
  logger.info('Dados antigos removidos da venue_yearly_stats');
  
  // Inserir dados corretos
  const [result] = await pool.execute(`
    INSERT INTO venue_yearly_stats (venue_id, year, works_count, oa_works_count, cited_by_count)
    SELECT 
        p.venue_id,
        p.year,
        COUNT(*) as works_count,
        SUM(CASE WHEN p.open_access = 1 THEN 1 ELSE 0 END) as oa_works_count,
        SUM(COALESCE(w.cited_by_count, 0)) as cited_by_count
    FROM publications p
    LEFT JOIN works w ON p.work_id = w.id
    WHERE p.venue_id IS NOT NULL 
        AND p.year IS NOT NULL
        AND p.year BETWEEN 1800 AND 2030
    GROUP BY p.venue_id, p.year
    ORDER BY p.venue_id, p.year
  `);
  
  logger.info(`${result.affectedRows} registros inseridos na venue_yearly_stats`);
}

async function fixCitationCounts() {
  logger.info('Corrigindo contadores de citações...');
  
  const [result] = await pool.execute(`
    UPDATE venues v 
    SET cited_by_count = (
        SELECT SUM(COALESCE(w.cited_by_count, 0))
        FROM publications p
        LEFT JOIN works w ON p.work_id = w.id
        WHERE p.venue_id = v.id
    )
  `);
  
  logger.info(`Contadores de citação atualizados para ${result.affectedRows} venues`);
}

async function generateReport() {
  logger.info('Gerando relatório final...');
  
  const [stats] = await pool.execute(`
    SELECT 
        'Total venues' as metric,
        COUNT(*) as value
    FROM venues
    UNION ALL
    SELECT 
        'Venues with publications' as metric,
        COUNT(*) as value
    FROM venues 
    WHERE works_count > 0
    UNION ALL
    SELECT 
        'Total yearly stats records' as metric,
        COUNT(*) as value
    FROM venue_yearly_stats
    UNION ALL
    SELECT 
        'Venues with coverage period' as metric,
        COUNT(*) as value
    FROM venues 
    WHERE coverage_start_year IS NOT NULL AND coverage_end_year IS NOT NULL
  `);
  
  console.log('\n=== RELATÓRIO FINAL ===');
  stats.forEach(stat => {
    console.log(`${stat.metric}: ${stat.value}`);
  });
  
  // Verificar se ainda há inconsistências
  const finalCheck = await verifyInconsistencies();
  console.log('\n=== VERIFICAÇÃO FINAL ===');
  if (finalCheck.count_inconsistencies === 0 && finalCheck.coverage_inconsistencies === 0) {
    console.log('✅ Todas as inconsistências foram corrigidas!');
  } else {
    console.log('⚠️  Ainda existem algumas inconsistências:');
    console.log(`   Contagem: ${finalCheck.count_inconsistencies}`);
    console.log(`   Cobertura: ${finalCheck.coverage_inconsistencies}`);
  }
}

async function main() {
  let connection;
  
  try {
    logger.info('=== INICIANDO CORREÇÃO DOS DADOS DE VENUES ===');
    
    // Verificar inconsistências antes da correção
    await verifyInconsistencies();
    
    // Perguntar confirmação (em ambiente de produção)
    if (process.env.NODE_ENV === 'production') {
      logger.warn('⚠️  Executando em ambiente de produção!');
      logger.warn('Este script irá modificar dados. Certifique-se de ter um backup.');
      // Em um cenário real, adicionar prompt de confirmação aqui
    }
    
    // Executar correções
    await fixWorksCount();
    await fixCoveragePeriod();
    await rebuildYearlyStats();
    await fixCitationCounts();
    
    // Gerar relatório
    await generateReport();
    
    logger.info('=== CORREÇÃO CONCLUÍDA COM SUCESSO ===');
    
  } catch (error) {
    logger.error('Erro durante a correção:', error.message);
    logger.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    if (connection) {
      await pool.end();
    }
  }
}

// Executar script se chamado diretamente
if (require.main === module) {
  main();
}

module.exports = { main, verifyInconsistencies, fixWorksCount, fixCoveragePeriod, rebuildYearlyStats, fixCitationCounts };
