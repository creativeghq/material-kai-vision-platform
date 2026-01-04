Dynamic Metadata Extractor Warnings - NEEDS INVESTIGATION
The warnings about missing care/maintenance, compliance/safety, and packaging fields are informational
They indicate the AI didn't find these sections in the PDF
Current Status: The extractor runs during Stage 0B (product discovery), which is actually CORRECT for metadata extraction
Question: Does the PDF actually contain these sections? If yes, we need to improve the section detection logic
Pipeline Stage Placement - CLARIFICATION NEEDED
The dynamic metadata extractor currently runs during Stage 0B (after product discovery, before product creation)
This is actually the RIGHT place for metadata extraction because:
It enriches the product metadata BEFORE creating the product in the database
The enriched metadata is then saved with the product in Stage 4
Moving it AFTER Stage 4 would be wrong because the metadata wouldn't be saved with the product


Improve section detection - The smart extraction looks for keywords like "packaging", "compliance", "care", etc. If the PDF uses different terminology, we may need to add more keywords
Increase extraction window - Currently extracts 1000 chars before/after keywords. Could increase this if sections are larger
Review AI prompt - The prompt specifically asks for these fields. Could make it more explicit about where to look


Also the process riht now, works to save into a PRODUCT. We make Chunks for those that are meta ( as far as I remember we save it like this ) and then we give relevancy with ALL products of that specific document.