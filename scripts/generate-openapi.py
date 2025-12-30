#!/usr/bin/env python3
"""
Generate OpenAPI JSON schema from FastAPI application.

This script imports the FastAPI app and exports the OpenAPI schema to openapi.json.
Run this after adding new endpoints to update the static OpenAPI documentation.

Usage:
    python scripts/generate-openapi.py
"""

import sys
import json
from pathlib import Path

# Add the mivaa-pdf-extractor directory to Python path
repo_root = Path(__file__).parent.parent
mivaa_path = repo_root / "mivaa-pdf-extractor"
sys.path.insert(0, str(mivaa_path))

try:
    # Import the FastAPI app
    from app.main import app
    
    # Generate OpenAPI schema
    openapi_schema = app.openapi()
    
    # Write to openapi.json in repo root
    output_file = repo_root / "openapi.json"
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(openapi_schema, f, indent=2, ensure_ascii=False)
    
    print(f"✅ OpenAPI schema generated successfully!")
    print(f"📄 Output: {output_file}")
    print(f"📊 Total endpoints: {len(openapi_schema.get('paths', {}))}")
    print(f"🏷️  Version: {openapi_schema.get('info', {}).get('version', 'unknown')}")
    
    # Count endpoints by tag
    tags_count = {}
    for path_data in openapi_schema.get('paths', {}).values():
        for method_data in path_data.values():
            if isinstance(method_data, dict) and 'tags' in method_data:
                for tag in method_data['tags']:
                    tags_count[tag] = tags_count.get(tag, 0) + 1
    
    print("\n📋 Endpoints by category:")
    for tag, count in sorted(tags_count.items(), key=lambda x: x[1], reverse=True):
        print(f"   • {tag}: {count} endpoints")

except ImportError as e:
    print(f"❌ Error importing FastAPI app: {e}")
    print("\nMake sure you're running this from the repository root and have all dependencies installed.")
    sys.exit(1)
except Exception as e:
    print(f"❌ Error generating OpenAPI schema: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

