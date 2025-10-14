#!/usr/bin/env node

/**
 * Debug MIVAA Service Status
 * 
 * This script checks the MIVAA service status and provides diagnostic information
 * to help identify why the service is returning 502 Bad Gateway errors.
 */

import https from 'https';
import http from 'http';
import { promises as dns } from 'dns';

const MIVAA_BASE_URL = 'https://v1api.materialshub.gr';

console.log('🔍 MIVAA Service Status Diagnostic');
console.log('=====================================');
console.log(`🌐 Base URL: ${MIVAA_BASE_URL}`);
console.log(`🕐 Started: ${new Date().toLocaleString()}`);
console.log('');

/**
 * Test HTTP connectivity to MIVAA service
 */
async function testConnectivity() {
  console.log('📡 Testing Basic Connectivity...');
  console.log('----------------------------------');
  
  try {
    const response = await fetch(MIVAA_BASE_URL, {
      method: 'GET',
      timeout: 10000
    });
    
    console.log(`✅ Connection Status: ${response.status} ${response.statusText}`);
    console.log(`📊 Response Headers:`, Object.fromEntries(response.headers.entries()));
    
    if (response.status === 502) {
      console.log('❌ 502 Bad Gateway detected - Backend service is down');
      return false;
    }
    
    return true;
  } catch (error) {
    console.log(`❌ Connection failed: ${error.message}`);
    return false;
  }
}

/**
 * Test MIVAA health endpoint
 */
async function testHealthEndpoint() {
  console.log('\n🏥 Testing Health Endpoint...');
  console.log('------------------------------');
  
  try {
    const response = await fetch(`${MIVAA_BASE_URL}/health`, {
      method: 'GET',
      timeout: 10000
    });
    
    console.log(`📊 Health Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Health Response:', JSON.stringify(data, null, 2));
      return true;
    } else {
      const text = await response.text();
      console.log(`❌ Health Check Failed: ${text.substring(0, 200)}...`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Health check failed: ${error.message}`);
    return false;
  }
}

/**
 * Test MIVAA API endpoints
 */
async function testAPIEndpoints() {
  console.log('\n🔧 Testing API Endpoints...');
  console.log('----------------------------');
  
  const endpoints = [
    '/api/v1/health',
    '/metrics',
    '/performance/summary'
  ];
  
  for (const endpoint of endpoints) {
    try {
      console.log(`Testing: ${endpoint}`);
      const response = await fetch(`${MIVAA_BASE_URL}${endpoint}`, {
        method: 'GET',
        timeout: 5000
      });
      
      console.log(`  Status: ${response.status} ${response.statusText}`);
      
      if (response.status === 502) {
        console.log(`  ❌ 502 Bad Gateway - Service unavailable`);
      } else if (response.ok) {
        console.log(`  ✅ Endpoint responding`);
      } else {
        console.log(`  ⚠️ Unexpected status: ${response.status}`);
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }
}

/**
 * Check DNS resolution
 */
async function checkDNS() {
  console.log('\n🌐 DNS Resolution Check...');
  console.log('--------------------------');
  
  try {
    const result = await dns.lookup('v1api.materialshub.gr');
    console.log(`✅ DNS Resolution: ${result.address} (${result.family})`);
    return true;
  } catch (error) {
    console.log(`❌ DNS Resolution failed: ${error.message}`);
    return false;
  }
}

/**
 * Test SSL certificate
 */
async function checkSSL() {
  console.log('\n🔒 SSL Certificate Check...');
  console.log('----------------------------');
  
  return new Promise((resolve) => {
    const options = {
      hostname: 'v1api.materialshub.gr',
      port: 443,
      method: 'GET',
      timeout: 5000
    };
    
    const req = https.request(options, (res) => {
      const cert = res.socket.getPeerCertificate();
      console.log(`✅ SSL Certificate Valid`);
      console.log(`   Subject: ${cert.subject?.CN || 'Unknown'}`);
      console.log(`   Issuer: ${cert.issuer?.CN || 'Unknown'}`);
      console.log(`   Valid From: ${cert.valid_from}`);
      console.log(`   Valid To: ${cert.valid_to}`);
      resolve(true);
    });
    
    req.on('error', (error) => {
      console.log(`❌ SSL Error: ${error.message}`);
      resolve(false);
    });
    
    req.on('timeout', () => {
      console.log(`❌ SSL Timeout`);
      req.destroy();
      resolve(false);
    });
    
    req.end();
  });
}

/**
 * Main diagnostic function
 */
async function runDiagnostics() {
  const results = {
    dns: await checkDNS(),
    ssl: await checkSSL(),
    connectivity: await testConnectivity(),
    health: await testHealthEndpoint(),
    api: await testAPIEndpoints()
  };
  
  console.log('\n📋 Diagnostic Summary');
  console.log('=====================');
  console.log(`DNS Resolution: ${results.dns ? '✅ OK' : '❌ FAILED'}`);
  console.log(`SSL Certificate: ${results.ssl ? '✅ OK' : '❌ FAILED'}`);
  console.log(`Basic Connectivity: ${results.connectivity ? '✅ OK' : '❌ FAILED'}`);
  console.log(`Health Endpoint: ${results.health ? '✅ OK' : '❌ FAILED'}`);
  
  if (!results.connectivity || !results.health) {
    console.log('\n🚨 MIVAA Service Issues Detected');
    console.log('=================================');
    console.log('The MIVAA service appears to be down or misconfigured.');
    console.log('This explains why the frontend is receiving fallback responses.');
    console.log('');
    console.log('Recommended Actions:');
    console.log('1. Check MIVAA service deployment status');
    console.log('2. Verify Docker containers are running');
    console.log('3. Check nginx configuration');
    console.log('4. Review MIVAA service logs');
    console.log('5. Restart MIVAA service if necessary');
  } else {
    console.log('\n✅ MIVAA Service appears to be healthy');
  }
  
  console.log(`\n🕐 Completed: ${new Date().toLocaleString()}`);
}

// Run diagnostics
runDiagnostics().catch(console.error);
