import React, { useEffect } from 'react';
import { 
  LayoutDashboard, 
  BarChart3, 
  Settings, 
  Bell, 
  Search, 
  Plus, 
  Check, 
  ChevronRight,
  Box,
  Layers,
  Zap
} from 'lucide-react';

const DesignPreview = () => {
  // Load Inter font dynamically
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  // Theme constants
  const theme = {
    colors: {
      primary: 'hsl(220, 70%, 50%)', // Electric Blue
      primaryForeground: 'white',
      background: 'hsl(220, 30%, 98%)', // Light Blue-White
      surface: 'white',
      text: 'hsl(222, 47%, 11%)', // Deep Navy
      textMuted: 'hsl(220, 10%, 40%)',
      border: 'hsl(220, 20%, 90%)',
      secondary: 'hsl(220, 20%, 96%)',
      secondaryForeground: 'hsl(222, 47%, 11%)',
      accent: 'hsl(260, 60%, 60%)', // Purple accent
    },
    radius: '0.5rem', // 8px
    font: "'Inter', sans-serif",
  };

  return (
    <div 
      className="min-h-screen w-full overflow-auto"
      style={{
        backgroundColor: theme.colors.background,
        color: theme.colors.text,
        fontFamily: theme.font,
      }}
    >
      {/* Header */}
      <header 
        className="sticky top-0 z-50 border-b px-6 py-4 flex items-center justify-between backdrop-blur-sm bg-white/80"
        style={{ borderColor: theme.colors.border }}
      >
        <div className="flex items-center gap-3">
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: theme.colors.primary, color: 'white', borderRadius: theme.radius }}
          >
            <Box size={20} strokeWidth={2.5} />
          </div>
          <span className="font-bold text-xl tracking-tight">Vision Platform</span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search..." 
              className="pl-9 pr-4 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 transition-all w-64"
              style={{ 
                borderColor: theme.colors.border, 
                borderRadius: theme.radius,
                backgroundColor: theme.colors.surface
              }}
            />
          </div>
          <button className="p-2 rounded-full hover:bg-gray-100 transition-colors">
            <Bell size={20} />
          </button>
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500" />
        </div>
      </header>

      <main className="container mx-auto px-6 py-10 max-w-7xl space-y-16">
        
        {/* Introduction */}
        <section className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            <Zap size={12} />
            <span>New Design System Proposal</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900">
            Modern Tech Aesthetic
          </h1>
          <p className="text-xl text-gray-500 max-w-2xl leading-relaxed">
            A clean, high-contrast interface designed for clarity and efficiency. 
            Featuring electric blue accents, deep navy text, and refined spacing.
          </p>
        </section>

        {/* Color Palette */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <span className="w-1 h-6 bg-blue-600 rounded-full"></span>
            Color Palette
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <ColorSwatch name="Primary" hex="#2563EB" color={theme.colors.primary} />
            <ColorSwatch name="Background" hex="#F8FAFC" color={theme.colors.background} border />
            <ColorSwatch name="Text (Navy)" hex="#0F172A" color={theme.colors.text} />
            <ColorSwatch name="Surface" hex="#FFFFFF" color={theme.colors.surface} border />
          </div>
        </section>

        {/* Typography */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <span className="w-1 h-6 bg-blue-600 rounded-full"></span>
            Typography
          </h2>
          <div 
            className="p-8 rounded-xl border bg-white shadow-sm space-y-8"
            style={{ borderRadius: theme.radius, borderColor: theme.colors.border }}
          >
            <div className="space-y-2">
              <span className="text-xs font-mono text-gray-400">Heading 1</span>
              <h1 className="text-4xl font-bold tracking-tight">The quick brown fox jumps over the lazy dog</h1>
            </div>
            <div className="space-y-2">
              <span className="text-xs font-mono text-gray-400">Heading 2</span>
              <h2 className="text-3xl font-semibold tracking-tight">Visual hierarchy is essential for clarity</h2>
            </div>
            <div className="space-y-2">
              <span className="text-xs font-mono text-gray-400">Heading 3</span>
              <h3 className="text-2xl font-medium tracking-tight">Modern interfaces prioritize content</h3>
            </div>
            <div className="space-y-2">
              <span className="text-xs font-mono text-gray-400">Body</span>
              <p className="text-base leading-relaxed text-gray-600 max-w-3xl">
                Inter is a variable font family carefully crafted & designed for computer screens. 
                It features a tall x-height to aid in readability of mixed-case and lower-case text. 
                Several OpenType features are provided as well, like contextual alternates that adjusts punctuation depending on the shape of surrounding glyphs.
              </p>
            </div>
          </div>
        </section>

        {/* Components */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <span className="w-1 h-6 bg-blue-600 rounded-full"></span>
            Components
          </h2>
          
          <div className="grid md:grid-cols-2 gap-8">
            {/* Buttons & Inputs */}
            <div 
              className="p-8 rounded-xl border bg-white shadow-sm space-y-8"
              style={{ borderRadius: theme.radius, borderColor: theme.colors.border }}
            >
              <h3 className="font-medium text-gray-900">Interactive Elements</h3>
              
              <div className="space-y-4">
                <div className="flex flex-wrap gap-4">
                  <button 
                    className="px-4 py-2 font-medium text-sm transition-all hover:opacity-90 active:scale-95 shadow-sm shadow-blue-200"
                    style={{ 
                      backgroundColor: theme.colors.primary, 
                      color: theme.colors.primaryForeground,
                      borderRadius: theme.radius 
                    }}
                  >
                    Primary Action
                  </button>
                  <button 
                    className="px-4 py-2 font-medium text-sm border transition-all hover:bg-gray-50 active:scale-95"
                    style={{ 
                      backgroundColor: theme.colors.surface, 
                      color: theme.colors.text,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radius 
                    }}
                  >
                    Secondary Action
                  </button>
                  <button 
                    className="px-4 py-2 font-medium text-sm transition-all hover:bg-gray-100"
                    style={{ 
                      color: theme.colors.text,
                      borderRadius: theme.radius 
                    }}
                  >
                    Ghost Button
                  </button>
                </div>

                <div className="space-y-3 pt-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Email Address</label>
                    <input 
                      type="email" 
                      placeholder="name@example.com"
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      style={{ borderRadius: theme.radius, borderColor: theme.colors.border }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="terms" className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <label htmlFor="terms" className="text-sm text-gray-600">I agree to the terms and conditions</label>
                  </div>
                </div>
              </div>
            </div>

            {/* Cards */}
            <div className="space-y-6">
              <div 
                className="p-6 rounded-xl border bg-white shadow-sm hover:shadow-md transition-shadow"
                style={{ borderRadius: theme.radius, borderColor: theme.colors.border }}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                    <BarChart3 size={20} />
                  </div>
                  <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">+12.5%</span>
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-medium text-gray-500">Total Revenue</h4>
                  <p className="text-2xl font-bold text-gray-900">$45,231.89</p>
                </div>
              </div>

              <div 
                className="p-6 rounded-xl border bg-white shadow-sm"
                style={{ borderRadius: theme.radius, borderColor: theme.colors.border }}
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                    <Settings size={20} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">System Update</h4>
                    <p className="text-sm text-gray-500">Version 2.4.0 available</p>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  A new software update is available with improved performance and security fixes.
                </p>
                <button 
                  className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  View details <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Mock Dashboard */}
        <section className="space-y-6 pb-20">
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <span className="w-1 h-6 bg-blue-600 rounded-full"></span>
            Dashboard Preview
          </h2>
          
          <div 
            className="p-6 rounded-xl border bg-gray-50/50"
            style={{ borderRadius: theme.radius, borderColor: theme.colors.border }}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div 
                  key={i}
                  className="bg-white p-5 rounded-xl border shadow-sm hover:shadow-md transition-all cursor-pointer group"
                  style={{ borderRadius: theme.radius, borderColor: theme.colors.border }}
                >
                  <div className="aspect-video bg-gray-100 rounded-lg mb-4 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/10 to-purple-500/10 group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute top-2 right-2 bg-white/90 backdrop-blur px-2 py-1 rounded text-xs font-medium shadow-sm">
                      3D Model
                    </div>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">Modern Chair Design {i}</h3>
                  <p className="text-sm text-gray-500 mb-3">Updated 2 hours ago</p>
                  <div className="flex items-center justify-between pt-3 border-t">
                    <div className="flex -space-x-2">
                      {[1, 2].map(u => (
                        <div key={u} className="w-6 h-6 rounded-full bg-gray-200 border-2 border-white" />
                      ))}
                    </div>
                    <span className="text-xs font-medium text-blue-600 group-hover:underline">Edit Project</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>
    </div>
  );
};

const ColorSwatch = ({ name, hex, color, border = false }: { name: string, hex: string, color: string, border?: boolean }) => (
  <div className="space-y-3">
    <div 
      className={`w-full aspect-[3/2] rounded-xl shadow-sm ${border ? 'border' : ''}`}
      style={{ backgroundColor: color }}
    />
    <div>
      <h4 className="font-medium text-gray-900">{name}</h4>
      <p className="text-sm text-gray-500 font-mono">{hex}</p>
      <p className="text-xs text-gray-400 font-mono mt-1">{color}</p>
    </div>
  </div>
);

export default DesignPreview;