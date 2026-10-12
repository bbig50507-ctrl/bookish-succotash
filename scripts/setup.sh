#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Setting up Bookish Succotash Automated System${NC}"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo -e "${RED}❌ Node.js is not installed${NC}"
  echo "Please install Node.js from https://nodejs.org/"
  exit 1
fi
echo -e "${GREEN}✓ Node.js found: $(node --version)${NC}"

# Create .env if not exists
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo -e "${YELLOW}⚠️ Created .env from .env.example - PLEASE UPDATE YOUR SECRETS${NC}"
    echo "Edit .env and add:"
    echo "  - SUPABASE_URL"
    echo "  - SUPABASE_SERVICE_ROLE_KEY"
    echo "  - ANTHROPIC_API_KEY"
    echo "  - GITHUB_PAT (if using Vault dispatch)"
  else
    echo -e "${RED}❌ No .env.example found${NC}"
    exit 1
  fi
fi

# Install server dependencies
echo ""
echo -e "${GREEN}📦 Installing server dependencies...${NC}"
cd server
npm install
cd ..
echo -e "${GREEN}✓ Dependencies installed${NC}"

echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your actual Supabase and Anthropic keys"
echo "  2. Apply SQL schemas to Supabase:"
echo "     - supabase-schema.sql"
echo "     - supabase-trigger.sql"
echo "  3. Set GitHub Secrets and Variables"
echo "  4. Run: npm run dev (in server/)"
echo ""
