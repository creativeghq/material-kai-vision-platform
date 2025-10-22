#!/usr/bin/env python3

"""
Validate Enhanced Product Detection Filtering

Tests the new filtering logic on sample chunks to ensure:
1. Index/sustainability/certification content is filtered out
2. Real product content is kept
3. Product names and metadata are extracted correctly
"""

def test_content_filtering():
    """Test the enhanced content filtering logic"""
    
    # Sample chunks from HARMONY PDF
    test_chunks = [
        {
            "chunk_index": 0,
            "content": """###### 24 − 25

Stacy Garcia NY
Estudi{H}ac
Dsignio
ALT Design
Mut
Yonoh
Fran Silvestre

-----

**Fresh inspiration**

-----

**INDEX**

_Signature book_

_Sustainability_ _‒ Sostenibilidad_

8

_Quality certifications_ _‒ Certificados de calidad_

10

_Sustainability certifications_ _‒ Certificados de sostenibilidad_

12

_Technical characteristics_ _‒ Características técnicas_

14

_FOLD_ _‒ FOLD_

6

_BEAT_ _‒ BEAT_

8

_VALENOVA_ _‒ VALENOVA_

23

_PIQUÉ_ _‒ PIQUÉ_

38

_ONA_ _‒ ONA_

52

_MARE_ _‒ MARE_

66

_LOG_ _‒ LOG_

74

_BOW_ _‒ BOW_

84

_LINS_ _‒ LINS_

94

_MAISON_ _‒ MAISON_

116""",
            "expected_valid": False,
            "expected_reason": "Index page"
        },
        {
            "chunk_index": 1,
            "content": """-----

**Sostenibilidad**

_Medioambiental y social_

**RENDIMIENTO MEDIOAMBIENTAL**
El respeto por el entorno y el compromiso con la sostenibilidad son
fundamentales para HARMONY. Buscamos que nuestros productos sean
respetuosos con el medio ambiente y contribuyan a la construcción
sostenible.""",
            "expected_valid": False,
            "expected_reason": "Sustainability content"
        },
        {
            "chunk_index": 2,
            "content": """-----

**Quality certifications** **Sustainability certifications**

_Certificados de calidad_ _Certificados de sostenibilidad_

Quality management system in compliance with Sistema de gestión de la calidad conforme a la
UNE-EN ISO 9001:2015 UNE-EN ISO 9001:2015

Environmental management system in compliance with Sistema de gestión medioambiental conforme a la
UNE-EN ISO 14001:2015 UNE-EN ISO 14001:2015""",
            "expected_valid": False,
            "expected_reason": "Certification content"
        },
        {
            "chunk_index": 4,
            "content": """39661  VALENOVA TAUPE LT/11,8X11,8
Q59 (11,8x11,8 cm − 4[5/8]x4[5/8]")

12 patterns · ** 43 Kerakoll


39660  VALENOVA SAND LT/11,8X11,8
Q59 (11,8x11,8 cm − 4[5/8]x4[5/8]")


39659  VALENOVA CLAY LT/11,8X11,8
Q59 (11,8x11,8 cm − 4[5/8]x4[5/8]")

12 patterns · ** 43 Kerakoll


39658  VALENOVA WHITE LT/11,8X11,8
Q59 (11,8x11,8 cm − 4[5/8]x4[5/8]")

12 patterns · ** 1 Kerakoll

by Stacy Garcia NY""",
            "expected_valid": True,
            "expected_reason": "VALENOVA product with dimensions and designer",
            "expected_name": "VALENOVA",
            "expected_dimensions": "11,8×11,8",
            "expected_designer": "Stacy Garcia NY",
            "expected_colors": ["TAUPE", "SAND", "CLAY", "WHITE"]
        },
        {
            "chunk_index": 5,
            "content": """-----

PIQUÉ
by Estudi{H}ac


PIQUÉ, a new collection for HARMONY by José Manuel Ferrero from design studio estudi{H}ac, is
inspired by an 18th century mechanized technique for weaving double cloth with a raised pattern.
The collection features ceramic tiles with a distinctive textured surface that mimics the piqué fabric technique.""",
            "expected_valid": True,
            "expected_reason": "PIQUÉ product with designer",
            "expected_name": "PIQUÉ",
            "expected_designer": "Estudi{H}ac"
        },
        {
            "chunk_index": 50,
            "content": """-----

LINS MINT LINS NAVY

-----

21716 LINS WHITE
Q7 (20x20 cm − 7[7/8]x7[7/8]")

*** 4 patterns · * 100 Mapei


31688 LINS BORDEAUX
Q7 (20x20 cm − 7[7/8]x7[7/8]")

*** 4 patterns · **143 Kerakoll

by YONOH""",
            "expected_valid": True,
            "expected_reason": "LINS product with dimensions and designer",
            "expected_name": "LINS",
            "expected_dimensions": "20×20",
            "expected_designer": "YONOH",
            "expected_colors": ["MINT", "NAVY", "WHITE", "BORDEAUX"]
        }
    ]
    
    print("🧪 Testing Enhanced Content Filtering Logic")
    print("=" * 60)
    
    # Test filtering logic
    for i, chunk in enumerate(test_chunks):
        print(f"\n📋 Test {i+1}: Chunk {chunk['chunk_index']}")
        print(f"Expected: {'✅ VALID' if chunk['expected_valid'] else '❌ INVALID'} ({chunk['expected_reason']})")
        
        # Test content filtering
        is_valid = test_is_valid_product_chunk(chunk['content'])
        result = "✅ VALID" if is_valid else "❌ INVALID"
        status = "✅ PASS" if is_valid == chunk['expected_valid'] else "❌ FAIL"
        
        print(f"Actual: {result} {status}")
        
        # If valid, test name extraction
        if is_valid and chunk['expected_valid']:
            extracted_name = test_extract_product_name(chunk['content'])
            expected_name = chunk.get('expected_name')
            
            if expected_name:
                name_status = "✅ PASS" if extracted_name == expected_name else "❌ FAIL"
                print(f"   Name: Expected '{expected_name}', Got '{extracted_name}' {name_status}")
            
            # Test metadata extraction
            metadata = test_extract_product_metadata(chunk['content'])
            
            if chunk.get('expected_dimensions'):
                dims_status = "✅ PASS" if metadata.get('dimensions') == chunk['expected_dimensions'] else "❌ FAIL"
                print(f"   Dimensions: Expected '{chunk['expected_dimensions']}', Got '{metadata.get('dimensions')}' {dims_status}")
            
            if chunk.get('expected_designer'):
                designer_status = "✅ PASS" if metadata.get('designer') == chunk['expected_designer'] else "❌ FAIL"
                print(f"   Designer: Expected '{chunk['expected_designer']}', Got '{metadata.get('designer')}' {designer_status}")
            
            if chunk.get('expected_colors'):
                colors = metadata.get('colors', [])
                colors_match = all(color in colors for color in chunk['expected_colors'])
                colors_status = "✅ PASS" if colors_match else "❌ FAIL"
                print(f"   Colors: Expected {chunk['expected_colors']}, Got {colors} {colors_status}")

def test_is_valid_product_chunk(content):
    """Test implementation of _is_valid_product_chunk logic"""
    content_lower = content.lower()
    
    # Skip very short content
    if len(content) < 100:
        return False
    
    # Skip index/table of contents
    if any(keyword in content_lower for keyword in [
        'table of contents', 'index', 'contents', 'signature book'
    ]):
        return False
    
    # Skip sustainability content
    if any(keyword in content_lower for keyword in [
        'sustainability', 'environmental', 'sostenibilidad', 'medioambiental'
    ]) and not any(product_keyword in content_lower for product_keyword in [
        'dimensions', 'designer', 'collection', '×', 'cm', 'mm'
    ]):
        return False
    
    # Skip certification content
    if any(keyword in content_lower for keyword in [
        'quality certifications', 'sustainability certifications',
        'certificados', 'iso 9001', 'iso 14001'
    ]) and not any(product_keyword in content_lower for product_keyword in [
        'dimensions', 'designer', 'collection', '×', 'cm', 'mm'
    ]):
        return False
    
    # Require product indicators
    has_uppercase_name = any(word.isupper() and len(word) > 2 for word in content.split())
    has_dimensions = any(pattern in content for pattern in ['×', 'x ', 'cm', 'mm'])
    has_product_context = any(keyword in content_lower for keyword in [
        'designer', 'collection', 'material', 'ceramic', 'porcelain', 'tile',
        'estudi{h}ac', 'dsignio', 'alt design', 'mut', 'yonoh', 'stacy garcia'
    ])
    
    # Must have at least 2 of 3 product indicators
    product_score = sum([has_uppercase_name, has_dimensions, has_product_context])
    return product_score >= 2

def test_extract_product_name(content):
    """Test implementation of _extract_product_name logic"""
    import re
    
    lines = content.split('\n')
    
    # Look for UPPERCASE product names
    for line in lines[:10]:
        line = line.strip()
        
        # Standalone UPPERCASE line
        if re.match(r'^[A-Z]{2,}(?:\s+[A-Z]{2,})*$', line) and len(line) <= 20:
            return line.strip()
        
        # UPPERCASE word followed by product context
        uppercase_match = re.search(r'\b([A-Z]{3,}(?:\s+[A-Z]{3,})*)\b', line)
        if uppercase_match:
            candidate = uppercase_match.group(1).strip()
            # Verify it's followed by product context
            next_lines = '\n'.join(lines[lines.index(line):lines.index(line)+3])
            if any(pattern in next_lines.lower() for pattern in [
                '×', 'cm', 'mm', 'designer', 'estudi', 'dsignio', 'yonoh'
            ]):
                return candidate
    
    return None

def test_extract_product_metadata(content):
    """Test implementation of _extract_product_metadata logic"""
    import re
    metadata = {}
    
    # Extract dimensions
    dimension_patterns = [
        r'(\d+(?:,\d+)?)\s*[×x]\s*(\d+(?:,\d+)?)\s*(?:cm|mm)?'
    ]
    
    for pattern in dimension_patterns:
        matches = re.findall(pattern, content)
        if matches:
            metadata['dimensions'] = f"{matches[0][0]}×{matches[0][1]}"
            break
    
    # Extract designer/studio
    designer_patterns = [
        r'(?:by|BY)\s+([A-Z][A-Za-z\s{}\-]+)',
        r'(ESTUDI\{H\}AC|DSIGNIO|ALT DESIGN|MUT|YONOH|Stacy Garcia NY)',
    ]
    
    for pattern in designer_patterns:
        matches = re.findall(pattern, content)
        if matches:
            designer = matches[0].strip()
            if len(designer) > 2:
                metadata['designer'] = designer
                break
    
    # Extract colors
    color_patterns = [
        r'\b(TAUPE|SAND|CLAY|WHITE|BLACK|GREY|GRAY|ANTHRACITE|BEIGE|BROWN|MINT|NAVY|BORDEAUX)\b'
    ]
    
    colors = []
    for pattern in color_patterns:
        matches = re.findall(pattern, content)
        colors.extend(matches)
    
    if colors:
        metadata['colors'] = list(set(colors))
    
    return metadata

if __name__ == '__main__':
    test_content_filtering()
