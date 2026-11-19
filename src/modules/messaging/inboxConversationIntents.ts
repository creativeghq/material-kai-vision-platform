export const INBOX_CONVERSATION_INTENTS = [
  'lead',
  'existing_order',
  'complaint',
  'supplier',
  'internal',
  'other',
] as const;

export type InboxConversationIntent = (typeof INBOX_CONVERSATION_INTENTS)[number];

export const INBOX_CONVERSATION_INTENT_LABELS: Record<InboxConversationIntent, string> = {
  lead: 'New Enquiry',
  existing_order: 'Existing Order',
  complaint: 'Complaint',
  supplier: 'Supplier',
  internal: 'Internal',
  other: 'Other',
};

export const CLASSIFIER_OUTCOME_CLASSIFIERS = [
  'inbox_document_kind',
  'inbox_conversation_intent',
] as const;

export type ClassifierOutcomeClassifier = (typeof CLASSIFIER_OUTCOME_CLASSIFIERS)[number];
