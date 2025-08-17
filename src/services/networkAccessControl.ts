/**
 * Network Access Control Manager
 * Manages internal/external API access and security policies
 */

import { supabase } from '@/integrations/supabase/client';

interface AccessControlRule {
  id: string;
  name: string;
  cidr_range: string;
  is_active: boolean;
  description?: string;
  created_at: string;
  updated_at: string;
}

interface AccessControlCheck {
  isInternal: boolean;
  isAllowed: boolean;
  rule?: AccessControlRule;
  reason: string;
}

interface NetworkPolicy {
  allowInternal: boolean;
  allowExternal: boolean;
  rateLimitInternal: number;
  rateLimitExternal: number;
  blacklist: string[];
  whitelist: string[];
}

export class NetworkAccessControl {
  private static instance: NetworkAccessControl;
  private cachedRules: AccessControlRule[] = [];
  private lastCacheUpdate = 0;
  private cacheExpiry = 300000; // 5 minutes

  static getInstance(): NetworkAccessControl {
    if (!NetworkAccessControl.instance) {
      NetworkAccessControl.instance = new NetworkAccessControl();
    }
    return NetworkAccessControl.instance;
  }

  /**
   * Check if an IP address is allowed access
   */
  async checkAccess(ipAddress: string, endpoint?: string): Promise<AccessControlCheck> {
    try {
      // Refresh cache if needed
      await this.refreshRulesCache();

      // Check against internal networks
      const { data: isInternal, error } = await supabase
        .rpc('is_internal_ip', { ip_addr: ipAddress });

      if (error) {
        console.error('Error checking internal IP:', error);
        return {
          isInternal: false,
          isAllowed: true, // Default allow on error
          reason: 'Error checking access rules - defaulting to allow',
        };
      }

      // Check specific rules for this IP
      const matchingRule = this.findMatchingRule(ipAddress);

      if (matchingRule && !matchingRule.is_active) {
        return {
          isInternal: !!isInternal,
          isAllowed: false,
          rule: matchingRule,
          reason: `Access denied by rule: ${matchingRule.name}`,
        };
      }

      return {
        isInternal: !!isInternal,
        isAllowed: true,
        rule: matchingRule,
        reason: isInternal ? 'Internal network access' : 'External access allowed',
      };

    } catch (error) {
      console.error('Network access check failed:', error);
      return {
        isInternal: false,
        isAllowed: true, // Fail open for availability
        reason: 'Access check failed - defaulting to allow',
      };
    }
  }

  /**
   * Add a new access control rule
   */
  async addAccessRule(rule: Omit<AccessControlRule, 'id' | 'created_at' | 'updated_at'>): Promise<AccessControlRule> {
    const { data, error } = await supabase
      .from('internal_networks')
      .insert([rule])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to add access rule: ${error.message}`);
    }

    // Refresh cache
    this.invalidateCache();
    await this.refreshRulesCache();

    return data;
  }

  /**
   * Update an existing access control rule
   */
  async updateAccessRule(id: string, updates: Partial<AccessControlRule>): Promise<AccessControlRule> {
    const { data, error } = await supabase
      .from('internal_networks')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update access rule: ${error.message}`);
    }

    // Refresh cache
    this.invalidateCache();
    await this.refreshRulesCache();

    return data;
  }

  /**
   * Delete an access control rule
   */
  async deleteAccessRule(id: string): Promise<void> {
    const { error } = await supabase
      .from('internal_networks')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete access rule: ${error.message}`);
    }

    // Refresh cache
    this.invalidateCache();
    await this.refreshRulesCache();
  }

  /**
   * Get all access control rules
   */
  async getAllRules(): Promise<AccessControlRule[]> {
    await this.refreshRulesCache();
    return this.cachedRules;
  }

  /**
   * Get active access control rules only
   */
  async getActiveRules(): Promise<AccessControlRule[]> {
    const allRules = await this.getAllRules();
    return allRules.filter(rule => rule.is_active);
  }

  /**
   * Check if an IP is in a CIDR range
   */
  isIPInCIDR(ip: string, cidr: string): boolean {
    try {
      const [network, prefixLength] = cidr.split('/');
      const prefixLengthNum = parseInt(prefixLength, 10);

      if (prefixLengthNum === 32) {
        return ip === network;
      }

      const ipNum = this.ipToNumber(ip);
      const networkNum = this.ipToNumber(network);
      const mask = (-1 << (32 - prefixLengthNum)) >>> 0;

      return (ipNum & mask) === (networkNum & mask);
    } catch (error) {
      console.error('Error checking CIDR:', error);
      return false;
    }
  }

  /**
   * Get network policies for different access levels
   */
  getNetworkPolicies(): { internal: NetworkPolicy; external: NetworkPolicy } {
    return {
      internal: {
        allowInternal: true,
        allowExternal: true,
        rateLimitInternal: 1000, // requests per minute
        rateLimitExternal: 100,
        blacklist: [],
        whitelist: ['*'], // All internal IPs allowed
      },
      external: {
        allowInternal: false,
        allowExternal: true,
        rateLimitInternal: 0,
        rateLimitExternal: 60, // More restrictive for external
        blacklist: [
          '0.0.0.0/8',     // Invalid addresses
          '127.0.0.0/8',   // Loopback (shouldn't reach here anyway)
          '169.254.0.0/16', // Link-local
        ],
        whitelist: [],
      },
    };
  }

  /**
   * Validate CIDR format
   */
  validateCIDR(cidr: string): boolean {
    const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
    if (!cidrRegex.test(cidr)) {
      return false;
    }

    const [ip, prefix] = cidr.split('/');
    const prefixNum = parseInt(prefix, 10);

    if (prefixNum < 0 || prefixNum > 32) {
      return false;
    }

    const ipParts = ip.split('.').map(part => parseInt(part, 10));
    return ipParts.every(part => part >= 0 && part <= 255);
  }

  /**
   * Get suggested CIDR ranges for common network types
   */
  getSuggestedCIDRRanges(): { name: string; cidr: string; description: string }[] {
    return [
      {
        name: 'Private Class A',
        cidr: '10.0.0.0/8',
        description: 'Large private networks (10.0.0.0 - 10.255.255.255)',
      },
      {
        name: 'Private Class B',
        cidr: '172.16.0.0/12',
        description: 'Medium private networks (172.16.0.0 - 172.31.255.255)',
      },
      {
        name: 'Private Class C',
        cidr: '192.168.0.0/16',
        description: 'Small private networks (192.168.0.0 - 192.168.255.255)',
      },
      {
        name: 'Localhost',
        cidr: '127.0.0.0/8',
        description: 'Local machine only',
      },
      {
        name: 'Single IP',
        cidr: '0.0.0.0/32',
        description: 'Specific single IP address',
      },
    ];
  }

  /**
   * Generate access control report
   */
  async generateAccessReport(days: number = 7): Promise<{
    totalRequests: number;
    internalRequests: number;
    externalRequests: number;
    blockedRequests: number;
    topIPs: { ip: string; requests: number }[];
    ruleUsage: { rule: string; hits: number }[];
  }> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

    const { data: usageLogs, error } = await supabase
      .from('api_usage_logs')
      .select('ip_address, is_internal_request, rate_limit_exceeded, created_at')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (error || !usageLogs) {
      throw new Error(`Failed to generate access report: ${error?.message}`);
    }

    const totalRequests = usageLogs.length;
    const internalRequests = usageLogs.filter(log => log.is_internal_request).length;
    const externalRequests = totalRequests - internalRequests;
    const blockedRequests = usageLogs.filter(log => log.rate_limit_exceeded).length;

    // Calculate top IPs
    const ipCounts = usageLogs.reduce((acc, log) => {
      const ip = log.ip_address.toString();
      acc[ip] = (acc[ip] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topIPs = Object.entries(ipCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([ip, requests]) => ({ ip, requests }));

    return {
      totalRequests,
      internalRequests,
      externalRequests,
      blockedRequests,
      topIPs,
      ruleUsage: [], // Would need additional tracking for rule-specific hits
    };
  }

  // Private helper methods

  private async refreshRulesCache(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCacheUpdate < this.cacheExpiry) {
      return; // Cache still valid
    }

    try {
      const { data, error } = await supabase
        .from('internal_networks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch access rules:', error);
        return;
      }

      this.cachedRules = data || [];
      this.lastCacheUpdate = now;
    } catch (error) {
      console.error('Error refreshing rules cache:', error);
    }
  }

  private findMatchingRule(ipAddress: string): AccessControlRule | undefined {
    return this.cachedRules.find(rule =>
      rule.is_active && this.isIPInCIDR(ipAddress, rule.cidr_range),
    );
  }

  private invalidateCache(): void {
    this.lastCacheUpdate = 0;
  }

  private ipToNumber(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  }
}

export const networkAccessControl = NetworkAccessControl.getInstance();
