export const EXT_SERVICE_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'];

export const EXT_SERVICE_LABELS: Record<string, string> = {
  'apollo-enrich': 'Apollo Enrich',
  'apollo-people-match': 'Apollo People',
  'hunter-email-finder': 'Hunter Email',
  'hunter-domain-search': 'Hunter Domain',
  'zerobounce-validate': 'ZeroBounce',
  'firecrawl-scrape': 'Firecrawl',
  // Retired 2026-08-23 but kept: historical ai_usage_logs rows still carry the old key.
  'zernio-whatsapp': 'Zernio WhatsApp (Retired)',
  'whatsapp-service': 'WhatsApp Service Reply',
  'whatsapp-template': 'WhatsApp Template',
  'resend-email': 'Resend Email',
};
