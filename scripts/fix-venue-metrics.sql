-- Script para corrigir métricas dos venues com base nos dados reais
-- Este script sincroniza os dados pré-computados com os dados reais da tabela publications

-- 1. Atualizar contagem de trabalhos (works_count) com dados reais
UPDATE venues v 
SET works_count = (
    SELECT COUNT(p.id) 
    FROM publications p 
    WHERE p.venue_id = v.id
);

-- 2. Atualizar período de cobertura com dados reais
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
    );

-- 3. Recriar dados da tabela venue_yearly_stats com base nos dados reais
-- Primeiro, remover dados antigos
DELETE FROM venue_yearly_stats;

-- Depois, inserir dados corretos baseados nas publicações reais
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
    AND p.year BETWEEN 1800 AND 2030  -- Filtro de anos válidos
GROUP BY p.venue_id, p.year
ORDER BY p.venue_id, p.year;

-- 4. Atualizar contadores de citações nos venues
UPDATE venues v 
SET cited_by_count = (
    SELECT SUM(COALESCE(w.cited_by_count, 0))
    FROM publications p
    LEFT JOIN works w ON p.work_id = w.id
    WHERE p.venue_id = v.id
);

-- 5. Verificação final - mostrar estatísticas após a correção
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
WHERE coverage_start_year IS NOT NULL AND coverage_end_year IS NOT NULL;