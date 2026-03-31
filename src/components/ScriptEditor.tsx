import React, { useState, useEffect } from 'react';
import { Film, Edit3 } from 'lucide-react';

interface ScriptElement {
  type: 'scene' | 'action' | 'dialogue';
  character?: string;
  parenthetical?: string;
  text: string;
  id: string;
}

const parseScript = (scriptText: string): ScriptElement[] => {
  const lines = scriptText.split('\n');
  const elements: ScriptElement[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) {
      i++;
      continue;
    }

    // Scene heading: INT./EXT. LOCATION - TIME
    if (/^(INT\.|EXT\.)/.test(line)) {
      elements.push({
        type: 'scene',
        text: line,
        id: crypto.randomUUID()
      });
      i++;
      continue;
    }

    // Check if next line might be character name (ALL CAPS, standalone)
    const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
    if (nextLine && nextLine === nextLine.toUpperCase() && /^[A-Z\s]+$/.test(nextLine)) {
      // Current line is action, next is character
      elements.push({
        type: 'action',
        text: line,
        id: crypto.randomUUID()
      });
      i++;
      
      // Now process character dialogue
      const character = nextLine;
      i++;
      
      let parenthetical = '';
      let dialogue = '';
      
      // Check for parenthetical
      if (i < lines.length && lines[i].trim().startsWith('(')) {
        parenthetical = lines[i].trim();
        i++;
      }
      
      // Collect dialogue lines until next character or empty line
      while (i < lines.length) {
        const dialogueLine = lines[i].trim();
        if (!dialogueLine || dialogueLine === dialogueLine.toUpperCase() || /^(INT\.|EXT\.)/.test(dialogueLine)) {
          break;
        }
        dialogue += (dialogue ? ' ' : '') + dialogueLine;
        i++;
      }
      
      elements.push({
        type: 'dialogue',
        character,
        parenthetical,
        text: dialogue,
        id: crypto.randomUUID()
      });
      continue;
    }

    // Default: action line
    elements.push({
      type: 'action',
      text: line,
      id: crypto.randomUUID()
    });
    i++;
  }

  return elements;
};

const getCharacterColor = (character: string, colorMap: Map<string, string>): string => {
  if (!colorMap.has(character)) {
    const colors = [
      'bg-blue-500/20 border-blue-500/40 text-blue-100',
      'bg-purple-500/20 border-purple-500/40 text-purple-100',
      'bg-green-500/20 border-green-500/40 text-green-100',
      'bg-pink-500/20 border-pink-500/40 text-pink-100',
      'bg-yellow-500/20 border-yellow-500/40 text-yellow-100',
      'bg-cyan-500/20 border-cyan-500/40 text-cyan-100'
    ];
    colorMap.set(character, colors[colorMap.size % colors.length]);
  }
  return colorMap.get(character)!;
};

export const ScriptEditor: React.FC<{ script: string; onUpdate: (newScript: string) => void }> = ({ script, onUpdate }) => {
  const [elements, setElements] = useState<ScriptElement[]>([]);
  const [characterColors] = useState(new Map<string, string>());
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (script) {
      setElements(parseScript(script));
    }
  }, [script]);

  const handleEdit = (id: string, field: keyof ScriptElement, value: string) => {
    setElements(prev => prev.map(el => 
      el.id === id ? { ...el, [field]: value } : el
    ));
  };

  const reconstructScript = (): string => {
    return elements.map(el => {
      if (el.type === 'scene') return el.text;
      if (el.type === 'action') return el.text;
      if (el.type === 'dialogue') {
        let dialogueBlock = el.character;
        if (el.parenthetical) dialogueBlock += '\n' + el.parenthetical;
        dialogueBlock += '\n' + el.text;
        return dialogueBlock;
      }
      return '';
    }).join('\n\n');
  };

  const handleSave = () => {
    onUpdate(reconstructScript());
    setEditingId(null);
  };

  return (
    <div className="w-full bg-black/40 backdrop-blur-xl border-t border-white/10 p-6 rounded-t-3xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-brand-primary/10 rounded-xl">
            <Film className="w-5 h-5 text-brand-primary" />
          </div>
          <div>
            <h3 className="text-xl font-bold">Script Editor</h3>
            <p className="text-xs text-white/50">Edit scene headings, actions, and dialogue</p>
          </div>
        </div>
        <button 
          onClick={handleSave}
          className="bg-brand-primary text-black px-6 py-2 rounded-xl font-bold hover:bg-brand-primary/90 transition-all flex items-center gap-2"
        >
          <Edit3 className="w-4 h-4" />
          Save Changes
        </button>
      </div>

      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-4 custom-scrollbar">
        {elements.map((element) => (
          <div key={element.id} className="group relative">
            {element.type === 'scene' && (
              <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-4 rounded-xl border border-blue-500/30 shadow-lg">
                {editingId === element.id ? (
                  <input
                    type="text"
                    value={element.text}
                    onChange={(e) => handleEdit(element.id, 'text', e.target.value)}
                    onBlur={() => setEditingId(null)}
                    autoFocus
                    className="w-full bg-transparent border-none text-white font-bold text-lg outline-none"
                  />
                ) : (
                  <div 
                    onClick={() => setEditingId(element.id)}
                    className="text-white font-bold text-lg cursor-pointer hover:text-blue-200 transition-colors"
                  >
                    {element.text}
                  </div>
                )}
              </div>
            )}

            {element.type === 'action' && (
              <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                {editingId === element.id ? (
                  <textarea
                    value={element.text}
                    onChange={(e) => handleEdit(element.id, 'text', e.target.value)}
                    onBlur={() => setEditingId(null)}
                    autoFocus
                    rows={3}
                    className="w-full bg-transparent border-none text-white/80 text-sm outline-none resize-none"
                  />
                ) : (
                  <div 
                    onClick={() => setEditingId(element.id)}
                    className="text-white/80 text-sm cursor-pointer hover:text-white transition-colors"
                  >
                    {element.text}
                  </div>
                )}
              </div>
            )}

            {element.type === 'dialogue' && (
              <div className="flex flex-col gap-2 ml-8">
                <div className="text-xs font-bold text-brand-primary uppercase tracking-widest">
                  {editingId === element.id + '-char' ? (
                    <input
                      type="text"
                      value={element.character}
                      onChange={(e) => handleEdit(element.id, 'character', e.target.value)}
                      onBlur={() => setEditingId(null)}
                      autoFocus
                      className="bg-transparent border-b border-brand-primary outline-none"
                    />
                  ) : (
                    <span 
                      onClick={() => setEditingId(element.id + '-char')}
                      className="cursor-pointer hover:text-yellow-300 transition-colors"
                    >
                      {element.character}
                    </span>
                  )}
                </div>
                
                {element.parenthetical && (
                  <div className="text-xs text-white/50 italic ml-4">
                    {editingId === element.id + '-paren' ? (
                      <input
                        type="text"
                        value={element.parenthetical}
                        onChange={(e) => handleEdit(element.id, 'parenthetical', e.target.value)}
                        onBlur={() => setEditingId(null)}
                        autoFocus
                        className="bg-transparent border-b border-white/30 outline-none"
                      />
                    ) : (
                      <span 
                        onClick={() => setEditingId(element.id + '-paren')}
                        className="cursor-pointer hover:text-white/70 transition-colors"
                      >
                        {element.parenthetical}
                      </span>
                    )}
                  </div>
                )}

                <div className={`p-4 rounded-2xl border-2 max-w-2xl ${getCharacterColor(element.character || '', characterColors)}`}>
                  {editingId === element.id ? (
                    <textarea
                      value={element.text}
                      onChange={(e) => handleEdit(element.id, 'text', e.target.value)}
                      onBlur={() => setEditingId(null)}
                      autoFocus
                      rows={3}
                      className="w-full bg-transparent border-none outline-none resize-none"
                    />
                  ) : (
                    <div 
                      onClick={() => setEditingId(element.id)}
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                    >
                      {element.text}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
