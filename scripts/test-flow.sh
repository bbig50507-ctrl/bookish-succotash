#!/bin/bash

# Quick test of the entire booking flow

echo "🧪 Testing Complete Booking Flow"
echo ""

echo "1️⃣ Creating booking via API..."
curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "property_ref": "PROP-TEST-'$(date +%s)'",
    "check_in": "2026-11-10",
    "check_out": "2026-11-15",
    "guest_count": 3,
    "customer_note": "Test booking from shell script"
  }' | jq .

echo ""
echo "2️⃣ Waiting 2 seconds for task creation..."
sleep 2

echo ""
echo "3️⃣ Running complete test flow..."
cd server
node test-flow.js
