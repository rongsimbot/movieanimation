import { MovieProject } from '../types';

const STORAGE_KEY = 'movie_animation_projects';

export const storageService = {
  saveProject: (project: MovieProject) => {
    const projects = storageService.getAllProjects();
    const index = projects.findIndex(p => p.id === project.id);
    if (index >= 0) {
      projects[index] = project;
    } else {
      projects.push(project);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  },

  getAllProjects: (): MovieProject[] => {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  },

  getProjectById: (id: string): MovieProject | undefined => {
    const projects = storageService.getAllProjects();
    return projects.find(p => p.id === id);
  },

  deleteProject: (id: string) => {
    const projects = storageService.getAllProjects();
    const filtered = projects.filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  }
};
