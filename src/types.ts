export interface Character {
  id: string;
  name: string;
  description: string;
  voiceId?: string;
}

export interface Scene {
  id: string;
  title: string;
  description: string;
  characters: string[]; // IDs
  animationStyle: string;
}

export interface Chapter {
  id: string;
  title: string;
  scenes: Scene[];
}

export interface MovieProject {
  id: string;
  title: string;
  originalScript: string;
  editableScript: string;
  characters: Character[];
  chapters: Chapter[];
  status: 'draft' | 'processing' | 'rendered';
}

export interface SampleMovie {
  id: string;
  title: string;
  thumbnail: string;
  category: string;
}
