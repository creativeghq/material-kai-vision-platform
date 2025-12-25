/**
 * Welcome Email Template
 * Sent to new users when they sign up
 */

import React from 'react';
import { Text, Button, Section } from '@react-email/components';
import { BaseEmailTemplate } from './BaseEmailTemplate';

export interface WelcomeEmailProps {
  userName: string;
  loginUrl?: string;
}

export const WelcomeEmail: React.FC<WelcomeEmailProps> = ({
  userName = 'there',
  loginUrl = 'https://app.materialkai.com/login',
}) => {
  return (
    <BaseEmailTemplate previewText={`Welcome to Material Kai, ${userName}!`}>
      <Section>
        <Text style={heading}>Welcome to Material Kai! 🎉</Text>
        <Text style={paragraph}>
          Hi {userName},
        </Text>
        <Text style={paragraph}>
          We're thrilled to have you on board! Material Kai is your AI-powered platform for
          material discovery, visualization, and project management.
        </Text>
        <Text style={paragraph}>
          Here's what you can do with Material Kai:
        </Text>
        <ul style={list}>
          <li style={listItem}>🔍 Search and discover materials with AI-powered visual search</li>
          <li style={listItem}>📊 Manage your material library and projects</li>
          <li style={listItem}>🤖 Get intelligent recommendations based on your preferences</li>
          <li style={listItem}>📈 Track analytics and insights for your materials</li>
        </ul>
        <Section style={buttonContainer}>
          <Button style={button} href={loginUrl}>
            Get Started
          </Button>
        </Section>
        <Text style={paragraph}>
          If you have any questions, feel free to reach out to our support team.
        </Text>
        <Text style={paragraph}>
          Best regards,
          <br />
          The Material Kai Team
        </Text>
      </Section>
    </BaseEmailTemplate>
  );
};

// Styles
const heading = {
  fontSize: '28px',
  fontWeight: '700',
  color: '#1a1a1a',
  marginBottom: '24px',
};

const paragraph = {
  fontSize: '16px',
  lineHeight: '24px',
  color: '#525252',
  marginBottom: '16px',
};

const list = {
  paddingLeft: '20px',
  marginBottom: '16px',
};

const listItem = {
  fontSize: '16px',
  lineHeight: '24px',
  color: '#525252',
  marginBottom: '8px',
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

export default WelcomeEmail;

