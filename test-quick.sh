#!/bin/bash

echo "Quick test of material-scraper function..."
echo "Material scraper is a public function, no auth needed"

# Simple health check test (public function, no auth needed)
curl -X POST \
  "https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/material-scraper" \
  -H "Content-Type: application/json" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg" \
  -d '{
    "url": "https://example.com",
    "service": "firecrawl",
    "sitemapMode": false,
    "options": {
      "prompt": "Test extraction"
    }
  }' | head -20

echo ""
echo "Test completed. The function should now be accessible!"