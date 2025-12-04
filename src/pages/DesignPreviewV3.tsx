import React from 'react';
import { ArrowRight, Activity, Box, Layers, Zap, Globe, Cpu, BarChart3, Dna, Scan, Fingerprint } from 'lucide-react';

const DesignPreviewV3 = () => {
  return (
    <div className="min-h-screen bg-[#050a05] text-white font-sans selection:bg-lime-500/30 overflow-x-hidden">
      {/* Ambient Background Glow - Toxic Nature */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 50% 0%, rgba(132, 204, 22, 0.08), transparent 40%), radial-gradient(circle at 0% 100%, rgba(16, 185, 129, 0.05), transparent 30%)'
        }}
      />

      {/* Grid Pattern Overlay */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]" 
           style={{ backgroundImage: 'linear-gradient(#3f6212 1px, transparent 1px), linear-gradient(90deg, #3f6212 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-12 sm:py-24">
        {/* Hero Section */}
        <div className="mb-20 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lime-950/30 border border-lime-500/20 text-xs font-medium text-lime-400 mb-6 backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-lime-500"></span>
            </span>
            BIO-SYNTHETIC INTERFACE V3.0
          </div>
          
          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight mb-6 text-white">
            Organic <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-lime-400 to-emerald-500">Intelligence</span>
          </h1>
          
          <p className="text-lg text-zinc-400 max-w-2xl leading-relaxed mb-8">
            The next evolution of the Vision Platform. Merging biological precision with synthetic processing power.
            <span className="block mt-2 text-lime-500/80 font-mono text-sm">System Status: OPTIMAL // 99.9% UPTIME</span>
          </p>

          <div className="flex flex-wrap gap-4">
            <button className="group relative px-6 py-3 bg-lime-500 hover:bg-lime-400 text-black font-bold rounded-lg transition-all duration-300 shadow-[0_0_20px_rgba(132,204,22,0.2)] hover:shadow-[0_0_30px_rgba(132,204,22,0.4)] overflow-hidden">
              <span className="flex items-center gap-2">
                Initialize System <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </button>
            
            <button className="px-6 py-3 bg-transparent hover:bg-white/5 border border-white/10 hover:border-lime-500/30 text-white font-medium rounded-lg backdrop-blur-sm transition-all duration-300">
              View Schematics
            </button>
          </div>
        </div>

        {/* Bento Grid Showcase */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-[180px]">
          
          {/* Large Metric Card - 2x2 */}
          <div className="md:col-span-2 md:row-span-2 group relative p-6 rounded-2xl bg-zinc-900/20 backdrop-blur-xl border border-white/5 overflow-hidden hover:border-lime-500/30 transition-colors duration-500">
            <div className="absolute inset-0 bg-gradient-to-br from-lime-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            
            <div className="relative h-full flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <div className="p-3 rounded-xl bg-lime-950/30 border border-lime-500/20">
                  <Dna className="w-6 h-6 text-lime-400" />
                </div>
                <span className="text-xs font-mono text-zinc-500">SEQ_ID: 8842-A</span>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-3xl font-bold text-white">Material DNA</h3>
                <p className="text-zinc-400 text-sm">Deep structural analysis of 2.4M+ physical assets. Decoding the fundamental building blocks of matter.</p>
              </div>

              <div className="h-32 w-full mt-4 rounded-lg bg-gradient-to-r from-lime-900/10 to-emerald-900/10 border border-white/5 relative overflow-hidden">
                 {/* Bio-Rhythm Visualization */}
                 <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-full h-full flex items-end justify-between px-2 pb-2 gap-1">
                        {[30, 50, 45, 80, 60, 90, 55, 70, 40, 65, 85, 50, 75, 45, 60].map((h, i) => (
                            <div key={i} className="w-full bg-lime-500/20 rounded-t-sm relative group-hover:bg-lime-500/40 transition-colors duration-500" style={{ height: `${h}%` }}>
                                <div className="absolute top-0 left-0 right-0 h-0.5 bg-lime-400 shadow-[0_0_8px_rgba(163,230,53,0.8)]" />
                            </div>
                        ))}
                    </div>
                 </div>
              </div>
            </div>
          </div>

          {/* Stat Card 1 - 1x1 */}
          <div className="group p-6 rounded-2xl bg-zinc-900/20 backdrop-blur-xl border border-white/5 hover:border-emerald-500/30 transition-colors duration-500 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <Activity className="w-5 h-5 text-emerald-400" />
              <span className="text-xs font-mono text-emerald-400">+24.8%</span>
            </div>
            <div>
              <div className="text-2xl font-bold text-white mb-1">99.9%</div>
              <div className="text-xs text-zinc-500 uppercase tracking-wider">Purity Score</div>
            </div>
          </div>

          {/* Stat Card 2 - 1x1 */}
          <div className="group p-6 rounded-2xl bg-zinc-900/20 backdrop-blur-xl border border-white/5 hover:border-lime-500/30 transition-colors duration-500 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <Zap className="w-5 h-5 text-lime-400" />
              <span className="text-xs font-mono text-lime-400">INSTANT</span>
            </div>
            <div>
              <div className="text-2xl font-bold text-white mb-1">4ms</div>
              <div className="text-xs text-zinc-500 uppercase tracking-wider">Latency</div>
            </div>
          </div>

          {/* Wide Card - 2x1 */}
          <div className="md:col-span-2 group p-6 rounded-2xl bg-zinc-900/20 backdrop-blur-xl border border-white/5 hover:border-white/20 transition-colors duration-500 flex flex-col justify-center">
             <div className="flex items-center gap-4 mb-4">
                <div className="p-2 rounded-lg bg-zinc-800/50">
                  <Cpu className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-white">Neural Core Processing</h3>
                  <p className="text-xs text-zinc-500">Bio-Link Active • Load: 68%</p>
                </div>
             </div>
             <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
               <div className="bg-gradient-to-r from-emerald-500 to-lime-500 h-full w-[68%] shadow-[0_0_10px_rgba(16,185,129,0.5)] relative">
                 <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/80 animate-pulse" />
               </div>
             </div>
          </div>

          {/* Tall Card - 1x2 */}
          <div className="md:row-span-2 group p-6 rounded-2xl bg-zinc-900/20 backdrop-blur-xl border border-white/5 hover:border-lime-500/30 transition-colors duration-500 flex flex-col">
            <div className="mb-4">
              <Layers className="w-6 h-6 text-lime-400 mb-2" />
              <h3 className="text-lg font-bold text-white">Modules</h3>
            </div>
            <div className="flex-1 space-y-3">
              {['Bio-Scanner', 'Texture Synth', 'Color DNA', 'Pattern Match', 'Export'].map((tech, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-white/5 border border-white/5 group-hover:border-lime-500/20 transition-colors">
                  <div className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-lime-500 animate-pulse' : 'bg-zinc-600'}`} />
                  <span className="text-sm text-zinc-300">{tech}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stat Card 3 - 1x1 */}
          <div className="group p-6 rounded-2xl bg-zinc-900/20 backdrop-blur-xl border border-white/5 hover:border-emerald-500/30 transition-colors duration-500 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <Scan className="w-5 h-5 text-emerald-400" />
              <span className="text-xs font-mono text-zinc-500">V3.0</span>
            </div>
            <div>
              <div className="text-2xl font-bold text-white mb-1">1.2M</div>
              <div className="text-xs text-zinc-500 uppercase tracking-wider">Scans</div>
            </div>
          </div>

           {/* Stat Card 4 - 1x1 */}
           <div className="group p-6 rounded-2xl bg-zinc-900/20 backdrop-blur-xl border border-white/5 hover:border-lime-500/30 transition-colors duration-500 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <Fingerprint className="w-5 h-5 text-lime-400" />
              <span className="text-xs font-mono text-zinc-500">AUTH</span>
            </div>
            <div>
              <div className="text-2xl font-bold text-white mb-1">SECURE</div>
              <div className="text-xs text-zinc-500 uppercase tracking-wider">Biometric</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default DesignPreviewV3;