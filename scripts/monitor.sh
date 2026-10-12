#!/bin/bash

# Monitor system status

echo "📊 Monitoring System Status"
echo ""

cd server
node monitor.js

echo ""
echo "Monitoring complete. Refresh to see updated stats."
