-- PowerPoint live tracking (PowerPointService) reuses the presentations/presentation_slides
-- tables LouvorJA already writes to, tagged by source, instead of duplicating an identical
-- schema: Slide/Presentation never diverge between sources, only which program produced the row.

ALTER TABLE presentations ADD COLUMN source TEXT NOT NULL DEFAULT 'louvorja';
CREATE INDEX idx_presentations_source ON presentations (source);
