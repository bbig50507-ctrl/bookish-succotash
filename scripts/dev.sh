#!/bin/bash

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}🚀 Starting Development Environment${NC}"
echo ""

echo -e "${BLUE}1️⃣ Starting Server (port 3000)${NC}"
echo "   npm run dev (in server/)"
echo ""

echo -e "${BLUE}2️⃣ In another terminal, start Frontend (port 8000)${NC}"
echo "   cd public"
echo "   python3 -m http.server 8000"
echo ""

echo -e "${BLUE}3️⃣ To test the complete flow:${NC}"
echo "   npm run test:flow (in server/)"
echo ""

echo -e "${BLUE}4️⃣ To monitor system health:${NC}"
echo "   npm run monitor (in server/)"
echo ""

echo "Press Enter to start server..."
read

cd server
npm run dev
