import React from 'react';
import { ArrowRight, Activity, Box, Layers, Zap, Globe, Cpu, BarChart3 } from 'lucide-react';

const DesignPreviewV2 = () => {
  return (
    <div className="min-h-screen bg-[#030712] text-white font-sans selection:bg-violet-500/30 overflow-x-hidden">
      {/* Ambient Background Glow */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 50% 0%, rgba(124, 58, 237, 0.15), transparent 40%)'
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-12 sm:py-24">
        {/* Hero Section */}
        <div className="mb-20 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-violet-300 mb-6 backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
            </span>
            VISIONARY 2026 PREVIEW
          </div>
          
          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/50">
            The Future of <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400">Material Intelligence</span>
          </h1>
          
          <p className="text-lg text-slate-400 max-w-2xl leading-relaxed mb-8">
            Experience the next generation of the Vision Platform. 
            Immersive data visualization, real-time 3D rendering, and autonomous agent orchestration.
          </p>

          <div className="flex flex-wrap gap-4">
            <button className="group relative px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-lg transition-all duration-300 shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:shadow-[0_0_30px_rgba(124,58,237,0.5)] overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
              <span className="flex items-center gap-2">
                Explore System <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </button>
            
            <button className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium rounded-lg backdrop-blur-sm transition-all duration-300">
              Documentation
            </button>
          </div>
        </div>

        {/* Bento Grid Showcase */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-[180px]">
          
          {/* Large Metric Card - 2x2 */}
          <div className="md:col-span-2 md:row-span-2 group relative p-6 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 overflow-hidden hover:border-violet-500/30 transition-colors duration-500">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="relative h-full flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <Globe className="w-6 h-6 text-violet-400" />
                </div>
                <span className="text-xs font-mono text-slate-500">SYS_ACTIVE</span>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-3xl font-bold text-white">Global Material Index</h3>
                <p className="text-slate-400 text-sm">Real-time tracking of 2.4M+ physical material assets across distributed nodes.</p>
              </div>

              <div className="h-32 w-full mt-4 rounded-lg bg-gradient-to-r from-violet-500/10 to-cyan-500/10 border border-white/5 relative overflow-hidden">
                 {/* Abstract Chart Visualization */}
                 <div className="absolute bottom-0 left-0 right-0 h-full flex items-end justify-around px-4 pb-4 gap-2">
                    {[40, 70, 50, 90, 60, 80, 50, 75, 60, 95].map((h, i) => (
                      <div key={i} className="w-full bg-violet-500/20 rounded-t-sm relative group-hover:bg-violet-500/40 transition-colors duration-500" style={{ height: `${h}%` }}>
                        <div className="absolute top-0 left-0 right-0 h-1 bg-violet-400/50 shadow-[0_0_10px_rgba(139,92,246,0.5)]" />
                      </div>
                    ))}
                 </div>
              </div>
            </div>
          </div>

          {/* Stat Card 1 - 1x1 */}
          <div className="group p-6 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-cyan-500/30 transition-colors duration-500 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <Activity className="w-5 h-5 text-cyan-400" />
              <span className="text-xs font-mono text-emerald-400">+12.5%</span>
            </div>
            <div>
              <div className="text-2xl font-bold text-white mb-1">98.2%</div>
              <div className="text-xs text-slate-400 uppercase tracking-wider">Accuracy</div>
            </div>
          </div>

          {/* Stat Card 2 - 1x1 */}
          <div className="group p-6 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-pink-500/30 transition-colors duration-500 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <Zap className="w-5 h-5 text-pink-400" />
              <span className="text-xs font-mono text-emerald-400">14ms</span>
            </div>
            <div>
              <div className="text-2xl font-bold text-white mb-1">2.4k</div>
              <div className="text-xs text-slate-400 uppercase tracking-wider">Ops / Sec</div>
            </div>
          </div>

          {/* Wide Card - 2x1 */}
          <div className="md:col-span-2 group p-6 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-white/20 transition-colors duration-500 flex flex-col justify-center">
             <div className="flex items-center gap-4 mb-4">
                <div className="p-2 rounded-lg bg-white/5">
                  <Cpu className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-white">Neural Processing Unit</h3>
                  <p className="text-xs text-slate-500">Active • Load: 42%</p>
                </div>
             </div>
             <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
               <div className="bg-gradient-to-r from-blue-500 to-violet-500 h-full w-[42%] shadow-[0_0_10px_rgba(59,130,246,0.5)] relative">
                 <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/50 animate-pulse" />
               </div>
             </div>
          </div>

          {/* Tall Card - 1x2 */}
          <div className="md:row-span-2 group p-6 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-orange-500/30 transition-colors duration-500 flex flex-col">
            <div className="mb-4">
              <Layers className="w-6 h-6 text-orange-400 mb-2" />
              <h3 className="text-lg font-bold text-white">Stack</h3>
            </div>
            <div className="flex-1 space-y-3">
              {['React', 'TypeScript', 'Tailwind', 'Supabase', 'Three.js'].map((tech, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-white/5 border border-white/5 group-hover:border-white/10 transition-colors">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-400/50" />
                  <span className="text-sm text-slate-300">{tech}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stat Card 3 - 1x1 */}
          <div className="group p-6 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-emerald-500/30 transition-colors duration-500 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <Box className="w-5 h-5 text-emerald-400" />
              <span className="text-xs font-mono text-slate-500">V2.0</span>
            </div>
            <div>
              <div className="text-2xl font-bold text-white mb-1">856</div>
              <div className="text-xs text-slate-400 uppercase tracking-wider">3D Assets</div>
            </div>
          </div>

           {/* Stat Card 4 - 1x1 */}
           <div className="group p-6 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-yellow-500/30 transition-colors duration-500 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <BarChart3 className="w-5 h-5 text-yellow-400" />
              <span className="text-xs font-mono text-slate-500">LIVE</span>
            </div>
            <div>
              <div className="text-2xl font-bold text-white mb-1">12</div>
              <div className="text-xs text-slate-400 uppercase tracking-wider">Active Agents</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default DesignPreviewV2;