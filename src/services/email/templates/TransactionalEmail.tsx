/**
 * Transactional Email Template
 * Generic template for transactional emails (order confirmations, notifications, etc.)
 */

import React from 'react';
import { Text, Button, Section, Hr } from '@react-email/components';
import { BaseEmailTemplate } from './BaseEmailTemplate';

export interface TransactionalEmailProps {
  title: string;
  message: string;
  actionUrl?: string;
  actionText?: string;
  additionalInfo?: Array<{ label: string; value: string }>;
}

export const TransactionalEmail: React.FC<TransactionalEmailProps> = ({
  title,
  message,
  actionUrl,
  actionText = 'View Details',
  additionalInfo = [],
}) => {
  return (
    <BaseEmailTemplate previewText={title}>
      <Section>
        <Text style={heading}>{title}</Text>
        <Text style={paragraph}>{message}</Text>

        {additionalInfo.length > 0 && (
          <>
            <Hr style={hr} />
            <Section style={infoSection}>
              {additionalInfo.map((info, index) => (
                <div key={index} style={infoRow}>
                  <Text style={infoLabel}>{info.label}:</Text>
                  <Text style={infoValue}>{info.value}</Text>
                </div>
              ))}
            </Section>
            <Hr style={hr} />
          </>
        )}

        {actionUrl && (
          <Section style={buttonContainer}>
            <Button style={button} href={actionUrl}>
              {actionText}
            </Button>
          </Section>
        )}

        <Text style={footerNote}>
          This is an automated message. Please do not reply to this email.
        </Text>
      </Section>
    </BaseEmailTemplate>
  );
};

// Styles
const heading = {
  fontSize: '24px',
  fontWeight: '700',
  color: '#1a1a1a',
  marginBottom: '24px',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '24px',
  color: '#525252',
  marginBottom: '24px',
};

const hr = {
  borderColor: '#e6ebf1',
  margin: '24px 0',
};

const infoSection = {
  backgroundColor: '#f6f9fc',
  padding: '20px',
  borderRadius: '6px',
  marginBottom: '24px',
};

const infoRow = {
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: '12px',
};

const infoLabel = {
  fontSize: '14px',
  fontWeight: '600',
  color: '#1a1a1a',
  margin: '0',
};

const infoValue = {
  fontSize: '14px',
  color: '#525252',
  margin: '0',
};

const buttonContainer = {
  textAlign: 'center' as const,
  margin: '32px 0',
};

const button = {
  backgroundColor: '#1a1a1a',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 32px',
};

const footerNote = {
  fontSize: '14px',
  color: '#8898aa',
  marginTop: '32px',
  fontStyle: 'italic',
};

export default TransactionalEmail;

