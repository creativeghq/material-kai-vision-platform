#!/usr/bin/env python3
"""Fix the save_knowledge_base_entries method to create pdf_processing_results record."""

file_path = '/var/www/mivaa-pdf-extractor/app/services/supabase_client.py'

with open(file_path, 'r') as f:
    lines = f.readlines()

# Find the line where we check if document exists in documents table
# and add code to also create/check pdf_processing_results record

insert_index = None
for i, line in enumerate(lines):
    if 'doc_check = self._client.table(\'documents\').select' in line:
        insert_index = i
        break

if insert_index is None:
    print('Pattern not found')
else:
    # Find the end of the document check block (after the except block)
    # We need to add code after the document creation logic
    
    # Find the line with "# Save text chunks to document_chunks table"
    save_chunks_index = None
    for i in range(insert_index, len(lines)):
        if '# Save text chunks to document_chunks table' in lines[i]:
            save_chunks_index = i
            break
    
    if save_chunks_index is None:
        print('Save chunks comment not found')
    else:
        # Insert code to create pdf_processing_results record before saving chunks
        new_code = '''            # Ensure pdf_processing_results record exists (for foreign key constraint)
            try:
                pdf_result_check = self._client.table('pdf_processing_results').select('id').eq('id', document_id).execute()
                if not pdf_result_check.data:
                    # Create pdf_processing_results record
                    pdf_result_data = {
                        'id': document_id,
                        'original_filename': f"{document_id}.pdf",
                        'processing_status': 'completed',
                        'processing_started_at': 'now()',
                        'processing_completed_at': 'now()',
                        'total_pages': 1,
                        'total_tiles_extracted': len(images),
                        'extraction_options': {
                            'extract_images': True,
                            'enable_multimodal': True
                        }
                    }
                    pdf_result_response = self._client.table('pdf_processing_results').insert(pdf_result_data).execute()
                    if pdf_result_response.data:
                        logger.info(f"✅ Created pdf_processing_results record: {document_id}")
                    else:
                        logger.warning(f"⚠️ Failed to create pdf_processing_results record: {document_id}")
            except Exception as pdf_error:
                logger.warning(f"⚠️ pdf_processing_results creation failed: {pdf_error}")

'''
        lines.insert(save_chunks_index, new_code)
        
        with open(file_path, 'w') as f:
            f.writelines(lines)
        
        print('Added pdf_processing_results creation code')

