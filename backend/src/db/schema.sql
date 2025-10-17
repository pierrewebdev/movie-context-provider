-- Movie MCP Server Database Schema
-- Multi-user support with basic API key authentication

-- Users table for authentication and user management
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  api_key TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Movies table (shared across all users)
-- Stores movie metadata from TMDB
CREATE TABLE IF NOT EXISTS movies (
  id SERIAL PRIMARY KEY,
  tmdb_id INTEGER UNIQUE NOT NULL,
  title TEXT NOT NULL,
  year INTEGER,
  overview TEXT,
  poster_url TEXT,
  rating DECIMAL(3,1),
  created_at TIMESTAMP DEFAULT NOW()
);

-- User-specific watchlist
-- Tracks movies users want to watch
CREATE TABLE IF NOT EXISTS watchlist (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT NOW(),
  notes TEXT,
  UNIQUE(user_id, movie_id)
);

-- User-specific watch history
-- Tracks movies users have watched with ratings
CREATE TABLE IF NOT EXISTS watched (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  watched_at TIMESTAMP DEFAULT NOW(),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  notes TEXT,
  UNIQUE(user_id, movie_id)
);

-- User-specific preferences
-- Stores user preferences as flexible JSONB (genres, actors, moods, etc.)
CREATE TABLE IF NOT EXISTS preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, key)
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_movie ON watchlist(movie_id);
CREATE INDEX IF NOT EXISTS idx_watched_user ON watched(user_id);
CREATE INDEX IF NOT EXISTS idx_watched_movie ON watched(movie_id);
CREATE INDEX IF NOT EXISTS idx_watched_rating ON watched(rating);
CREATE INDEX IF NOT EXISTS idx_preferences_user ON preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key);

-- Insert a default demo user for testing
-- In production, users should be created through a proper registration flow
INSERT INTO users (email, api_key) 
VALUES ('demo@example.com', 'demo_api_key_change_in_production')
ON CONFLICT (email) DO NOTHING;

