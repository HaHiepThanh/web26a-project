import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ListDeleteModal } from './list-delete-modal';
import { List } from '../../../models';

describe('ListDeleteModal', () => {
  let component: ListDeleteModal;
  let fixture: ComponentFixture<ListDeleteModal>;

  const mockList: List = {
    id: 'list-1',
    orgId: 'org-1',
    boardId: 'board-1',
    name: 'To Do',
    position: 0,
    createdAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListDeleteModal],
    }).compileComponents();

    fixture = TestBed.createComponent(ListDeleteModal);
    component = fixture.componentInstance;
  });

  it('không render gì khi isOpen = false', () => {
    fixture.componentRef.setInput('isOpen', false);
    fixture.componentRef.setInput('list', mockList);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.modal')).toBeNull();
  });

  it('render modal khi isOpen = true và list được cung cấp', () => {
    fixture.componentRef.setInput('isOpen', true);
    fixture.componentRef.setInput('list', mockList);
    fixture.componentRef.setInput('cardsCount', 3);
    fixture.detectChanges();

    const modal = fixture.nativeElement.querySelector('.modal');
    expect(modal).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('To Do');
    expect(fixture.nativeElement.textContent).toContain('3');
  });

  it('phát sự kiện confirm khi gọi onConfirm()', () => {
    fixture.componentRef.setInput('isOpen', true);
    fixture.componentRef.setInput('list', mockList);
    fixture.detectChanges();

    let confirmedList: List | null = null;
    component.confirm.subscribe((l) => {
      confirmedList = l;
    });

    component.onConfirm();
    expect(confirmedList).toEqual(mockList);
  });

  it('không phát sự kiện confirm khi deleting = true', () => {
    fixture.componentRef.setInput('isOpen', true);
    fixture.componentRef.setInput('list', mockList);
    fixture.componentRef.setInput('deleting', true);
    fixture.detectChanges();

    let confirmed = false;
    component.confirm.subscribe(() => {
      confirmed = true;
    });

    component.onConfirm();
    expect(confirmed).toBe(false);
  });

  it('phát sự kiện cancel khi click backdrop hoặc bấm nút Cancel', () => {
    fixture.componentRef.setInput('isOpen', true);
    fixture.componentRef.setInput('list', mockList);
    fixture.detectChanges();

    let cancelled = false;
    component.cancel.subscribe(() => {
      cancelled = true;
    });

    component.onBackdropClick();
    expect(cancelled).toBe(true);
  });
});
