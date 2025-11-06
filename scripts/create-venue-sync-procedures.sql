-- Stored procedures para manter dados de venues sincronizados automaticamente
-- Estes procedures devem ser executados sempre que houver mudanças nas publicações

DELIMITER //

-- Procedure para atualizar métricas de um venue específico
DROP PROCEDURE IF EXISTS update_venue_metrics//
CREATE PROCEDURE update_venue_metrics(IN venue_id_param INT)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;
    
    START TRANSACTION;
    
    -- Atualizar works_count
    UPDATE venues v
    SET v.works_count = (
        SELECT COUNT(*)
        FROM publications p
        WHERE p.venue_id = venue_id_param
    )
    WHERE v.id = venue_id_param;
    
    -- Atualizar período de cobertura
    UPDATE venues v
    SET 
        v.coverage_start_year = (
            SELECT MIN(p.year)
            FROM publications p
            WHERE p.venue_id = venue_id_param AND p.year IS NOT NULL
        ),
        v.coverage_end_year = (
            SELECT MAX(p.year)
            FROM publications p
            WHERE p.venue_id = venue_id_param AND p.year IS NOT NULL
        )
    WHERE v.id = venue_id_param;
    
    -- Atualizar cited_by_count
    UPDATE venues v
    SET v.cited_by_count = (
        SELECT COALESCE(SUM(w.cited_by_count), 0)
        FROM publications p
        LEFT JOIN works w ON p.work_id = w.id
        WHERE p.venue_id = venue_id_param
    )
    WHERE v.id = venue_id_param;
    
    -- Recalcular venue_yearly_stats para este venue
    DELETE FROM venue_yearly_stats WHERE venue_id = venue_id_param;
    
    INSERT INTO venue_yearly_stats (venue_id, year, works_count, oa_works_count, cited_by_count)
    SELECT 
        p.venue_id,
        p.year,
        COUNT(*) as works_count,
        SUM(CASE WHEN p.open_access = 1 THEN 1 ELSE 0 END) as oa_works_count,
        SUM(COALESCE(w.cited_by_count, 0)) as cited_by_count
    FROM publications p
    LEFT JOIN works w ON p.work_id = w.id
    WHERE p.venue_id = venue_id_param
        AND p.year IS NOT NULL
        AND p.year BETWEEN 1800 AND 2030
    GROUP BY p.venue_id, p.year;
    
    COMMIT;
END//

-- Procedure para atualizar todos os venues
DROP PROCEDURE IF EXISTS update_all_venue_metrics//
CREATE PROCEDURE update_all_venue_metrics()
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE current_venue_id INT;
    DECLARE venue_cursor CURSOR FOR 
        SELECT DISTINCT id FROM venues WHERE id IN (SELECT DISTINCT venue_id FROM publications WHERE venue_id IS NOT NULL);
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;
    
    START TRANSACTION;
    
    -- Primeiro, limpar venue_yearly_stats
    DELETE FROM venue_yearly_stats;
    
    -- Iterar por todos os venues que têm publicações
    OPEN venue_cursor;
    
    read_loop: LOOP
        FETCH venue_cursor INTO current_venue_id;
        IF done THEN
            LEAVE read_loop;
        END IF;
        
        CALL update_venue_metrics(current_venue_id);
    END LOOP;
    
    CLOSE venue_cursor;
    
    COMMIT;
END//

-- Trigger para atualizar automaticamente quando uma publicação é inserida
DROP TRIGGER IF EXISTS after_publication_insert//
CREATE TRIGGER after_publication_insert
    AFTER INSERT ON publications
    FOR EACH ROW
BEGIN
    IF NEW.venue_id IS NOT NULL THEN
        CALL update_venue_metrics(NEW.venue_id);
    END IF;
END//

-- Trigger para atualizar automaticamente quando uma publicação é atualizada
DROP TRIGGER IF EXISTS after_publication_update//
CREATE TRIGGER after_publication_update
    AFTER UPDATE ON publications
    FOR EACH ROW
BEGIN
    -- Se o venue_id mudou, atualizar ambos os venues
    IF OLD.venue_id IS NOT NULL AND OLD.venue_id != NEW.venue_id THEN
        CALL update_venue_metrics(OLD.venue_id);
    END IF;
    
    IF NEW.venue_id IS NOT NULL THEN
        CALL update_venue_metrics(NEW.venue_id);
    END IF;
END//

-- Trigger para atualizar automaticamente quando uma publicação é deletada
DROP TRIGGER IF EXISTS after_publication_delete//
CREATE TRIGGER after_publication_delete
    AFTER DELETE ON publications
    FOR EACH ROW
BEGIN
    IF OLD.venue_id IS NOT NULL THEN
        CALL update_venue_metrics(OLD.venue_id);
    END IF;
END//

-- Trigger para atualizar quando works são atualizados (especialmente cited_by_count)
DROP TRIGGER IF EXISTS after_work_update//
CREATE TRIGGER after_work_update
    AFTER UPDATE ON works
    FOR EACH ROW
BEGIN
    -- Se cited_by_count mudou, atualizar todos os venues relacionados
    IF OLD.cited_by_count != NEW.cited_by_count THEN
        UPDATE venues v
        SET v.cited_by_count = (
            SELECT COALESCE(SUM(w.cited_by_count), 0)
            FROM publications p
            LEFT JOIN works w ON p.work_id = w.id
            WHERE p.venue_id = v.id
        )
        WHERE v.id IN (
            SELECT DISTINCT p.venue_id 
            FROM publications p 
            WHERE p.work_id = NEW.id AND p.venue_id IS NOT NULL
        );
    END IF;
END//

DELIMITER ;

-- Indexes para melhorar performance dos triggers
CREATE INDEX IF NOT EXISTS idx_publications_venue_year ON publications(venue_id, year);
CREATE INDEX IF NOT EXISTS idx_publications_work_venue ON publications(work_id, venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_yearly_stats_venue_year ON venue_yearly_stats(venue_id, year);

-- View para verificar facilmente inconsistências
CREATE OR REPLACE VIEW venue_metrics_validation AS
SELECT 
    v.id,
    v.name,
    v.works_count as stored_count,
    COALESCE(pub_stats.actual_count, 0) as actual_count,
    (v.works_count != COALESCE(pub_stats.actual_count, 0)) as count_inconsistent,
    v.coverage_start_year as stored_start,
    pub_stats.actual_start,
    v.coverage_end_year as stored_end,
    pub_stats.actual_end,
    (v.coverage_start_year != pub_stats.actual_start OR v.coverage_end_year != pub_stats.actual_end) as coverage_inconsistent
FROM venues v
LEFT JOIN (
    SELECT 
        venue_id,
        COUNT(*) as actual_count,
        MIN(year) as actual_start,
        MAX(year) as actual_end
    FROM publications
    WHERE venue_id IS NOT NULL AND year IS NOT NULL
    GROUP BY venue_id
) pub_stats ON v.id = pub_stats.venue_id;

-- View para estatísticas rápidas
CREATE OR REPLACE VIEW venue_metrics_summary AS
SELECT 
    COUNT(*) as total_venues,
    SUM(CASE WHEN count_inconsistent THEN 1 ELSE 0 END) as count_inconsistencies,
    SUM(CASE WHEN coverage_inconsistent THEN 1 ELSE 0 END) as coverage_inconsistencies,
    SUM(stored_count) as total_stored_publications,
    SUM(actual_count) as total_actual_publications
FROM venue_metrics_validation;