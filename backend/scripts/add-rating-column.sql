-- Add rating column to movies table
ALTER TABLE movies ADD COLUMN IF NOT EXISTS rating DECIMAL(3,1);

-- Add comment
COMMENT ON COLUMN movies.rating IS 'TMDB average rating (0.0-10.0)';
