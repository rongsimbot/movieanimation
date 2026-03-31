import React, { useState } from 'react';
import { GripVertical, X, Plus, MapPin, Cloud, Users, Film } from 'lucide-react';

interface Scene {
  id: string;
  title: string;
  location: string;
  timeOfDay: 'DAY' | 'NIGHT' | 'DAWN' | 'DUSK' | 'MORNING' | 'AFTERNOON' | 'EVENING';
  weather: 'CLEAR' | 'RAIN' | 'SNOW' | 'WIND' | 'FOG' | 'STORM' | 'CLOUDY';
  environment: string;
  characters: string[];
  action: string;
  order: number;
}

const parseScenes = (scriptText: string): Scene[] => {
  const lines = scriptText.split('\n');
  const scenes: Scene[] = [];
  let currentScene: Partial<Scene> | null = null;
  let sceneOrder = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect scene heading
    if (/^(INT\.|EXT\.)/.test(line)) {
      // Save previous scene if exists
      if (currentScene && currentScene.title) {
        scenes.push({
          ...currentScene,
          order: sceneOrder++,
          id: Math.random().toString(36).substring(2)
        } as Scene);
      }

      // Parse new scene
      const match = line.match(/^(INT\.|EXT\.)\s+(.+?)\s+-\s+(DAY|NIGHT|DAWN|DUSK|MORNING|AFTERNOON|EVENING)/i);
      const location = match ? match[2] : line.replace(/^(INT\.|EXT\.)\s+/, '').split('-')[0].trim();
      const timeOfDay = (match ? match[3].toUpperCase() : 'DAY') as Scene['timeOfDay'];

      currentScene = {
        title: line,
        location,
        timeOfDay,
        weather: 'CLEAR',
        environment: '',
        characters: [],
        action: ''
      };
    } else if (currentScene) {
      // Collect action and characters
      if (line && line === line.toUpperCase() && /^[A-Z\s]+$/.test(line)) {
        // Character name
        if (!currentScene.characters!.includes(line)) {
          currentScene.characters!.push(line);
        }
      } else if (line && !/^\(/.test(line)) {
        // Action line
        currentScene.action = currentScene.action 
          ? currentScene.action + ' ' + line 
          : line;
      }
    }
  }

  // Save last scene
  if (currentScene && currentScene.title) {
    scenes.push({
      ...currentScene,
      order: sceneOrder,
      id: Math.random().toString(36).substring(2)
    } as Scene);
  }

  return scenes;
};

const getTimeIcon = (time: string) => {
  const icons: Record<string, string> = {
    DAY: '☀️',
    NIGHT: '🌙',
    DAWN: '🌅',
    DUSK: '🌆',
    MORNING: '🌄',
    AFTERNOON: '☀️',
    EVENING: '🌇'
  };
  return icons[time] || '☀️';
};

const getWeatherIcon = (weather: string) => {
  const icons: Record<string, string> = {
    CLEAR: '☀️',
    RAIN: '🌧️',
    SNOW: '❄️',
    WIND: '💨',
    FOG: '🌫️',
    STORM: '⛈️',
    CLOUDY: '☁️'
  };
  return icons[weather] || '☀️';
};

export const SceneManager: React.FC<{ script: string; onUpdate: (scenes: Scene[]) => void }> = ({ script, onUpdate }) => {
  const [scenes, setScenes] = useState<Scene[]>(() => parseScenes(script));
  const [editingId, setEditingId] = useState<string | null>(null);

  const updateScene = (id: string, field: keyof Scene, value: any) => {
    setScenes(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, [field]: value } : s);
      onUpdate(updated);
      return updated;
    });
  };

  const deleteScene = (id: string) => {
    if (confirm('Delete this scene?')) {
      setScenes(prev => {
        const updated = prev.filter(s => s.id !== id);
        onUpdate(updated);
        return updated;
      });
    }
  };

  const addScene = () => {
    const newScene: Scene = {
      id: Math.random().toString(36).substring(2),
      title: 'NEW SCENE',
      location: '',
      timeOfDay: 'DAY',
      weather: 'CLEAR',
      environment: '',
      characters: [],
      action: '',
      order: scenes.length
    };
    setScenes(prev => {
      const updated = [...prev, newScene];
      onUpdate(updated);
      return updated;
    });
  };

  const moveScene = (id: string, direction: 'up' | 'down') => {
    setScenes(prev => {
      const index = prev.findIndex(s => s.id === id);
      if (
        (direction === 'up' && index === 0) || 
        (direction === 'down' && index === prev.length - 1)
      ) {
        return prev;
      }

      const newScenes = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      [newScenes[index], newScenes[targetIndex]] = [newScenes[targetIndex], newScenes[index]];
      
      // Update order
      const reordered = newScenes.map((s, i) => ({ ...s, order: i }));
      onUpdate(reordered);
      return reordered;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-brand-primary/10 rounded-xl">
            <Film className="w-5 h-5 text-brand-primary" />
          </div>
          <div>
            <h3 className="text-xl font-bold">Scene Manager</h3>
            <p className="text-xs text-white/50">{scenes.length} scenes • Edit locations, weather, and staging</p>
          </div>
        </div>
        <button 
          onClick={addScene}
          className="bg-brand-primary text-black px-4 py-2 rounded-xl font-bold hover:bg-brand-primary/90 transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Scene
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {scenes.map((scene, index) => (
          <div 
            key={scene.id}
            className="bg-gradient-to-br from-white/5 to-white/10 rounded-xl border border-white/10 p-4 hover:border-brand-primary/30 transition-all"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3 flex-1">
                <div className="flex flex-col gap-1">
                  <button onClick={() => moveScene(scene.id, 'up')} disabled={index === 0} className="text-white/30 hover:text-brand-primary disabled:opacity-20">▲</button>
                  <button onClick={() => moveScene(scene.id, 'down')} disabled={index === scenes.length - 1} className="text-white/30 hover:text-brand-primary disabled:opacity-20">▼</button>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-brand-primary">SCENE {index + 1}</span>
                    <span className="text-xs text-white/40">•</span>
                    {editingId === scene.id + '-title' ? (
                      <input
                        type="text"
                        value={scene.title}
                        onChange={(e) => updateScene(scene.id, 'title', e.target.value)}
                        onBlur={() => setEditingId(null)}
                        autoFocus
                        className="bg-transparent border-b border-brand-primary outline-none text-white font-bold flex-1"
                      />
                    ) : (
                      <span 
                        onClick={() => setEditingId(scene.id + '-title')}
                        className="text-white font-bold cursor-pointer hover:text-brand-primary flex-1"
                      >
                        {scene.title}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => deleteScene(scene.id)} className="text-white/30 hover:text-red-500 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Fields Grid */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              {/* Location */}
              <div>
                <label className="text-xs text-white/50 flex items-center gap-1 mb-1">
                  <MapPin className="w-3 h-3" />
                  Location
                </label>
                <input
                  type="text"
                  value={scene.location}
                  onChange={(e) => updateScene(scene.id, 'location', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-brand-primary outline-none"
                  placeholder="e.g., Diner interior"
                />
              </div>

              {/* Time of Day */}
              <div>
                <label className="text-xs text-white/50 flex items-center gap-1 mb-1">
                  {getTimeIcon(scene.timeOfDay)} Time of Day
                </label>
                <select
                  value={scene.timeOfDay}
                  onChange={(e) => updateScene(scene.id, 'timeOfDay', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-brand-primary outline-none cursor-pointer"
                >
                  <option value="DAY">Day</option>
                  <option value="NIGHT">Night</option>
                  <option value="DAWN">Dawn</option>
                  <option value="DUSK">Dusk</option>
                  <option value="MORNING">Morning</option>
                  <option value="AFTERNOON">Afternoon</option>
                  <option value="EVENING">Evening</option>
                </select>
              </div>

              {/* Weather */}
              <div>
                <label className="text-xs text-white/50 flex items-center gap-1 mb-1">
                  <Cloud className="w-3 h-3" />
                  Weather
                </label>
                <select
                  value={scene.weather}
                  onChange={(e) => updateScene(scene.id, 'weather', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-brand-primary outline-none cursor-pointer"
                >
                  <option value="CLEAR">Clear {getWeatherIcon('CLEAR')}</option>
                  <option value="RAIN">Rain {getWeatherIcon('RAIN')}</option>
                  <option value="SNOW">Snow {getWeatherIcon('SNOW')}</option>
                  <option value="WIND">Wind {getWeatherIcon('WIND')}</option>
                  <option value="FOG">Fog {getWeatherIcon('FOG')}</option>
                  <option value="STORM">Storm {getWeatherIcon('STORM')}</option>
                  <option value="CLOUDY">Cloudy {getWeatherIcon('CLOUDY')}</option>
                </select>
              </div>

              {/* Characters */}
              <div>
                <label className="text-xs text-white/50 flex items-center gap-1 mb-1">
                  <Users className="w-3 h-3" />
                  Characters ({scene.characters.length})
                </label>
                <div className="flex flex-wrap gap-1">
                  {scene.characters.map((char, i) => (
                    <span key={i} className="px-2 py-1 bg-brand-primary/20 text-brand-primary text-xs rounded-full">
                      {char}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Environment */}
            <div className="mb-3">
              <label className="text-xs text-white/50 mb-1 block">Environment / Background</label>
              <textarea
                value={scene.environment}
                onChange={(e) => updateScene(scene.id, 'environment', e.target.value)}
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-brand-primary outline-none resize-none"
                placeholder="Describe the setting, props, lighting, atmosphere..."
              />
            </div>

            {/* Action Summary */}
            <div>
              <label className="text-xs text-white/50 mb-1 block">Action Summary</label>
              <div className="bg-white/5 rounded-lg px-3 py-2 text-white/70 text-sm border border-white/5">
                {scene.action || <span className="text-white/30 italic">No action captured</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {scenes.length === 0 && (
        <div className="text-center py-12 text-white/30">
          <Film className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>No scenes detected. Upload a script or add scenes manually.</p>
        </div>
      )}
    </div>
  );
};
