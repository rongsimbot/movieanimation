import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Plus, FileText, Clapperboard } from 'lucide-react';

interface Animation {
  id: number;
  animation_name: string;
  script_title: string;
  status: string;
  duration_seconds: number;
  chapter_count: string;
  character_count: string;
  file_path: string;
}

export default function AnimationsPage({ onStartWizard }: { onStartWizard: () => void }) {
  const [animations, setAnimations] = useState<Animation[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/animations')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setAnimations(data.animations);
        }
      })
      .catch(err => console.error('Failed to load animations:', err))
      .finally(() => setLoading(false));
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen pt-32 px-6 md:px-20">
      <div className="max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between mb-12">
          <div className="text-left">
            <h1 className="text-4xl font-bold mb-2">My Animations</h1>
            <p className="text-white/50">Manage your generated movies and scripts.</p>
          </div>
          <button 
            onClick={onStartWizard} 
            className="bg-brand-primary text-black px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-brand-primary/90 transition-all"
          >
            <Plus className="w-5 h-5" /> Create New Movie
          </button>
        </div>
        
        <div className="border-2 border-dashed border-white/10 rounded-3xl bg-black/40 p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-white/50">Loading animations...</p>
            </div>
          ) : animations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-white/30">
              <Clapperboard className="w-12 h-12 mb-4 opacity-50" />
              <p>You have not created any movies yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-4 px-4 text-sm font-semibold text-white/70">Animation</th>
                    <th className="text-left py-4 px-4 text-sm font-semibold text-white/70">Script</th>
                    <th className="text-center py-4 px-4 text-sm font-semibold text-white/70">Chapters</th>
                    <th className="text-center py-4 px-4 text-sm font-semibold text-white/70">Characters</th>
                    <th className="text-center py-4 px-4 text-sm font-semibold text-white/70">Status</th>
                    <th className="text-center py-4 px-4 text-sm font-semibold text-white/70">Duration</th>
                    <th className="text-right py-4 px-4 text-sm font-semibold text-white/70">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {animations.map((anim) => (
                    <tr key={anim.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-4 px-4 font-medium text-white">{anim.animation_name}</td>
                      <td className="py-4 px-4 text-white/60 text-sm">{anim.script_title || 'N/A'}</td>
                      <td className="py-4 px-4 text-center text-white/60">{anim.chapter_count}</td>
                      <td className="py-4 px-4 text-center text-white/60">{anim.character_count}</td>
                      <td className="py-4 px-4 text-center">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                          anim.status === 'completed' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                          anim.status === 'in_progress' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                          'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                        }`}>
                          {anim.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center text-white/60 text-sm">
                        {formatDuration(anim.duration_seconds)}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => navigate(`/workspace/animation/${anim.id}`)}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors group"
                            title="Edit in Workspace"
                          >
                            <FileText className="w-5 h-5 text-white/60 group-hover:text-brand-primary" />
                          </button>
                          <button 
                            onClick={() => navigate(`/player/animation/${anim.id}`)}
                            className="p-2 hover:bg-brand-primary/20 rounded-lg transition-colors group"
                            title="Play Animation"
                          >
                            <Play className="w-5 h-5 text-white/60 group-hover:text-brand-primary fill-current" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
