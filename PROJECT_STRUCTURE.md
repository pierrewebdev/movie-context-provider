# Project Structure

## Architecture

```
┌─────────────────────────────────────────┐
│           ChatGPT Interface             │
│  ┌───────────────────────────────────┐  │
│  │   Interactive Movie Widgets       │  │
│  │  (Posters, Lists, Action Buttons) │  │
│  └───────────────────────────────────┘  │
│           ↕️ OpenAI Apps SDK            │
├─────────────────────────────────────────┤
│         Backend MCP Server              │
│  ┌────────────┐  ┌─────────────────┐   │
│  │  MCP Tools │  │ Multi-Provider  │   │
│  │  (9 tools) │  │ LLM Integration │   │
│  └────────────┘  └─────────────────┘   │
│         ↕️                ↕️             │
│  ┌────────────┐  ┌─────────────────┐   │
│  │ PostgreSQL │  │  TMDB API       │   │
│  │  Database  │  │  (1M+ movies)   │   │
│  └────────────┘  └─────────────────┘   │
└─────────────────────────────────────────┘
```

**Tech Stack:**
- **Frontend**: React + TypeScript + Vite (widget bundles)
- **Backend**: Node.js + TypeScript + Express
- **Database**: PostgreSQL 17
- **APIs**: TMDB, OpenAI/Anthropic/Gemini
- **Deployment**: Render (single blueprint)

## Directory Layout

```
movie-context-provider/
├── backend/                      # MCP Server
│   ├── src/
│   │   ├── index.ts             # Entry point (bootstraps server)
│   │   ├── config/
│   │   │   └── constants.ts     # Centralized config + env validation
│   │   ├── routes/
│   │   │   ├── health.ts        # Health check endpoint
│   │   │   ├── root.ts          # Root info endpoint
│   │   │   └── admin.ts         # Admin user management endpoints
│   │   ├── server/
│   │   │   ├── mcp-handlers.ts  # MCP server setup & tool registration
│   │   │   └── transport.ts     # HTTP/SSE transport
│   │   ├── middleware/
│   │   │   └── auth.ts          # Bearer token authentication
│   │   ├── tools/               # MCP tool implementations
│   │   │   ├── search.ts        # Search & discover tools
│   │   │   ├── movieDetails.ts  # Get movie details + poster widget
│   │   │   ├── watchlist.ts     # Watchlist management
│   │   │   ├── watched.ts       # Watch history & ratings
│   │   │   ├── preferences.ts   # User preferences (JSONB)
│   │   │   └── recommendations.ts # AI-powered recommendations
│   │   ├── utils/
│   │   │   ├── tmdb.ts          # TMDB API wrapper
│   │   │   └── llm.ts           # Multi-provider LLM integration
│   │   └── db/
│   │       ├── schema.sql       # Database schema
│   │       ├── client.ts        # PostgreSQL connection pool
│   │       └── utilities.ts     # DB helper functions
│   ├── scripts/
│   │   ├── migrate.ts           # Database migration script
│   │   └── generate-api-key.ts  # API key generator utility
│   └── package.json
│
├── frontend/                     # Widget Bundles
│   ├── src/
│   │   ├── widgets/
│   │   │   ├── poster.tsx       # Movie poster widget
│   │   │   ├── list.tsx         # Movie list widget
│   │   │   ├── preferences.tsx  # User preferences widget
│   │   │   └── shared/          # Shared components & utilities
│   │   │       ├── hooks.ts     # useOpenAiGlobal hook
│   │   │       ├── components.tsx # ButtonSpinner, LoadingSpinner
│   │   │       ├── styles.ts    # Tailwind class combinations
│   │   │       └── openai-api.ts # Typed OpenAI API wrappers
│   │   └── styles.css           # Tailwind styles
│   ├── vite.config.ts           # Vite bundler config (3 entry points)
│   └── package.json
│
├── render.yaml                   # Complete deployment blueprint
└── README.md
```

## Database Schema

**Tables:**
- `users` - User accounts with API keys
- `movies` - Cached movie metadata from TMDB
- `watchlist` - Movies users want to watch
- `watched` - Movies users have watched (with ratings/notes)
- `preferences` - User preferences stored as JSONB

**Key Features:**
- Foreign key constraints ensure data integrity
- Composite unique indexes prevent duplicates
- JSONB columns for flexible preference storage
- Automatic timestamps on all tables



