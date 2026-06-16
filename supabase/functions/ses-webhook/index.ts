/**
 * SES Webhook Handler
 * Handles SNS notifications from Amazon SES for bounces, complaints, and delivery confirmations
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import forge from 'npm:node-forge@1.3.1';
import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

interface SNSMessage {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  Token?: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  UnsubscribeURL: string;
  SubscribeURL?: string;
}

// Only AWS-hosted SNS endpoints are trusted for the signing certificate and the
// subscription-confirmation callback. This is the single guard that prevents both
// (a) certificate spoofing (forged events) and (b) the SubscriptionConfirmation
// SSRF where an attacker supplies an arbitrary SubscribeURL to be fetched from the
// Supabase egress IP.
function isTrustedSnsUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:') return false;
    // sns.<region>.amazonaws.com  or  sns.<region>.amazonaws.com.cn
    return /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/.test(u.hostname);
  } catch {
    return false;
  }
}

// Build the exact canonical string AWS signs, per the SNS message-signature spec.
// Field order is fixed and Subject is included only when present.
function buildStringToSign(msg: SNSMessage): string | null {
  const lines: string[] = [];
  const add = (k: string, v: unknown) => {
    lines.push(k);
    lines.push(String(v ?? ''));
  };
  if (msg.Type === 'Notification') {
    add('Message', msg.Message);
    add('MessageId', msg.MessageId);
    if (msg.Subject !== undefined) add('Subject', msg.Subject);
    add('Timestamp', msg.Timestamp);
    add('TopicArn', msg.TopicArn);
    add('Type', msg.Type);
  } else if (msg.Type === 'SubscriptionConfirmation' || msg.Type === 'UnsubscribeConfirmation') {
    add('Message', msg.Message);
    add('MessageId', msg.MessageId);
    add('SubscribeURL', msg.SubscribeURL);
    add('Timestamp', msg.Timestamp);
    add('Token', msg.Token);
    add('TopicArn', msg.TopicArn);
    add('Type', msg.Type);
  } else {
    return null;
  }
  return lines.join('\n') + '\n';
}

// Cache fetched signing certs per worker — AWS rotates them rarely.
const _certCache = new Map<string, string>();

async function verifySnsSignature(msg: SNSMessage): Promise<boolean> {
  try {
    if (!msg.Signature || !msg.SigningCertURL) return false;
    if (!isTrustedSnsUrl(msg.SigningCertURL)) {
      console.error('SNS: untrusted SigningCertURL host:', msg.SigningCertURL);
      return false;
    }
    const stringToSign = buildStringToSign(msg);
    if (stringToSign === null) return false;

    let pem = _certCache.get(msg.SigningCertURL);
    if (!pem) {
      const resp = await fetch(msg.SigningCertURL);
      if (!resp.ok) return false;
      pem = await resp.text();
      _certCache.set(msg.SigningCertURL, pem);
    }

    const cert = forge.pki.certificateFromPem(pem);
    const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;
    // SignatureVersion "1" → SHA1, "2" → SHA256.
    const md = msg.SignatureVersion === '2' ? forge.md.sha256.create() : forge.md.sha1.create();
    md.update(stringToSign, 'utf8');
    return publicKey.verify(md.digest().bytes(), forge.util.decode64(msg.Signature));
  } catch (e) {
    console.error('SNS signature verification error:', e);
    return false;
  }
}

interface SESBounce {
  bounceType: string;
  bounceSubType: string;
  bouncedRecipients: Array<{
    emailAddress: string;
    action?: string;
    status?: string;
    diagnosticCode?: string;
  }>;
  timestamp: string;
  feedbackId: string;
}

interface SESComplaint {
  complainedRecipients: Array<{
    emailAddress: string;
  }>;
  timestamp: string;
  feedbackId: string;
  complaintFeedbackType?: string;
}

interface SESDelivery {
  timestamp: string;
  recipients: string[];
  processingTimeMillis: number;
  smtpResponse: string;
}

serve(withApiLogging('ses-webhook', async (req) => {
  await bootstrapForFunction();
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const snsMessage: SNSMessage = await req.json();

    // Verify the SNS message signature BEFORE acting on it. Without this, anyone can
    // POST forged bounce/complaint events (suppression-list / reputation tampering) and
    // the SubscriptionConfirmation branch is a blind SSRF. Fail closed on any doubt.
    const signatureValid = await verifySnsSignature(snsMessage);
    if (!signatureValid) {
      console.error('SES webhook: invalid SNS signature — rejecting');
      return new Response(JSON.stringify({ error: 'Invalid SNS signature' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    // Handle SNS subscription confirmation
    if (snsMessage.Type === 'SubscriptionConfirmation') {
      console.log('SNS Subscription Confirmation:', snsMessage.SubscribeURL);

      // Auto-confirm subscription — only ever fetch an AWS-hosted SNS URL (the signature
      // is already verified above; this is belt-and-braces against SSRF).
      if (snsMessage.SubscribeURL && isTrustedSnsUrl(snsMessage.SubscribeURL)) {
        await fetch(snsMessage.SubscribeURL);
      } else {
        console.error('SES webhook: refusing to fetch untrusted SubscribeURL');
      }

      return new Response(JSON.stringify({ message: 'Subscription confirmed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Handle SNS notification
    if (snsMessage.Type === 'Notification') {
      const message = JSON.parse(snsMessage.Message);
      const notificationType = message.notificationType;
      const mail = message.mail;

      console.log('SES Notification:', notificationType, mail);

      // Find the email log entry
      const messageId = mail.messageId;
      const { data: emailLog } = await supabase
        .from('email_logs')
        .select('id')
        .eq('message_id', messageId)
        .single();

      if (!emailLog) {
        console.warn('Email log not found for message:', messageId);
        return new Response(JSON.stringify({ message: 'Email log not found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      // Handle different notification types
      switch (notificationType) {
        case 'Bounce': {
          const bounce: SESBounce = message.bounce;
          const bounceType = bounce.bounceType;
          const isPermanent = bounceType === 'Permanent';

          // Update email log
          await supabase
            .from('email_logs')
            .update({
              status: 'bounced',
              bounced_at: bounce.timestamp,
              bounce_type: bounceType,
              bounce_subtype: bounce.bounceSubType,
              error_message: bounce.bouncedRecipients[0]?.diagnosticCode || 'Email bounced',
            })
            .eq('id', emailLog.id);

          // Update campaign recipients if applicable
          for (const recipient of bounce.bouncedRecipients) {
            await supabase
              .from('campaign_recipients')
              .update({
                status: 'bounced',
                bounced_at: bounce.timestamp,
                error_message: recipient.diagnosticCode || 'Email bounced',
              })
              .eq('email_log_id', emailLog.id)
              .eq('email', recipient.emailAddress);
          }

          console.log('Processed bounce:', bounceType, bounce.bouncedRecipients.length, 'recipients');
          break;
        }

        case 'Complaint': {
          const complaint: SESComplaint = message.complaint;

          // Update email log
          await supabase
            .from('email_logs')
            .update({
              status: 'complained',
              complained_at: complaint.timestamp,
            })
            .eq('id', emailLog.id);

          // Update campaign recipients
          for (const recipient of complaint.complainedRecipients) {
            await supabase
              .from('campaign_recipients')
              .update({
                status: 'complained',
                complained_at: complaint.timestamp,
              })
              .eq('email_log_id', emailLog.id)
              .eq('email', recipient.emailAddress);
          }

          console.log('Processed complaint:', complaint.complainedRecipients.length, 'recipients');
          break;
        }

        case 'Delivery': {
          const delivery: SESDelivery = message.delivery;

          // Update email log
          await supabase
            .from('email_logs')
            .update({
              status: 'delivered',
              delivered_at: delivery.timestamp,
            })
            .eq('id', emailLog.id);

          // Update campaign recipients
          for (const recipient of delivery.recipients) {
            await supabase
              .from('campaign_recipients')
              .update({
                status: 'sent',
                delivered_at: delivery.timestamp,
              })
              .eq('email_log_id', emailLog.id)
              .eq('email', recipient);
          }

          console.log('Processed delivery:', delivery.recipients.length, 'recipients');
          break;
        }

        default:
          console.log('Unknown notification type:', notificationType);
      }

      return new Response(JSON.stringify({ message: 'Notification processed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    return new Response(JSON.stringify({ message: 'Unknown SNS message type' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  } catch (error) {
    console.error('Error processing SES webhook:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
}));

