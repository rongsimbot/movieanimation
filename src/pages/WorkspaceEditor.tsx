import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Play, Upload, FileText, BookOpen, Users, Clapperboard, ChevronRight } from 'lucide-react';

const WorkspaceEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [animation, setAnimation] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [activeStep, setActiveStep] = React.useState(0);

  const steps = [
    { icon: Upload, title: 'Upload Story', key: 'story' },
    { icon: FileText, title: 'Convert Script', key: 'script' },
    { icon: BookOpen, title: 'Break into Scenes', key: 'scenes' },
    { icon: Users, title: 'Extract Characters', key: 'characters' },
    { icon: Clapperboard, title: 'Generate Movie', key: 'generate' }
  ];

  React.useEffect(() => {
    fetch('/api/animations')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          const anim = data.animations.find((a: any) => a.id === parseInt(id || '0'));
          setAnimation(anim);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <p className="text-white">Loading...</p>
    </div>
  );

  if (!animation) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <p className="text-white">Animation not found</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-900/20 to-black">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => navigate('/animations')} className="flex items-center gap-2 text-white/60 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
            Back to Animations
          </button>
          <div className="flex gap-2">
            <button className="bg-white/10 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-white/20">
              <Save className="w-4 h-4" />
              Save
            </button>
            <button onClick={() => navigate(`/player/animation/${id}`)} className="bg-brand-primary text-black px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-brand-primary/80">
              <Play className="w-4 h-4" />
              Preview
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-2">{animation.animation_name}</h1>
          <p className="text-white/50 mb-6">{animation.script_title}</p>

          {/* Step Navigator */}
          <div className="bg-black/40 border border-white/10 rounded-2xl p-6 mb-8">
            <div className="flex items-center justify-between relative">
              {steps.map((step, index) => {
                const Icon = step.icon;
                const isActive = index === activeStep;
                const isCompleted = index < activeStep;
                
                return (
                  <React.Fragment key={step.key}>
                    <button
                      onClick={() => setActiveStep(index)}
                      className={`flex flex-col items-center gap-2 transition-all relative z-10 ${
                        isActive ? 'scale-110' : 'scale-100 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${
                        isActive 
                          ? 'bg-gradient-to-br from-brand-primary to-cyan-400 shadow-lg shadow-brand-primary/50' 
                          : isCompleted
                          ? 'bg-gradient-to-br from-green-500 to-emerald-400'
                          : 'bg-white/10'
                      }`}>
                        <Icon className={`w-7 h-7 ${isActive || isCompleted ? 'text-black' : 'text-white'}`} />
                      </div>
                      <span className={`text-xs font-medium text-center max-w-[80px] ${
                        isActive ? 'text-white' : 'text-white/50'
                      }`}>
                        {step.title}
                      </span>
                    </button>
                    {index < steps.length - 1 && (
                      <div className="flex-1 h-1 bg-white/10 mx-2 relative -top-7">
                        <div 
                          className={`h-full transition-all ${
                            index < activeStep ? 'bg-gradient-to-r from-green-500 to-emerald-400' : 'bg-transparent'
                          }`}
                        />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-2 space-y-4">
              <div className="bg-black/40 border border-white/10 rounded-xl p-6">
                <h2 className="text-xl font-bold text-white mb-4">Script</h2>
                <textarea 
                  className="w-full h-64 bg-white/5 border border-white/10 rounded-lg p-4 text-white resize-none"
                  placeholder="Enter your script here..."
                />
              </div>

              <div className="bg-black/40 border border-white/10 rounded-xl p-6">
                <h2 className="text-xl font-bold text-white mb-4">Chapters</h2>
                <p className="text-white/50">Chapter editing coming soon...</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-black/40 border border-white/10 rounded-xl p-6">
                <h2 className="text-lg font-bold text-white mb-4">Details</h2>
                <div className="space-y-3">
                  <div>
                    <label className="text-white/50 text-sm">Status</label>
                    <select className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white mt-1">
                      <option value="draft">Draft</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-white/50 text-sm">Duration (seconds)</label>
                    <input 
                      type="number" 
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white mt-1"
                      defaultValue={animation.duration_seconds}
                    />
                  </div>
                </div>
              </div>

              <div className="bg-black/40 border border-white/10 rounded-xl p-6">
                <h2 className="text-lg font-bold text-white mb-4">Characters</h2>
                <p className="text-white/50 text-sm">{animation.character_count} characters</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceEditor;
