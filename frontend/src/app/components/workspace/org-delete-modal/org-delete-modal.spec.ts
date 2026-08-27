import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OrgDeleteModal } from './org-delete-modal';
import { Organization } from '../../../models';

describe('OrgDeleteModal', () => {
  let component: OrgDeleteModal;
  let fixture: ComponentFixture<OrgDeleteModal>;

  const mockOrg: Organization = {
    id: 'org-123',
    name: 'Horizon Team',
    slug: 'horizon-team',
    ownerId: 'user-1',
    memberIds: ['user-1', 'user-2'],
    createdAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrgDeleteModal],
    }).compileComponents();

    fixture = TestBed.createComponent(OrgDeleteModal);
    component = fixture.componentInstance;
  });

  it('khởi tạo với canDelete = false khi chưa gõ tên', () => {
    fixture.componentRef.setInput('isOpen', true);
    fixture.componentRef.setInput('org', mockOrg);
    fixture.detectChanges();

    expect(component.expectedName()).toBe('Horizon Team');
    expect(component.memberCount()).toBe(2);
    expect(component.canDelete()).toBe(false);
  });

  it('khoá nút xoá nếu gõ sai chính tả / thiếu ký tự / sai hoa thường', () => {
    fixture.componentRef.setInput('isOpen', true);
    fixture.componentRef.setInput('org', mockOrg);
    fixture.detectChanges();

    component.typed.set('horizon team');
    expect(component.canDelete()).toBe(false);

    component.typed.set('Horizon Team ');
    expect(component.canDelete()).toBe(false);

    component.typed.set('Horizon');
    expect(component.canDelete()).toBe(false);
  });

  it('cho phép xoá khi gõ chính xác 100% tên tổ chức', () => {
    fixture.componentRef.setInput('isOpen', true);
    fixture.componentRef.setInput('org', mockOrg);
    fixture.detectChanges();

    component.typed.set('Horizon Team');
    expect(component.canDelete()).toBe(true);
  });

  it('submit() phát sự kiện confirm khi gõ đúng và không trong trạng thái deleting', () => {
    fixture.componentRef.setInput('isOpen', true);
    fixture.componentRef.setInput('org', mockOrg);
    fixture.detectChanges();

    let confirmed = false;
    component.confirm.subscribe(() => {
      confirmed = true;
    });

    component.typed.set('Horizon Team');
    component.submit();
    expect(confirmed).toBe(true);
  });

  it('submit() KHÔNG phát sự kiện nếu đang deleting', () => {
    fixture.componentRef.setInput('isOpen', true);
    fixture.componentRef.setInput('org', mockOrg);
    fixture.componentRef.setInput('deleting', true);
    fixture.detectChanges();

    let confirmed = false;
    component.confirm.subscribe(() => {
      confirmed = true;
    });

    component.typed.set('Horizon Team');
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
