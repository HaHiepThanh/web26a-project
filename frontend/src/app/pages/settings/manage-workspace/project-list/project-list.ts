import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProjectSummary, mockProjects, roleLabel } from '../manage-workspace.models';

/** Screen 1 — danh sách các dự án (board) mà user hiện tại đang tham gia. */
@Component({
  selector: 'app-project-list',
  imports: [RouterLink],
  templateUrl: './project-list.html',
  styleUrl: './project-list.css',
})
export class ProjectList {
  readonly roleLabel = roleLabel;
  readonly roleBadge: Record<string, string> = {
    admin: 'badge-primary badge-soft',
    member: 'badge-success badge-soft',
    observer: 'badge-ghost',
  };
  readonly searchQuery = signal('');
  private readonly projects = signal<ProjectSummary[]>(mockProjects());

  readonly filteredProjects = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.projects();
    return this.projects().filter(
      (p) => p.name.toLowerCase().includes(q) || p.workspaceName.toLowerCase().includes(q),
    );
  });

  trackById = (_: number, item: ProjectSummary) => item.id;
}
