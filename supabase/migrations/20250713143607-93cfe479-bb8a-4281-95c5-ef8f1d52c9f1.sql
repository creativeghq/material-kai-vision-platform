-- Add policies to allow users to insert and update their own documents
CREATE POLICY "Users can insert their own documents"
ON enhanced_knowledge_base FOR INSERT
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update their own documents"
ON enhanced_knowledge_base FOR UPDATE
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());