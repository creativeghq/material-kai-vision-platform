# Implementation Plan: Visionary Design System

## 1. Tailwind Configuration (`tailwind.config.ts`)

We need to overhaul the theme configuration to support the "Dark Mode First" aesthetic.

### Colors
Add a new `vision` palette extension:
```typescript
extend: {
  colors: {
    vision: {
      bg: '#030305',
      base: '#0A0A12',
      surface: '#12121A',
      border: '#1E293B',
      text: {
        primary: '#FFFFFF',
        secondary: '#94A3B8',
        muted: '#475569',
      },
      accent: {
        cyan: '#00F0FF',
        purple: '#7000FF',
        green: '#39FF14',
        pink: '#FF0055',
      }
    }
  }
}
```

### Fonts
We will use Google Fonts via a link tag in the component (or `index.html`), but define them here:
```typescript
fontFamily: {
  sans: ['Inter', 'sans-serif'],
  display: ['Space Grotesk', 'sans-serif'],
  mono: ['JetBrains Mono', 'monospace'],
}
```

### Animations
Add "breathing" glows and slow movements:
```typescript
keyframes: {
  'aurora-flow': {
    '0%': { backgroundPosition: '0% 50%' },
    '50%': { backgroundPosition: '100% 50%' },
    '100%': { backgroundPosition: '0% 50%' },
  },
  'glow-pulse': {
    '0%, 100%': { opacity: '0.5' },
    '50%': { opacity: '1' },
  }
},
animation: {
  'aurora': 'aurora-flow 15s ease infinite',
  'glow': 'glow-pulse 3s ease-in-out infinite',
}
```

## 2. CSS Strategies (`src/App.css` or Tailwind Layers)

### The "Aurora" Background
A fixed background layer with multiple radial gradients that blend together.
```css
.bg-aurora {
  background: 
    radial-gradient(circle at 0% 0%, rgba(112, 0, 255, 0.1) 0%, transparent 50%),
    radial-gradient(circle at 100% 0%, rgba(0, 240, 255, 0.1) 0%, transparent 50%),
    #030305;
}
```

### Obsidian Glass
```css
.glass-panel {
  background: rgba(10, 10, 18, 0.6);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
}
```

### Glowing Borders (The "Neon" Effect)
Using a pseudo-element or a wrapper div with a gradient background that is slightly larger than the content.

## 3. `DesignPreview.tsx` Structure

The page will be a single-page showcase of the system.

```tsx
<div className="min-h-screen bg-vision-bg text-vision-text-primary font-sans selection:bg-vision-accent-cyan/30">
  <div className="fixed inset-0 bg-aurora pointer-events-none" />
  
  <div className="relative z-10 container mx-auto p-8">
    <Header />
    
    <Hero />
    
    <BentoGrid>
      <Card size="large">AI Analysis Module</Card>
      <Card size="small">System Status</Card>
      <Card size="small">Network Activity</Card>
      <Card size="medium">3D Viewport</Card>
    </BentoGrid>
    
    <ComponentShowcase />
  </div>
</div>
```

## 4. Action Items for Code Mode

1.  **Install Fonts:** Add `Space Grotesk` and `JetBrains Mono` to `index.html` or load in `App.tsx`.
2.  **Update Tailwind:** Modify `tailwind.config.ts` with the new colors and fonts.
3.  **Create Utilities:** Add the CSS classes for glass and aurora in `src/App.css`.
4.  **Rewrite `DesignPreview.tsx`:** Implement the new layout and components.