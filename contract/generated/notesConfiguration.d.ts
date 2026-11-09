export interface NotesConfiguration {
  notesFile?: NotesFile | null;
  showHeading: boolean;
}
export interface NotesFile {
  directory: string;
  filename: string;
}
