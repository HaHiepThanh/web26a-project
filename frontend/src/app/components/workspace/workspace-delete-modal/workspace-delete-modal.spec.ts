import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WorkspaceDeleteModal } from './workspace-delete-modal';
import { WorkspaceItem } from '../../../mocks';

describe('WorkspaceDeleteModal', () => {
  let component: WorkspaceDeleteModal;
  let fixture: ComponentFixture<WorkspaceDeleteModal>;

  const mockWorkspace: WorkspaceItem = {
    id: 'ws-123',
    name: 'Frontend Core',
    description: 'Core project frontend',
    membersCount: 1,
    members: [],
    boards: [],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkspaceDeleteModal],
    }).compileComponents();

    fixture = TestBed.createComponent(WorkspaceDeleteModal);
    component = fixture.componentInstance;
  });

  it('khởi tạo với canDelete = false khi chưa gõ tên workspace', () => {
    fixture.componentRef.setInput('isOpen', true);
    fixture.componentRef.setInput('workspace', mockWorkspace);
    fixture.detectChanges();

    expect(component.expectedName()).toBe('Frontend Core');
    expect(component.canDelete()).toBe(false);
  });

  it('khoá nút xoá nếu gõ sai chính tả / thiếu ký tự / sai hoa thường', () => {
    fixture.componentRef.setInput('isOpen', true);
    fixture.componentRef.setInput('workspace', mockWorkspace);
    fixture.detectChanges();

    component.typed.set('frontend core');
    expect(component.canDelete()).toBe(false);

    component.typed.set('Frontend Core ');
    expect(component.canDelete()).toBe(false);

    component.typed.set('Frontend');
    expect(component.canDelete()).toBe(false);
  });

  it('cho phép xoá khi gõ chính xác 100% tên workspace', () => {
    fixture.componentRef.setInput('isOpen', true);
    fixture.componentRef.setInput('workspace', mockWorkspace);
    fixture.detectChanges();

    component.typed.set('Frontend Core');
    expect(component.canDelete()).toBe(true);
  });

  it('submit() phát sự kiện confirm khi gõ đúng và không trong trạng thái deleting', () => {
    fixture.componentRef.setInput('isOpen', true);
    fixture.componentRef.setInput('workspace', mockWorkspace);
    fixture.detectChanges();

    let confirmed = false;
    component.confirm.subscribe(() => {
      confirmed = true;
    });

    component.typed.set('Frontend Core');
    component.submit();
    expect(confirmed).toBe(true);
  });

  it('submit() KHÔNG phát sự kiện nếu đang deleting', () => {
    fixture.componentRef.setInput('isOpen', true);
    fixture.componentRef.setInput('workspace', mockWorkspace);
    fixture.componentRef.setInput('deleting', true);
    fixture.detectChanges();

    let confirmed = false;
    component.confirm.subscribe(() => {
      confirmed = true;
    });

    component.typed.set('Frontend Core');
    component.submit();
    expect(confirmed).toBe(false);
  });

  it('requestCancel() phát cancel khi không deleting', () => {
    let cancelled = false;
    component.cancel.subscribe(() => {
      cancelled = true;
    });

    component.requestCancel();
    expect(cancelled).toBe(true);
  });
});
