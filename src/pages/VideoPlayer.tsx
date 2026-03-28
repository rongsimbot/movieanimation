import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const VideoPlayer = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [animation, setAnimation] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

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
    <div className="min-h-screen bg-black">
      <div className="p-6">
        <button onClick={() => navigate('/animations')} className="flex items-center gap-2 text-white/60 hover:text-white mb-6">
          <ArrowLeft className="w-5 h-5" />
          Back to Animations
        </button>
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-2">{animation.animation_name}</h1>
          <p className="text-white/50 mb-6">{animation.script_title}</p>
          <div className="bg-black rounded-xl overflow-hidden border border-white/10">
            <video 
              className="w-full"
              controls
              src={animation.file_path}
            >
              Your browser does not support video playback.
            </video>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="bg-white/5 p-4 rounded-lg">
              <p className="text-white/50 text-sm">Status</p>
              <p className="text-white font-medium capitalize">{animation.status}</p>
            </div>
            <div className="bg-white/5 p-4 rounded-lg">
              <p className="text-white/50 text-sm">Duration</p>
              <p className="text-white font-medium">{animation.duration_seconds}s</p>
            </div>
            <div className="bg-white/5 p-4 rounded-lg">
              <p className="text-white/50 text-sm">Chapters</p>
              <p className="text-white font-medium">{animation.chapter_count}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
