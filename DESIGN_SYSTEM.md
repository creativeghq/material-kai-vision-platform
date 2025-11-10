# MIVAA Platform Design System

## Overview
Modern, warm design system inspired by contemporary UI/UX patterns with a focus on clarity, warmth, and professional aesthetics.

## Color Palette

### Primary Colors
- **Background**: `hsl(40 33% 94%)` - Warm beige/cream background
- **Foreground**: `hsl(30 10% 15%)` - Dark charcoal text
- **Primary (Accent)**: `hsl(45 95% 60%)` - Vibrant yellow/gold
- **Card**: `hsl(40 40% 97%)` - Lighter cream for elevated surfaces

### Sidebar Colors
- **Background**: `hsl(30 15% 25%)` - Dark charcoal
- **Foreground**: `hsl(40 33% 94%)` - Light text on dark
- **Accent**: Yellow highlight for active states

### Status Colors
- **Success**: `hsl(142 76% 36%)` - Green
- **Warning**: `hsl(38 92% 50%)` - Orange
- **Info**: `hsl(199 89% 48%)` - Blue
- **Destructive**: `hsl(0 70% 50%)` - Red

## Typography

### Font Weights
- Regular: 400
- Medium: 500
- Semibold: 600
- Bold: 700

### Text Sizes
- Small: 0.875rem (14px)
- Base: 1rem (16px)
- Large: 1.125rem (18px)
- XL: 1.25rem (20px)
- 2XL: 1.5rem (24px)
- 3XL: 1.875rem (30px)
- 4XL: 2.25rem (36px)

## Components

### Buttons
- **Default**: Yellow background, rounded-full, shadow on hover
- **Secondary**: Dark charcoal background, rounded-full
- **Ghost**: Transparent with hover state
- **Outline**: Border with transparent background

**Sizes**:
- Small: h-9, px-4
- Default: h-11, px-6
- Large: h-12, px-8
- Icon: h-10, w-10

### Input Fields
- Height: 48px (h-12)
- Border radius: 12px (rounded-xl)
- Background: Light input color
- Border: Subtle border
- Focus: Ring with yellow accent
- Shadow: Subtle shadow, enhanced on focus

### Cards
- Border radius: 16px (rounded-2xl)
- Background: Card color (lighter cream)
- Shadow: Soft shadow with hover elevation
- Border: Subtle border
- Transition: Smooth transform on hover

### Badges
- Rounded-full
- Padding: px-3, py-1
- Variants: default, secondary, destructive, success, warning, info, outline
- Shadow: Subtle shadow

### Progress Bars
- Height: 12px (h-3)
- Border radius: Full (rounded-full)
- Background: Muted color
- Fill: Primary yellow with smooth transition
- Shadow: Inner shadow on track

## Layout

### Sidebar
- Width (collapsed): 80px (w-20)
- Width (expanded): 288px (w-72)
- Background: Dark charcoal
- Active state: Yellow background with shadow
- Icons: Larger, more prominent
- Border radius: 16px (rounded-2xl) for items

### Header
- Height: 80px (h-20)
- Background: Semi-transparent card with backdrop blur
- Sticky positioning
- Search bar: Prominent, centered
- Icons: Larger, clearer

### Content Area
- Max width: 1280px (max-w-7xl) for centered content
- Padding: Generous spacing (px-8, py-12)
- Background: Gradient from background to primary/10

## Spacing Scale
- xs: 0.25rem (4px)
- sm: 0.5rem (8px)
- md: 1rem (16px)
- lg: 1.5rem (24px)
- xl: 2rem (32px)
- 2xl: 3rem (48px)
- 3xl: 4rem (64px)

## Border Radius
- sm: 8px
- md: 12px
- lg: 16px
- xl: 20px
- 2xl: 24px
- full: 9999px

## Shadows
- **Subtle**: `0 2px 8px hsl(30 10% 15% / 0.08)`
- **Card**: `0 4px 12px hsl(30 10% 15% / 0.1)`
- **Medium**: `0 8px 20px hsl(30 10% 15% / 0.12)`
- **Glow**: `0 0 30px hsl(45 95% 60% / 0.3)` (for yellow accent)

## Animations

### Transitions
- **Smooth**: `all 0.3s cubic-bezier(0.4, 0, 0.2, 1)`
- **Bounce**: `all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)`

### Keyframes
- **Float**: Gentle up/down movement
- **Pulse Glow**: Pulsing shadow effect
- **Slide In**: Fade and slide from bottom
- **Gradient Shift**: Animated gradient background

## Design Principles

1. **Warmth**: Use warm beige/cream tones for a welcoming feel
2. **Clarity**: High contrast text, clear hierarchy
3. **Consistency**: Rounded corners throughout (16px standard)
4. **Elevation**: Use shadows to create depth
5. **Feedback**: Smooth transitions and hover states
6. **Accessibility**: Maintain WCAG AA contrast ratios
7. **Modern**: Contemporary rounded, soft aesthetic
8. **Professional**: Clean, organized layouts

## Usage Examples

### Modern Card
```tsx
<Card className="modern-card p-6">
  <h3 className="text-2xl font-bold mb-2">Title</h3>
  <p className="text-muted-foreground">Description</p>
</Card>
```

### Yellow Accent Button
```tsx
<Button className="btn-yellow">
  Submit
</Button>
```

### Status Badge
```tsx
<Badge variant="success">Active</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="info">Info</Badge>
```

### Progress Indicator
```tsx
<Progress value={70} className="h-3" />
```

## File Structure
- `src/index.css` - Global styles and CSS variables
- `tailwind.config.ts` - Tailwind configuration
- `src/components/ui/*` - Reusable UI components
- `src/components/Layout/*` - Layout components (Header, Sidebar)

## Implementation Notes
- All colors use HSL format for easy manipulation
- CSS variables allow for easy theming
- Tailwind utilities for rapid development
- Component-based architecture for consistency
- Responsive design with mobile-first approach

