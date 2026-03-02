export interface Chapter {
  id: string;
  title: string;
  objectives: Objective[];
}

export interface Objective {
  id: string;
  description: string;
  completed: boolean;
  triggers: Trigger[];
}

export interface Trigger {
  type: "command" | "file_read" | "directory_visit" | "custom";
  condition: string;
}
