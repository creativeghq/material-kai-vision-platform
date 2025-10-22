#!/usr/bin/env python3
"""
Test script to verify Claude image analysis integration is working.
"""

import asyncio
import sys
import os
import logging
from pathlib import Path

# Add the app directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app'))

from app.services.llamaindex_service import LlamaIndexService
from app.config import get_settings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_claude_integration():
    """Test Claude image analysis integration."""
    try:
        logger.info("🧪 Testing Claude image analysis integration...")
        
        # Initialize LlamaIndex service
        settings = get_settings()
        config = {
            'embedding_model': 'text-embedding-3-small',
            'llm_model': 'gpt-4o',
            'chunk_size': 1024,
            'chunk_overlap': 200,
            'enable_multimodal': True,
            'mivaa_service_url': 'https://v1api.materialshub.gr',
            'mivaa_api_key': getattr(settings, 'mivaa_api_key', '')
        }
        
        service = LlamaIndexService(config=config)
        
        # Create a simple test image (base64 encoded 1x1 pixel)
        # This is a minimal JPEG image for testing
        test_image_base64 = "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A"
        test_image_path = "test_image.jpg"
        
        # Test the Claude image analysis method
        logger.info("📸 Testing Claude image analysis...")
        result = await service._call_claude_image_analysis(test_image_base64, test_image_path)
        
        if result.get('success'):
            logger.info("✅ Claude integration test PASSED!")
            logger.info(f"📊 Analysis result: {result}")
            
            # Test the full material analysis method
            logger.info("🔬 Testing full material analysis...")
            material_result = await service._analyze_image_material(test_image_base64, test_image_path)
            
            if material_result:
                logger.info("✅ Material analysis test PASSED!")
                logger.info(f"📊 Material analysis: {material_result}")
                return True
            else:
                logger.error("❌ Material analysis test FAILED!")
                return False
                
        else:
            logger.error("❌ Claude integration test FAILED!")
            logger.error(f"Error: {result.get('error', 'Unknown error')}")
            return False
            
    except Exception as e:
        logger.error(f"❌ Test failed with exception: {e}")
        import traceback
        traceback.print_exc()
        return False

async def main():
    """Main test function."""
    logger.info("🚀 Starting Claude integration tests...")
    
    success = await test_claude_integration()
    
    if success:
        logger.info("🎉 All tests PASSED! Claude integration is working.")
        sys.exit(0)
    else:
        logger.error("💥 Tests FAILED! Claude integration needs fixing.")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
