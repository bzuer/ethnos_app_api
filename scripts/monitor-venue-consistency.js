#!/usr/bin/env node

/**
 * Script de monitoramento para verificar consistência dos dados de venues
 * 
 * Pode ser executado:
 * - Manualmente para verificação
 * - Via cron job para monitoramento contínuo
 * - Como parte de health checks
 */

try { require('dotenv').config({ path: '/etc/node-backend.env' }); } catch (_) {}
const { pool } = require('../src/config/database');

const logger = {
  info: (msg, data = '') => console.log(`[INFO] ${new Date().toISOString()} ${msg}`, data),
  error: (msg, data = '') => console.error(`[ERROR] ${new Date().toISOString()} ${msg}`, data),
  warn: (msg, data = '') => console.warn(`[WARN] ${new Date().toISOString()} ${msg}`, data)
};

async function checkConsistency() {
  try {
    // Usar a view criada para verificação rápida
    const [summary] = await pool.execute('SELECT * FROM venue_metrics_summary');
    const stats = summary[0];
    
    logger.info('=== RELATÓRIO DE CONSISTÊNCIA DOS VENUES ===');
    logger.info(`Total de venues: ${stats.total_venues}`);
    logger.info(`Inconsistências de contagem: ${stats.count_inconsistencies}`);
    logger.info(`Inconsistências de cobertura: ${stats.coverage_inconsistencies}`);
    logger.info(`Total publicações armazenadas: ${stats.total_stored_publications}`);
    logger.info(`Total publicações reais: ${stats.total_actual_publications}`);
    
    const isHealthy = stats.count_inconsistencies === 0 && stats.coverage_inconsistencies === 0;
    
    if (isHealthy) {
      logger.info('✅ Todos os dados estão consistentes');
      return { status: 'healthy', stats };
    } else {
      logger.warn('⚠️ Inconsistências detectadas');
      
      // Listar alguns exemplos de inconsistências
      const [inconsistencies] = await pool.execute(`
        SELECT id, name, stored_count, actual_count, count_inconsistent, coverage_inconsistent
        FROM venue_metrics_validation 
        WHERE count_inconsistent = 1 OR coverage_inconsistent = 1 
        LIMIT 10
      `);
      
      logger.warn('Exemplos de inconsistências:');
      inconsistencies.forEach(item => {
        logger.warn(`  ${item.name}: stored=${item.stored_count}, actual=${item.actual_count}, count_inconsistent=${item.count_inconsistent}, coverage_inconsistent=${item.coverage_inconsistent}`);
      });
      
      return { status: 'inconsistent', stats, examples: inconsistencies };
    }
    
  } catch (error) {
    logger.error('Erro ao verificar consistência:', error.message);
    return { status: 'error', error: error.message };
  }
}

async function runAutoFix() {
  logger.info('Executando correção automática...');
  
  try {
    // Executar o procedure de atualização geral
    await pool.execute('CALL update_all_venue_metrics()');
    logger.info('✅ Correção automática concluída');
    
    // Verificar novamente
    const result = await checkConsistency();
    return result;
    
  } catch (error) {
    logger.error('Erro durante correção automática:', error.message);
    return { status: 'error', error: error.message };
  }
}

async function generateHealthReport() {
  try {
    const [metrics] = await pool.execute(`
      SELECT 
        'venues_total' as metric, COUNT(*) as value FROM venues
      UNION ALL
      SELECT 
        'venues_with_publications', COUNT(*) FROM venues WHERE works_count > 0
      UNION ALL  
      SELECT 
        'publications_total', COUNT(*) FROM publications
      UNION ALL
      SELECT 
        'yearly_stats_records', COUNT(*) FROM venue_yearly_stats
      UNION ALL
      SELECT 
        'venues_with_coverage', COUNT(*) FROM venues WHERE coverage_start_year IS NOT NULL
    `);
    
    const healthReport = {
      timestamp: new Date().toISOString(),
      metrics: Object.fromEntries(metrics.map(m => [m.metric, m.value])),
      consistency: await checkConsistency()
    };
    
    return healthReport;
    
  } catch (error) {
    logger.error('Erro ao gerar relatório de saúde:', error.message);
    return { 
      timestamp: new Date().toISOString(),
      status: 'error', 
      error: error.message 
    };
  }
}

// Função principal
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'check';
  
  try {
    switch (command) {
      case 'check':
        const result = await checkConsistency();
        process.exit(result.status === 'healthy' ? 0 : 1);
        break;
        
      case 'fix':
        await runAutoFix();
        break;
        
      case 'report':
        const report = await generateHealthReport();
        console.log(JSON.stringify(report, null, 2));
        break;
        
      case 'watch':
        // Modo de monitoramento contínuo
        logger.info('Iniciando monitoramento contínuo (Ctrl+C para parar)...');
        const interval = parseInt(args[1]) || 300000; // 5 minutos por padrão
        
        setInterval(async () => {
          const result = await checkConsistency();
          if (result.status !== 'healthy') {
            logger.warn('Inconsistências detectadas durante monitoramento');
            // Aqui poderia enviar alertas, emails, etc.
          }
        }, interval);
        break;
        
      default:
        console.log(`
Uso: node monitor-venue-consistency.js [comando] [opções]

Comandos:
  check         Verificar consistência (padrão)
  fix           Executar correção automática  
  report        Gerar relatório completo em JSON
  watch [ms]    Monitoramento contínuo (padrão: 5min)

Exemplos:
  node monitor-venue-consistency.js check
  node monitor-venue-consistency.js fix
  node monitor-venue-consistency.js watch 60000  # verificar a cada 1 minuto
        `);
        break;
    }
    
  } catch (error) {
    logger.error('Erro na execução:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main();
}

module.exports = { 
  checkConsistency, 
  runAutoFix, 
  generateHealthReport 
};
