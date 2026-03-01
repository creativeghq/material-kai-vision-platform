# Price Monitoring System

## Overview

The Price Monitoring System enables Factory and Store users to track competitor prices for their products across multiple sources. The system uses Firecrawl for web scraping and provides automated monitoring, price alerts, and comprehensive analytics.

## Architecture

### Database Schema

#### Core Tables

1. **price_monitoring_products**
   - Tracks which products are being monitored
   - Stores monitoring settings (frequency, enabled/disabled)
   - Manages scheduling (next_check_at, last_check_at)
   - Status tracking (active, paused, error)

2. **price_history**
   - Historical price data from all sources
   - Includes price, currency, availability
   - Metadata for additional information (shipping, discounts)
   - Indexed for fast queries by product and date

3. **competitor_sources**
   - Competitor website URLs and configurations
   - Firecrawl-specific scraping settings
   - Error tracking and success metrics
   - Active/inactive status

4. **price_monitoring_jobs**
   - Tracks scheduled and on-demand monitoring jobs
   - Records sources checked, prices found, credits consumed
   - Job status (pending, running, completed, failed)
   - Performance metrics

5. **price_alerts**
   - User notification preferences
   - Alert types (price_drop, price_increase, any_change, availability)
   - Thresholds (percentage or absolute amount)
   - Notification channels (email, in-app)

6. **product_usage_stats** (ADMIN ONLY)
   - Product usage across platform features
   - MoodBoard, Quote, Search, View counts
   - Engagement metrics
   - Protected by RLS policies

7. **price_alert_history**
   - History of triggered alerts
   - Price change details
   - Notification status

### Database Functions

- `get_latest_price()` - Get most recent price for a product/source
- `calculate_price_change()` - Calculate percentage change between prices
- `should_trigger_alert()` - Determine if alert conditions are met
- `get_products_due_for_monitoring()` - Find products needing price checks
- `update_next_check_time()` - Schedule next monitoring check
- `get_price_statistics()` - Calculate min/max/avg prices and trends
- `increment_product_usage()` - Track product usage (admin only)

### Row Level Security (RLS)

All tables have RLS enabled with role-based policies:

- **Users** can view/manage their own monitoring products and alerts
- **Factory/Store users** have access to price monitoring features
- **Admin/Owner** have full access to all data
- **product_usage_stats** is ADMIN-ONLY (strictly enforced)
- System/backend can insert price history and job records

### Edge Functions

#### 1. price-monitoring
**Endpoint:** `/functions/v1/price-monitoring`

**Actions:**
- `start_monitoring` - Enable monitoring for a product
- `stop_monitoring` - Pause monitoring for a product
- `check_now` - Trigger immediate price check (on-demand)
- `get_status` - Get monitoring status and recent data

**Request format:** JSON body with an `action` field and a `productId` field. For `start_monitoring`, also include a `monitoringSettings` object with `frequency` and `enabled` fields.

**Response format:** JSON with `success` (boolean), `message` (string), and for `start_monitoring` a `monitoring` object containing id, product_id, monitoring_frequency, and next_check_at.

#### 2. price-monitoring-cron
**Endpoint:** `/functions/v1/price-monitoring-cron`

**Purpose:** Scheduled job that runs hourly to check products due for monitoring

**Security:** Requires `x-cron-secret` header

**Process:**
1. Fetch products due for monitoring
2. Create monitoring jobs
3. Scrape competitor sources using Firecrawl
4. Save price history
5. Check and trigger price alerts
6. Update next check times

**Response:** JSON with success, message, and stats (total, processed, succeeded, failed).

### Firecrawl Integration

The system uses Firecrawl v2 API for web scraping:

**Features Used:**
- Markdown extraction for content
- Structured data extraction with custom schemas
- Browser actions for dynamic content
- Timeout configuration

**Price Extraction Schema:** The schema extracts four string fields from each page: price (product price), currency (currency code), availability (stock status), and shipping_cost.

**Credits:** Each scrape consumes approximately 1 Firecrawl credit

## Frontend Components

### PriceMonitoringDashboard
Main dashboard showing:
- Statistics cards (total monitored, price drops, credits used)
- Tabs for products, alerts, history, jobs
- Refresh and add product actions

### MonitoredProductsList
Table view of monitored products with:
- Product name and current price
- Price trend indicators (up/down/stable)
- Monitoring frequency and status
- Toggle monitoring on/off
- Check now button for on-demand checks

### PriceAlertsPanel
Manage price alerts:
- Create new alerts
- Configure thresholds
- Set notification channels
- View alert history

### PriceHistoryChart
Visualize price trends:
- Line charts showing price over time
- Multiple sources comparison
- Date range selection

### AddProductToMonitoring
Modal to add products:
- Product search/selection
- Configure monitoring frequency
- Add competitor sources

## User Roles and Access

### Factory Users
- Monitor their own products
- Track competitor prices
- Set up price alerts
- View price history and trends
- Access to all monitoring features

### Store Users
- Monitor products they're interested in
- Track supplier prices
- Set up price drop alerts
- Compare prices across suppliers

### Admin/Owner
- Full access to all monitoring data
- View product usage statistics
- Monitor system health
- Manage all users' monitoring settings

### Architect/Designer
- No access to price monitoring features
- Feature is hidden from their interface

## Deployment Instructions

### 1. Database Migration

Apply migrations using `supabase db push` or apply each migration file manually using psql. The migrations create all price monitoring tables, alert tables, RLS policies, and database functions.

### 2. Deploy Edge Functions

Deploy the price-monitoring and price-monitoring-cron functions using the Supabase CLI. Set the required environment secrets: `FIRECRAWL_API_KEY` and `CRON_SECRET`.

### 3. Configure Cron Job

Set up a cron job in the Supabase Dashboard under Database → Cron Jobs to call the price-monitoring-cron function on an hourly schedule (`0 * * * *`), passing the cron secret in the request headers.

### 4. Frontend Integration

Add the `/price-monitoring` route to your app router and render the `PriceMonitoringDashboard` component. Apply an auth guard so only Factory and Store users can access this route.

## Usage Guide

### For Factory Users

#### 1. Add Product to Monitoring

1. Navigate to Price Monitoring dashboard
2. Click "Add Product" button
3. Search and select your product
4. Configure monitoring settings:
   - Frequency: hourly, daily, weekly, or on-demand
   - Enable/disable monitoring
5. Add competitor sources:
   - Enter competitor website URLs
   - Configure scraping settings (optional)
6. Click "Start Monitoring"

#### 2. Add Competitor Sources

1. Go to monitored product
2. Click "Add Source"
3. Enter:
   - Source name (e.g., "Amazon", "TileBar")
   - Source URL (product page URL)
   - Scraping configuration (optional)
4. Save source

#### 3. Set Up Price Alerts

1. Navigate to "Price Alerts" tab
2. Click "New Alert"
3. Select product
4. Configure alert:
   - Alert type: price drop, price increase, any change
   - Threshold: percentage or dollar amount
   - Notification channels: email, in-app
5. Save alert

#### 4. Check Prices On-Demand

1. Go to "Monitored Products" tab
2. Find product in list
3. Click "Check Now" button
4. Wait for results (usually 10-30 seconds)
5. View updated prices in price history

### For Store Users

#### 1. Monitor Supplier Prices

1. Add products from your suppliers
2. Set monitoring frequency to daily or weekly
3. Set up price drop alerts to catch deals
4. Compare prices across multiple suppliers

#### 2. Track Price Trends

1. Navigate to "Price History" tab
2. Select product
3. View price chart over time
4. Identify best times to purchase

## API Reference

### Start Monitoring

Call `POST /functions/v1/price-monitoring` with Authorization header, Content-Type application/json, and a body containing `action: 'start_monitoring'`, `productId`, and `monitoringSettings` with `frequency` and `enabled` fields.

### Check Now

Call `POST /functions/v1/price-monitoring` with Authorization header and a body containing `action: 'check_now'` and `productId`.

### Get Status

Call `POST /functions/v1/price-monitoring` with Authorization header and a body containing `action: 'get_status'` and `productId`.

## Monitoring and Maintenance

### Health Checks

Monitor these metrics:
- Job success rate (should be >90%)
- Average scraping time per source
- Credits consumed per day
- Alert trigger rate

### Error Handling

Common errors and solutions:

1. **Firecrawl API errors**
   - Check API key validity
   - Verify credit balance
   - Review rate limits

2. **Scraping failures**
   - Update competitor source URLs
   - Adjust scraping configuration
   - Check website accessibility

3. **Alert not triggering**
   - Verify alert thresholds
   - Check notification channels
   - Review price history data

### Performance Optimization

- Batch process products in cron job (100 at a time)
- Cache product details to reduce database queries
- Use database indexes for fast price history queries
- Implement exponential backoff for failed scrapes

## Future Enhancements

1. **Advanced Analytics**
   - Price prediction using ML
   - Seasonal trend analysis
   - Competitor pricing strategies

2. **Bulk Operations**
   - Import competitor sources from CSV
   - Bulk enable/disable monitoring
   - Export price data

3. **Integrations**
   - Slack/Discord notifications
   - Webhook support for custom integrations
   - API for third-party tools

4. **UI Improvements**
   - Interactive price charts with zoom
   - Price comparison matrix
   - Mobile app support

## Support

For issues or questions:
- Check logs in Supabase Dashboard
- Review error messages in price_monitoring_jobs table
- Contact support with job ID for troubleshooting
