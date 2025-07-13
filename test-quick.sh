#!/bin/bash

echo "Quick test of material-scraper function..."

# Simple health check test
curl -X POST \
  "https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/material-scraper" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsImtpZCI6Ik1EU1ByZ1hSL2lHdnk2SGUiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2JnYmF2eHRqbGJ2Z3Bsb3ppenh1LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI0OWY2ODNhZC1lYmYyLTQyOTYtYTQxMC0wZDhjMDExY2UwYmUiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzUyMzg4MjU0LCJpYXQiOjE3NTIzODQ2NTQsImVtYWlsIjoiYmFzaWxpc2thbkBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl19LCJ1c2VyX21ldGFkYXRhIjp7ImRpc3BsYXlfbmFtZSI6IkJhc2lsaXMgS2Fub25pZGlzIiwiZW1haWwiOiJiYXNpbGlza2FuQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaG9uZV92ZXJpZmllZCI6ZmFsc2UsInN1YiI6IjQ5ZjY4M2FkLWViZjItNDI5Ni1hNDEwLTBkOGMwMTFjZTBiZSJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzUyMjMzNDU5fV0sInNlc3Npb25faWQiOiI0ZWQyNjM1NS1lZWM2LTQ1MTQtODk2ZC1lYjdmYjA4ZTRkY2YiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.czBx3ny77irDSr1aB266_17WOG50vF9nwX4_08OI3Ak" \
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