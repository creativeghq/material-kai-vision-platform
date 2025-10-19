#!/usr/bin/env python3
"""Fix the pdf_processing_results creation to include file_url."""

file_path = '/var/www/mivaa-pdf-extractor/app/services/supabase_client.py'

with open(file_path, 'r') as f:
    content = f.read()

# Replace the pdf_result_data dictionary to include file_url
old_data = '''                    import uuid
                    pdf_result_data = {
                        'id': document_id,
                        'user_id': str(uuid.uuid4()),  # Generate a system user ID
                        'original_filename': f"{document_id}.pdf",
                        'processing_status': 'completed',
                        'total_pages': 1,
                        'total_tiles_extracted': len(images),
                        'extraction_options': {
                            'extract_images': True,
                            'enable_multimodal': True
                        }
                    }'''

new_data = '''                    import uuid
                    pdf_result_data = {
                        'id': document_id,
                        'user_id': str(uuid.uuid4()),  # Generate a system user ID
                        'original_filename': f"{document_id}.pdf",
                        'file_url': f"https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/pdf-documents/{document_id}.pdf",
                        'processing_status': 'completed',
                        'total_pages': 1,
                        'total_tiles_extracted': len(images),
                        'extraction_options': {
                            'extract_images': True,
                            'enable_multimodal': True
                        }
                    }'''

if old_data in content:
    content = content.replace(old_data, new_data)
    with open(file_path, 'w') as f:
        f.write(content)
    print('Fixed pdf_processing_results file_url')
else:
    print('Pattern not found')

